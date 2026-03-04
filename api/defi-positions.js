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
const CACHE_KEY_PREFIX = 'debank_last:';

async function getDebankCache(wallet) {
  try {
    const { redisGet } = require('../lib/redis');
    const cached = await redisGet(CACHE_KEY_PREFIX + wallet);
    return cached && typeof cached === 'object' && Array.isArray(cached.positions) ? cached : null;
  } catch {
    return null;
  }
}

async function setDebankCache(wallet, rawPositions) {
  try {
    const { redisSet } = require('../lib/redis');
    await redisSet(CACHE_KEY_PREFIX + wallet, {
      positions: rawPositions,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

function buildMergedPosition(p, id, manual, nowSec, lastUpdateDate) {
  const manualOpenedAt = manual?.openedAt ?? manual?.opened_at_manual ?? null;
  const manualInitialUsd = manual?.initialDepositUsd ?? manual?.initial_deposit_usd ?? null;
  const withdrawnUsd = manual?.withdrawnUsd ?? 0;
  const manualClosedAt = manual?.closedAt ?? null;
  const status = (manual?.status || 'open').toLowerCase();
  const statusVal = (status === 'close' || status === 'closed') ? 'close' : 'open';
  let daysOpen = null;
  if (manualOpenedAt) {
    const dateStr = String(manualOpenedAt).slice(0, 10);
    const openSec = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
    let endSec = nowSec;
    if (statusVal === 'close' && manualClosedAt) {
      const closeStr = String(manualClosedAt).slice(0, 10);
      endSec = Math.floor(new Date(closeStr + 'T00:00:00Z').getTime() / 1000);
    }
    daysOpen = Math.max(0, Math.floor((endSec - openSec) / SEC_PER_DAY));
  }
  const totalUsd = manual?.currentValueUsd ?? p.total_usd ?? 0;
  const totalWithValue = (statusVal === 'close')
    ? (withdrawnUsd || 0)
    : totalUsd + (withdrawnUsd || 0);
  let profitUsd = null;
  let roiPercent = null;
  let aprPercent = null;
  if (manualInitialUsd != null && manualInitialUsd > 0) {
    profitUsd = totalWithValue - manualInitialUsd;
    roiPercent = (totalWithValue / manualInitialUsd - 1) * 100;
    // Для закрытых позиций считаем реализованный APR сделки на основе дат открытия/закрытия и суммы вывода
    if (statusVal === 'close' && manualOpenedAt && manualClosedAt) {
      const openStr = String(manualOpenedAt).slice(0, 10);
      const closeStr = String(manualClosedAt).slice(0, 10);
      const openMs = new Date(openStr + 'T00:00:00Z').getTime();
      const closeMs = new Date(closeStr + 'T00:00:00Z').getTime();
      if (!Number.isNaN(openMs) && !Number.isNaN(closeMs) && closeMs > openMs) {
        const days = Math.max(1, Math.floor((closeMs - openMs) / (SEC_PER_DAY * 1000)));
        const roi = (withdrawnUsd || 0) / manualInitialUsd - 1;
        aprPercent = roi * (365 / days) * 100;
      }
    }
  }
  return {
    ...p,
    wallet: id,
    total_usd: totalUsd,
    manualOpenedAt: manualOpenedAt || null,
    manualClosedAt: manualClosedAt || null,
    manualInitialUsd: manualInitialUsd ?? null,
    withdrawnUsd: withdrawnUsd ?? 0,
    status: statusVal,
    daysOpen,
    profitUsd,
    roiPercent,
    aprPercent,
    lastUpdateDate,
    fromManualOnly: false,
  };
}

async function getManualRecord(wallet, pos) {
  try {
    const { redisGet } = require('../lib/redis');
    const k = makeManualKey(wallet, pos.chain, pos.protocol_id, pos.position_key);
    return await redisGet(k);
  } catch {
    return null;
  }
}

async function getFullyManualPositions(wallet) {
  const { redisGet, redisKeys } = require('../lib/redis');
  const prefix = `manual:${wallet}:`;
  const keys = await redisKeys(prefix + '*');
  const positions = [];
  for (const key of keys) {
    const parsed = parseManualKey(key);
    if (!parsed) continue;
    const manual = await redisGet(key);
    if (!manual || typeof manual !== 'object') continue;

    const isFullyManual = manual.isFullyManual === true;
    const status = (manual.status || 'open').toLowerCase();
    const statusVal = (status === 'close' || status === 'closed') ? 'close' : 'open';

    if (!isFullyManual && statusVal !== 'close') continue;

    const manualOpenedAt = manual?.openedAt ?? manual?.opened_at_manual ?? null;
    const manualClosedAt = manual?.closedAt ?? null;
    const manualInitialUsd = manual?.initialDepositUsd ?? manual?.initial_deposit_usd ?? null;
    const withdrawnUsd = manual?.withdrawnUsd ?? 0;
    const currentValueUsd = manual?.currentValueUsd ?? 0;
    const protocolName = manual?.protocolName || parsed.protocolId;
    const tokenSymbol = manual?.tokenSymbol || null;
    const description = manual?.description || null;

    positions.push({
      wallet,
      chain: parsed.chain,
      protocol_id: parsed.protocolId,
      protocol_name: protocolName,
      protocol_logo_url: null,
      protocol_site_url: null,
      position_type: 'other',
      position_name: protocolName,
      position_key: parsed.positionKey,
      tokens: tokenSymbol ? [{ symbol: tokenSymbol, amount: 0, amount_usd: currentValueUsd }] : [],
      total_usd: currentValueUsd,
      manualOpenedAt: manualOpenedAt || null,
      manualClosedAt: manualClosedAt || null,
      manualInitialUsd: manualInitialUsd ?? null,
      withdrawnUsd: withdrawnUsd ?? 0,
      currentValueUsd: currentValueUsd,
      tokenSymbol: tokenSymbol,
      description: description,
      status: statusVal,
      daysOpen: null,
      profitUsd: null,
      roiPercent: null,
      aprPercent: null,
      lastUpdateDate: null,
      fromManualOnly: true,
      isFullyManual: isFullyManual,
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
      positions.push(buildMergedPosition(p, id, manual, nowSec, lastUpdateDate));
    }

    const disappearedKeySet = new Set();
    const cache = await getDebankCache(id);
    if (cache && Array.isArray(cache.positions)) {
      for (const p of cache.positions) {
        const key = `${p.chain}:${p.protocol_id}:${p.position_key}`;
        if (debankKeySet.has(key)) continue;
        disappearedKeySet.add(key);
        const manual = await getManualRecord(id, p);
        const merged = buildMergedPosition(p, id, manual, nowSec, lastUpdateDate);
        merged.debankGone = true;
        merged.fromManualOnly = !manual;
        positions.push(merged);
      }
    }
    setDebankCache(id, rawPositions);

    const fullyManualPositions = await getFullyManualPositions(id);
    for (const mp of fullyManualPositions) {
      const key = `${mp.chain}:${mp.protocol_id}:${mp.position_key}`;
      if (debankKeySet.has(key) || disappearedKeySet.has(key)) continue;
      const isClosed = (mp.status || 'open').toLowerCase() === 'close';
      const totalWithValue = isClosed
        ? (mp.withdrawnUsd || 0)
        : (mp.total_usd || 0) + (mp.withdrawnUsd || 0);
      if (mp.manualInitialUsd != null && mp.manualInitialUsd > 0) {
        mp.profitUsd = totalWithValue - mp.manualInitialUsd;
        mp.roiPercent = (totalWithValue / mp.manualInitialUsd - 1) * 100;
        if (mp.manualOpenedAt) {
          const openStr = String(mp.manualOpenedAt).slice(0, 10);
          const openSec = Math.floor(new Date(openStr + 'T00:00:00Z').getTime() / 1000);
          let endSec = nowSec;
          if (isClosed && mp.manualClosedAt) {
            const closeStr = String(mp.manualClosedAt).slice(0, 10);
            endSec = Math.floor(new Date(closeStr + 'T00:00:00Z').getTime() / 1000);
          }
          mp.daysOpen = Math.max(0, Math.floor((endSec - openSec) / SEC_PER_DAY));
          if (isClosed && mp.manualClosedAt) {
            const openMs = openSec * 1000;
            const closeMs = endSec * 1000;
            if (closeMs > openMs) {
              const days = Math.max(1, Math.floor((closeMs - openMs) / (SEC_PER_DAY * 1000)));
              const roi = (mp.withdrawnUsd || 0) / mp.manualInitialUsd - 1;
              mp.aprPercent = roi * (365 / days) * 100;
            }
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
