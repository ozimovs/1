/**
 * Debug: проверка чтения ручных данных из Redis/KV.
 * GET /api/defi-debug?wallet=0x...&chain=manta&protocol_id=manta_izumi&position_type=lp&position_key=0x19b683a2f45012318d9b2ae1280d68d3ec54d663
 */
const { makePositionKvKey } = require('../lib/position-key');
const { redisGet } = require('../lib/redis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const wallet = (req.query.wallet || '').trim().toLowerCase();
  const chain = (req.query.chain || '').trim();
  const protocolId = (req.query.protocol_id || '').trim();
  const positionType = (req.query.position_type || '').trim();
  const positionKey = (req.query.position_key || 'default').trim();

  if (!wallet || !chain || !protocolId || !positionType) {
    return res.status(400).json({ error: 'wallet, chain, protocol_id, position_type required' });
  }

  const key = makePositionKvKey(wallet, chain, protocolId, positionType, positionKey);
  const backend = process.env.KV_REST_API_URL ? 'kv' : (process.env.REDIS_URL ? 'redis' : 'none');
  let data = null;
  try {
    data = await redisGet(key);
  } catch (e) {
    return res.status(500).json({ key, backend, error: e.message });
  }
  return res.status(200).json({ key, backend, hasManualData: !!data, data });
};
