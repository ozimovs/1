/**
 * Общий формат ключа для DeFi позиций в Redis.
 * Используется в defi-positions и defi-position-manual.
 */
function clean(s) {
  return (s || '').replace(/[^a-zA-Z0-9:_.-]/g, '_');
}

function makePositionKvKey(wallet, chain, protocolId, positionType, positionKey) {
  const w = (wallet || '').toString().toLowerCase();
  const pk = positionKey || 'default';
  const id = [chain, protocolId, positionType, pk].map(clean).join(':');
  return `wallet:${w}:position:${id}`;
}

module.exports = { makePositionKvKey };
