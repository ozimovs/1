/**
 * Серверный endpoint: DeFi позиции по протоколам.
 * Использует DeBank /v1/user/all_complex_protocol_list.
 * process.env.DEBANK_API_KEY только на сервере.
 *
 * PortfolioItemObject: name, detail_types, detail.supply_token_list,
 * detail.reward_token_list, detail.borrow_token_list, stats.net_usd_value
 */

const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

function mapPositionType(name, detailTypes) {
  const n = (name || '').toLowerCase();
  const types = Array.isArray(detailTypes) ? detailTypes.map((t) => t.toLowerCase()) : [];
  if (types.includes('lending')) return 'lending';
  if (types.includes('locked')) return 'stake';
  if (types.includes('leveraged_farming')) return 'lp';
  if (n.includes('lending') || n === 'lending') return 'lending';
  if (n.includes('borrow') || n === 'borrow') return 'borrow';
  if (n.includes('farm') || n === 'farming') return 'lp';
  if (n.includes('liquidity') || n.includes('pool')) return 'lp';
  if (n.includes('stake') || n.includes('locked') || n === 'staked') return 'stake';
  if (n.includes('deposit') || n === 'yield') return 'lending';
  if (n.includes('vest') || n === 'rewards') return 'stake';
  return n || 'other';
}

function flattenPositions(protocolList) {
  const positions = [];
  if (!Array.isArray(protocolList)) return positions;

  for (const proto of protocolList) {
    const protocolId = proto.id || '';
    const protocolName = proto.name || protocolId || '—';
    const chain = proto.chain || '';
    const logoUrl = proto.logo_url || null;

    const items = proto.portfolio_item_list || [];
    for (const item of items) {
      const netUsd = item.stats?.net_usd_value ?? 0;
      if (netUsd < 0.01) continue;

      const detail = item.detail || {};
      const supplyList = detail.supply_token_list || [];
      const rewardList = detail.reward_token_list || [];
      const borrowList = detail.borrow_token_list || [];

      const tokens = [];
      for (const tok of [...supplyList, ...rewardList]) {
        const amount = tok.amount ?? 0;
        const price = tok.price ?? 0;
        const amountUsd = amount * price;
        if (amountUsd < 0.01) continue;
        tokens.push({
          symbol: tok.optimized_symbol || tok.symbol || tok.name || '?',
          amount,
          amount_usd: amountUsd,
        });
      }
      for (const tok of borrowList) {
        const amount = tok.amount ?? 0;
        const price = tok.price ?? 0;
        const amountUsd = amount * price;
        tokens.push({
          symbol: (tok.optimized_symbol || tok.symbol || tok.name || '?') + ' (debt)',
          amount,
          amount_usd: -amountUsd,
        });
      }

      const positionType = mapPositionType(item.name, item.detail_types);

      positions.push({
        protocol_id: protocolId,
        protocol_name: protocolName,
        protocol_logo_url: logoUrl,
        chain,
        position_type: positionType,
        position_name: item.name || '—',
        tokens,
        total_usd: netUsd,
      });
    }
  }

  return positions.sort((a, b) => b.total_usd - a.total_usd);
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

  const id = (req.query.id || req.query.addr || req.query.address || '')
    .trim()
    .toLowerCase();
  if (!id || !/^0x[a-f0-9]{40}$/.test(id)) {
    return res.status(400).json({ error: 'Valid wallet address required (id, addr or address)' });
  }

  const url = `${DEBANK_BASE}/user/all_complex_protocol_list?id=${encodeURIComponent(id)}`;
  const headers = { Accept: 'application/json', AccessKey: apiKey };

  try {
    const response = await fetch(url, { headers });
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: 'DeBank API temporarily unavailable',
        detail: 'Unexpected response format',
      });
    }

    if (!response.ok) return res.status(response.status).json(data);

    const protocolList = Array.isArray(data) ? data : [];
    const positions = flattenPositions(protocolList);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(positions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
