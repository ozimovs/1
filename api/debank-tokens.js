/**
 * Серверный endpoint: user/all_token_list.
 * Использует process.env.DEBANK_API_KEY только на сервере.
 */

const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

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

  const isAll = req.query.is_all !== 'false';
  const url = `${DEBANK_BASE}/user/all_token_list?id=${encodeURIComponent(id)}&is_all=${isAll}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', AccessKey: apiKey },
    });
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

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(Array.isArray(data) ? data : []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
