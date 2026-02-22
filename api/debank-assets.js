/**
 * Серверный endpoint: объединяет all_token_list + all_complex_protocol_list.
 * Возвращает токены с полями: protocol_name, opened_at, days_open.
 * Использует process.env.DEBANK_API_KEY только на сервере.
 *
 * DeBank endpoints:
 * - /v1/user/all_token_list — токены, баланс, USD, protocol_id
 * - /v1/user/all_complex_protocol_list — позиции в протоколах (name, supply_token_list с time_at)
 *
 * opened_at — ПРИБЛИЗИТЕЛЬНАЯ оценка: берётся time_at из supply_token_list/reward_token_list
 * в all_complex_protocol_list (время первого появления в протоколе). Если нет — time_at из токена.
 * days_open вычисляется от opened_at до текущего времени.
 */

const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

function extractTokenProtocolMap(protocolList) {
  const map = new Map(); // key: "chain:tokenId" -> { protocol_id, protocol_name, time_at }
  if (!Array.isArray(protocolList)) return map;

  for (const proto of protocolList) {
    const protocolId = proto.id || '';
    const protocolName = proto.name || protocolId || '—';
    const chain = proto.chain || '';

    const items = proto.portfolio_item_list || [];
    for (const item of items) {
      const detail = item.detail || {};
      const supplyTokens = detail.supply_token_list || [];
      const rewardTokens = detail.reward_token_list || [];
      for (const tok of [...supplyTokens, ...rewardTokens]) {
        const tokenId = (tok.id || '').toLowerCase();
        if (!tokenId) continue;
        const timeAt = tok.time_at || item.update_at;
        const key = `${chain}:${tokenId}`;
        const existing = map.get(key);
        if (!existing || (timeAt && (!existing.time_at || timeAt < existing.time_at))) {
          map.set(key, {
            protocol_id: tok.protocol_id || protocolId,
            protocol_name: protocolName,
            time_at: timeAt || existing?.time_at,
          });
        }
      }
    }
  }
  return map;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DEBANK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const id = (req.query.id || req.query.addr || '').trim().toLowerCase();
  if (!id || !/^0x[a-f0-9]{40}$/.test(id)) {
    return res.status(400).json({ error: 'Valid wallet address required (id or addr)' });
  }

  const headers = { Accept: 'application/json', AccessKey: apiKey };
  const tokensUrl = `${DEBANK_BASE}/user/all_token_list?id=${encodeURIComponent(id)}&is_all=false`;
  const protocolUrl = `${DEBANK_BASE}/user/all_complex_protocol_list?id=${encodeURIComponent(id)}`;

  try {
    const [tokensRes, protocolRes] = await Promise.all([
      fetch(tokensUrl, { headers }),
      fetch(protocolUrl, { headers }),
    ]);

    const tokensText = await tokensRes.text();
    const protocolText = await protocolRes.text();

    let tokens, protocolList;
    try {
      tokens = JSON.parse(tokensText);
      protocolList = JSON.parse(protocolText);
    } catch {
      return res.status(502).json({
        error: 'DeBank API temporarily unavailable',
        detail: 'Unexpected response format',
      });
    }

    if (!tokensRes.ok) return res.status(tokensRes.status).json(tokens);
    if (!protocolRes.ok) protocolList = [];

    const tokenList = Array.isArray(tokens) ? tokens : [];
    const protocolArray = Array.isArray(protocolList) ? protocolList : [];
    const tokenProtocolMap = extractTokenProtocolMap(protocolArray);

    const nowSec = Math.floor(Date.now() / 1000);
    const SEC_PER_DAY = 86400;

    const enriched = tokenList.map((tok) => {
      const chain = tok.chain || '';
      const tokenId = (tok.id || '').toLowerCase();
      const key = `${chain}:${tokenId}`;
      const info = tokenProtocolMap.get(key);
      const protocolName = info?.protocol_name || (tok.protocol_id && tok.protocol_id !== '' ? tok.protocol_id : '—');
      const timeAt = info?.time_at ?? tok.time_at ?? null;
      const openedAt = timeAt ? new Date(timeAt * 1000).toISOString().slice(0, 10) : null;
      const daysOpen = timeAt ? Math.floor((nowSec - timeAt) / SEC_PER_DAY) : null;

      return {
        ...tok,
        protocol_id: info?.protocol_id ?? tok.protocol_id ?? '',
        protocol_name: protocolName,
        opened_at: openedAt,
        days_open: daysOpen,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(enriched);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
