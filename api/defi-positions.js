/**
 * DeFi позиции по кошельку. DeBank + ручные данные из Redis.
 * Ключ Redis: manual:{wallet}:{chain}:{protocolId}:{positionKey}
 */

const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';
const SEC_PER_DAY = 86400;

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

function makePositionKey(item) {
  const pk = item.pool?.id || item.position_index || 'default';
  return String(pk).replace(/[^a-zA-Z0-9:_.-]/g, '_');
}

function flattenPositions(protocolList) {
  const positions = [];
  if (!Array.isArray(protocolList)) return positions;

  for (const proto of protocolList) {
    const protocolId = proto.id || '';
    const protocolName = proto.name || protocolId || '—';
    const chain = proto.chain || '';
    const logoUrl = proto.logo_url || null;
    const siteUrl = proto.site_url || null;

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
      const positionKey = makePositionKey(item);

      positions.push({
        wallet: null,
        chain,
        protocol_id: protocolId,
        protocol_name: protocolName,
        protocol_logo_url: logoUrl,
        protocol_site_url: siteUrl,
        position_type: positionType,
        position_name: item.name || '—',
        position_key: positionKey,
        tokens,
        total_usd: netUsd,
      });
    }
  }

  return positions.sort((a, b) => b.total_usd - a.total_usd);
}

const { makeManualKey, parseManualKey } = require('../lib/position-key');

async function getManualRecord(wallet, pos) {
  try {
    const { redisGet } = require('../lib/redis');
    const k = makeManualKey(wallet, pos.chain, pos.protocol_id, pos.position_key);
    return await redisGet(k);
  } catch {
    return null;
  }
}

async function getManualOnlyClosedPositions(wallet) {
  const { redisGet, redisKeys } = require('../lib/redis');
  const prefix = `manual:${wallet}:`;
  const keys = await redisKeys(prefix + '*');
  const positions = [];
  for (const key of keys) {
    const parsed = parseManualKey(key);
    if (!parsed) continue;
    const manual = await redisGet(key);
    if (!manual || typeof manual !== 'object') continue;
    const status = (manual.status || 'open').toLowerCase();
    if (status !== 'close' && status !== 'closed') continue;
    const manualOpenedAt = manual?.openedAt ?? manual?.opened_at_manual ?? null;
    const manualInitialUsd = manual?.initialDepositUsd ?? manual?.initial_deposit_usd ?? null;
    const withdrawnUsd = manual?.withdrawnUsd ?? null;
    positions.push({
      wallet,
      chain: parsed.chain,
      protocol_id: parsed.protocolId,
      protocol_name: parsed.protocolId,
      protocol_logo_url: null,
      protocol_site_url: null,
      position_type: 'other',
      position_name: parsed.protocolId,
      position_key: parsed.positionKey,
      tokens: [],
      total_usd: 0,
      manualOpenedAt: manualOpenedAt || null,
      manualInitialUsd: manualInitialUsd ?? null,
      withdrawnUsd: withdrawnUsd ?? 0,
      status: 'close',
      daysOpen: null,
      profitUsd: null,
      roiPercent: null,
      apyPercent: null,
      lastUpdateDate: null,
      fromManualOnly: true,
    });
  }
  return positions;
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
    const rawPositions = flattenPositions(protocolList);
    const nowSec = Math.floor(Date.now() / 1000);
    const lastUpdateDate = new Date().toISOString().slice(0, 10);

    const debankKeySet = new Set();
    for (const p of rawPositions) {
      debankKeySet.add(`${p.chain}:${p.protocol_id}:${p.position_key}`);
    }

    const positions = [];
    for (const p of rawPositions) {
      const manual = await getManualRecord(id, p);
      const manualOpenedAt = manual?.openedAt ?? manual?.opened_at_manual ?? null;
      const manualInitialUsd = manual?.initialDepositUsd ?? manual?.initial_deposit_usd ?? null;
      const withdrawnUsd = manual?.withdrawnUsd ?? 0;
      const status = (manual?.status || 'open').toLowerCase();
      const statusVal = (status === 'close' || status === 'closed') ? 'close' : 'open';

      let daysOpen = null;
      if (manualOpenedAt) {
        const dateStr = String(manualOpenedAt).slice(0, 10);
        const effectiveSec = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
        daysOpen = Math.max(0, Math.floor((nowSec - effectiveSec) / SEC_PER_DAY));
      }

      const totalWithValue = p.total_usd + (withdrawnUsd || 0);
      let profitUsd = null;
      let roiPercent = null;
      let apyPercent = null;
      if (manualInitialUsd != null && manualInitialUsd > 0) {
        profitUsd = totalWithValue - manualInitialUsd;
        roiPercent = (totalWithValue / manualInitialUsd - 1) * 100;
        if (daysOpen != null && daysOpen >= 1) {
          const roi = totalWithValue / manualInitialUsd - 1;
          apyPercent = ((1 + roi) ** (365 / daysOpen) - 1) * 100;
        }
      }

      positions.push({
        ...p,
        wallet: id,
        manualOpenedAt: manualOpenedAt || null,
        manualInitialUsd: manualInitialUsd ?? null,
        withdrawnUsd: withdrawnUsd ?? 0,
        status: statusVal,
        daysOpen,
        profitUsd,
        roiPercent,
        apyPercent,
        lastUpdateDate,
        fromManualOnly: false,
      });
    }

    const manualOnlyClosed = await getManualOnlyClosedPositions(id);
    for (const mp of manualOnlyClosed) {
      const key = `${mp.chain}:${mp.protocol_id}:${mp.position_key}`;
      if (debankKeySet.has(key)) continue;
      const totalWithValue = (mp.total_usd || 0) + (mp.withdrawnUsd || 0);
      if (mp.manualInitialUsd != null && mp.manualInitialUsd > 0) {
        mp.profitUsd = totalWithValue - mp.manualInitialUsd;
        mp.roiPercent = (totalWithValue / mp.manualInitialUsd - 1) * 100;
        if (mp.manualOpenedAt) {
          const dateStr = String(mp.manualOpenedAt).slice(0, 10);
          const effectiveSec = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
          const days = Math.max(0, Math.floor((nowSec - effectiveSec) / SEC_PER_DAY));
          mp.daysOpen = days;
          if (days >= 1) {
            const roi = totalWithValue / mp.manualInitialUsd - 1;
            mp.apyPercent = ((1 + roi) ** (365 / days) - 1) * 100;
          }
        }
      }
      mp.lastUpdateDate = lastUpdateDate;
      positions.push(mp);
    }

    res.setHeader('Cache-Control', 's-maxage=0, no-store, must-revalidate');
    return res.status(200).json(positions);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
