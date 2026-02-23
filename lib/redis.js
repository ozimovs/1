/**
 * KV/Redis для ручных поправок DeFi-позиций.
 * Поддерживает: REDIS_URL (node-redis) или KV_REST_API_URL+KV_REST_API_TOKEN (@vercel/kv).
 */

const { createClient } = require('redis');

let redisClient = null;
let useKv = null;

async function getBackend() {
  if (useKv !== null) return useKv ? 'kv' : 'redis';

  const kvUrl = process.env.KV_REST_API_URL || process.env.KV_URL;
  const kvToken = process.env.KV_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  if (kvUrl && kvToken) {
    useKv = true;
    return 'kv';
  }
  if (redisUrl) {
    useKv = false;
    return 'redis';
  }
  return null;
}

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redisClient = createClient({ url });
    await redisClient.connect();
    return redisClient;
  } catch (err) {
    redisClient = null;
    return null;
  }
}

async function redisGet(key) {
  const backend = await getBackend();
  if (!backend) return null;

  if (backend === 'kv') {
    try {
      const { kv } = require('@vercel/kv');
      const val = await kv.get(key);
      return typeof val === 'object' && val !== null ? val : (val ? JSON.parse(val) : null);
    } catch (err) {
      return null;
    }
  }

  const c = await getRedisClient();
  if (!c) return null;
  try {
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function redisSet(key, value) {
  const backend = await getBackend();
  if (!backend) throw new Error('Redis/KV not configured');

  if (backend === 'kv') {
    const { kv } = require('@vercel/kv');
    await kv.set(key, value);
    return;
  }

  const c = await getRedisClient();
  if (!c) throw new Error('Redis not configured');
  await c.set(key, JSON.stringify(value));
}

module.exports = { redisGet, redisSet };
