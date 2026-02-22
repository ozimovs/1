const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEBANK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DEBANK_API_KEY not configured' });
  }

  const addr = req.query.addr || req.query.id;
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return res.status(400).json({ error: 'Valid wallet address required (addr or id param)' });
  }

  const url = `${DEBANK_BASE}/user/total_balance?id=${encodeURIComponent(addr)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
