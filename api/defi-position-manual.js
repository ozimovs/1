/**
 * POST /api/defi-position-manual
 * Сохраняет ручные значения с merge — никогда не затирает существующие поля.
 * DELETE /api/defi-position-manual — удаляет ручную позицию.
 * Ключ Redis: manual:{wallet}:{chain}:{protocolId}:{positionKey}
 * Значение: { openedAt, closedAt, initialDepositUsd, withdrawnUsd, status, isFullyManual, protocolName, currentValueUsd, tokenSymbol, description }
 * status: "open" | "close"
 */

const { redisGet, redisSet, redisDel } = require('../lib/redis');
const { makeManualKey } = require('../lib/position-key');

function parseBody(req) {
  const raw = req.body;
  if (typeof raw === 'string') return JSON.parse(raw);
  if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString());
  return raw || {};
}

function extractKeyParams(body) {
  const wallet = (body.wallet || '').trim().toLowerCase();
  const chain = (body.chain || '').trim();
  const protocolId = (body.protocol_id || body.protocolId || '').trim();
  const positionKey = (body.position_key || body.positionKey || 'default').trim();
  return { wallet, chain, protocolId, positionKey };
}

async function handlePost(req, res) {
  let body;
  try {
    body = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.log('MANUAL_SAVE_REQUEST', body);

  const { wallet, chain, protocolId, positionKey } = extractKeyParams(body);

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

  let closedAt = body.closedAt;
  if (closedAt !== undefined) {
    const s = String(closedAt).trim();
    closedAt = s === '' ? null : s;
  }

  let initialDepositUsd = body.initialDepositUsd;
  if (initialDepositUsd !== undefined) {
    initialDepositUsd = (initialDepositUsd != null && !isNaN(Number(initialDepositUsd)))
      ? Number(initialDepositUsd) : null;
  }

  let withdrawnUsd = body.withdrawnUsd;
  if (withdrawnUsd !== undefined) {
    withdrawnUsd = (withdrawnUsd != null && !isNaN(Number(withdrawnUsd)))
      ? Number(withdrawnUsd) : null;
  }

  let currentValueUsd = body.currentValueUsd;
  if (currentValueUsd !== undefined) {
    currentValueUsd = (currentValueUsd != null && !isNaN(Number(currentValueUsd)))
      ? Number(currentValueUsd) : null;
  }

  let status = body.status;
  if (status !== undefined) {
    const s = String(status || '').trim().toLowerCase();
    status = (s === 'close' || s === 'closed') ? 'close' : 'open';
  }

  let isFullyManual = body.isFullyManual;
  if (isFullyManual !== undefined) {
    isFullyManual = Boolean(isFullyManual);
  }

  let protocolName = body.protocolName;
  if (protocolName !== undefined) {
    protocolName = String(protocolName || '').trim() || null;
  }

  let tokenSymbol = body.tokenSymbol;
  if (tokenSymbol !== undefined) {
    tokenSymbol = String(tokenSymbol || '').trim() || null;
  }

  let description = body.description;
  if (description !== undefined) {
    description = String(description || '').trim() || null;
  }

  try {
    const existing = await redisGet(key);
    const parsed = (existing && typeof existing === 'object') ? { ...existing } : {};

    const updated = { ...parsed };
    if (openedAt !== undefined) updated.openedAt = openedAt;
    if (closedAt !== undefined) updated.closedAt = closedAt;
    if (initialDepositUsd !== undefined) updated.initialDepositUsd = initialDepositUsd;
    if (withdrawnUsd !== undefined) updated.withdrawnUsd = withdrawnUsd;
    if (currentValueUsd !== undefined) updated.currentValueUsd = currentValueUsd;
    if (status !== undefined) updated.status = status;
    if (isFullyManual !== undefined) updated.isFullyManual = isFullyManual;
    if (protocolName !== undefined) updated.protocolName = protocolName;
    if (tokenSymbol !== undefined) updated.tokenSymbol = tokenSymbol;
    if (description !== undefined) updated.description = description;

    await redisSet(key, updated);
    console.log('MANUAL_SAVE_STORED', key, updated);

    return res.status(200).json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Redis storage unavailable', detail: err.message });
  }
}

async function handleDelete(req, res) {
  let body;
  try {
    body = parseBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.log('MANUAL_DELETE_REQUEST', body);

  const { wallet, chain, protocolId, positionKey } = extractKeyParams(body);

  if (!wallet || !/^0x[a-f0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Valid wallet address required' });
  }
  if (!chain || !protocolId) {
    return res.status(400).json({ error: 'chain and protocolId required' });
  }

  const key = makeManualKey(wallet, chain, protocolId, positionKey);

  try {
    await redisDel(key);
    console.log('MANUAL_DELETE_DONE', key);
    return res.status(200).json({ deleted: true, key });
  } catch (err) {
    return res.status(500).json({ error: 'Redis storage unavailable', detail: err.message });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
};
