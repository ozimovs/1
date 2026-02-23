/**
 * Ключ для ручных данных позиции в Redis.
 * Формат: manual:{wallet}:{chain}:{protocolId}:{positionKey}
 * НЕ МЕНЯТЬ — иначе потеряются сохранённые данные.
 */
function clean(s) {
  return String(s || '').replace(/[^a-zA-Z0-9:_.-]/g, '_');
}

function makeManualKey(wallet, chain, protocolId, positionKey) {
  const w = (wallet || '').toString().toLowerCase().trim();
  const c = clean(chain);
  const p = clean(protocolId);
  const pk = clean(positionKey || 'default');
  return `manual:${w}:${c}:${p}:${pk}`;
}

function parseManualKey(key) {
  if (typeof key !== 'string' || !key.startsWith('manual:')) return null;
  const parts = key.split(':');
  if (parts.length < 5) return null;
  return {
    wallet: parts[1],
    chain: parts[2],
    protocolId: parts[3],
    positionKey: parts.slice(4).join(':') || 'default',
  };
}

module.exports = { makeManualKey, parseManualKey, clean };
