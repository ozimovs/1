/**
 * POST /api/defi-position-manual
 * Сохраняет ручные значения: openedAt (YYYY-MM-DD), initialDepositUsd.
 * Один простой формат от фронта до Redis.
 */

const { redisGet, redisSet } = require('../lib/redis');
const { makePositionKvKey } = require('../lib/position-key');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    const raw = req.body;
    if (typeof raw === 'string') body = JSON.parse(raw);
    else if (Buffer.isBuffer(raw)) body = JSON.parse(raw.toString());
    else body = raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const wallet = (body.wallet || '').trim().toLowerCase();
  const chain = (body.chain || '').trim();
  const protocolId = (body.protocol_id || body.protocolId || '').trim();
  const positionType = (body.position_type || body.positionType || '').trim();
  const positionKey = (body.position_key || body.positionKey || 'default').trim();

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }
  if (!chain || !protocolId || !positionType) {
    return res.status(400).json({ error: 'chain, protocol_id, position_type required' });
  }

  const openedAt = (body.openedAt != null ? String(body.openedAt).trim() : '') || null;
  const initialDepositUsd = body.initialDepositUsd != null ? Number(body.initialDepositUsd) : null;
  const numInitial = (initialDepositUsd != null && !isNaN(initialDepositUsd)) ? initialDepositUsd : null;

  const kvKey = makePositionKvKey(wallet, chain, protocolId, positionType, positionKey);
  const record = {
    wallet,
    chain,
    protocol_id: protocolId,
    position_type: positionType,
    position_key: positionKey,
    openedAt,
    initialDepositUsd: numInitial,
  };

  try {
    const existing = await redisGet(kvKey);
    if (existing && existing.created_at) record.created_at = existing.created_at;
    else record.created_at = new Date().toISOString();
    record.updated_at = new Date().toISOString();

    await redisSet(kvKey, record);
    return res.status(200).json(record);
  } catch (err) {
    return res.status(500).json({ error: 'Redis storage unavailable', detail: err.message });
  }
};
