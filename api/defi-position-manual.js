/**
 * POST /api/defi-position-manual
 * Сохраняет ручные значения с merge — никогда не затирает существующие поля.
 * Ключ Redis: manual:{wallet}:{chain}:{protocolId}:{positionKey}
 * Значение: { openedAt, initialDepositUsd }
 */

const { redisGet, redisSet } = require('../lib/redis');
const { makeManualKey } = require('../lib/position-key');

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

  console.log('MANUAL_SAVE_REQUEST', body);

  const wallet = (body.wallet || '').trim().toLowerCase();
  const chain = (body.chain || '').trim();
  const protocolId = (body.protocol_id || body.protocolId || '').trim();
  const positionKey = (body.position_key || body.positionKey || 'default').trim();

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }
  if (!chain || !protocolId) {
    return res.status(400).json({ error: 'chain and protocolId required' });
  }

  const key = makeManualKey(wallet, chain, protocolId, positionKey);

  let openedAt = body.openedAt;
  if (openedAt !== undefined) {
    const s = String(openedAt).trim();
    openedAt = s === '' ? null : s;
  }

  let initialDepositUsd = body.initialDepositUsd;
  if (initialDepositUsd !== undefined) {
    initialDepositUsd = (initialDepositUsd != null && !isNaN(Number(initialDepositUsd)))
      ? Number(initialDepositUsd) : null;
  }

  try {
    const existing = await redisGet(key);
    const parsed = (existing && typeof existing === 'object') ? { ...existing } : {};

    const updated = { ...parsed };
    if (openedAt !== undefined) updated.openedAt = openedAt;
    if (initialDepositUsd !== undefined) updated.initialDepositUsd = initialDepositUsd;

    await redisSet(key, updated);
    console.log('MANUAL_SAVE_STORED', key, updated);

    return res.status(200).json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Redis storage unavailable', detail: err.message });
  }
};
