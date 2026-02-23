/**
 * POST /api/defi-position-manual
 * Сохраняет ручные значения для DeFi позиции в Redis/KV.
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
  const protocolId = (body.protocol_id || '').trim();
  const positionType = (body.position_type || '').trim();
  const positionKey = (body.position_key || 'default').trim();

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }
  if (!chain || !protocolId || !positionType) {
    return res.status(400).json({ error: 'chain, protocol_id, position_type required' });
  }

  const kvKey = makePositionKvKey(wallet, chain, protocolId, positionType, positionKey);

  let openedAtManual = body.opened_at_manual ?? body.openedAtManual ?? body.openedAt ?? null;
  if (openedAtManual !== null && openedAtManual !== undefined) {
    const s = String(openedAtManual).trim();
    openedAtManual = s === '' ? null : s;
  } else {
    openedAtManual = null;
  }
  if (openedAtManual) {
    if (!openedAtManual.endsWith('Z') && !openedAtManual.includes('+')) {
      openedAtManual = openedAtManual.includes('T') ? openedAtManual + 'Z' : openedAtManual + 'T00:00:00.000Z';
    }
  }

  console.log('SAVE_MANUAL_POSITION', { wallet, protocolId, positionKey, openedAtManual, initialDepositUsd: body.initial_deposit_usd });

  const initialDepositUsd = body.initial_deposit_usd;
  const numInitial = initialDepositUsd != null ? Number(initialDepositUsd) : null;

  const now = new Date().toISOString();
  const record = {
    wallet,
    chain,
    protocol_id: protocolId,
    position_type: positionType,
    position_key: positionKey,
    opened_at_manual: openedAtManual || null,
    initial_deposit_usd: numInitial != null && !isNaN(numInitial) ? numInitial : null,
    created_at: now,
    updated_at: now,
  };

  try {
    const existing = await redisGet(kvKey);
    if (existing && existing.created_at) record.created_at = existing.created_at;
    await redisSet(kvKey, record);
    const verify = await redisGet(kvKey);
    console.log('[defi-position-manual] Redis saved, read-back:', { kvKey, record, verify });
    return res.status(200).json(record);
  } catch (err) {
    console.error('[defi-position-manual] Redis error:', err.message);
    return res.status(500).json({ error: 'Redis storage unavailable', detail: err.message });
  }
};
