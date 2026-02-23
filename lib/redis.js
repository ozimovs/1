/**
 * Redis-клиент для REDIS_URL.
 * Используется для хранения ручных поправок DeFi-позиций.
 */

const { createClient } = require('redis');

let client = null;

async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client && client.isOpen) return client;
  try {
    client = createClient({ url });
    await client.connect();
    return client;
  } catch (err) {
    client = null;
    return null;
  }
}

async function redisGet(key) {
  const c = await getRedis();
  if (!c) return null;
  try {
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function redisSet(key, value) {
  const c = await getRedis();
  if (!c) throw new Error('Redis not configured');
  await c.set(key, JSON.stringify(value));
}

module.exports = { redisGet, redisSet };
