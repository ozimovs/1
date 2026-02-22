const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.DEBANK_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: 'DEBANK_API_KEY not set in Vercel',
      hint: 'Add it in Vercel → Project → Settings → Environment Variables',
    });
  }

  const testUrl = `${DEBANK_BASE}/user/total_balance?id=0x0fdbe030de89fd11a20ffd48a3d63fb7eec468b1`;

  try {
    const response = await fetch(testUrl, {
      headers: {
        Accept: 'application/json',
        AccessKey: apiKey,
      },
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(200).json({
        ok: false,
        error: 'DeBank returned HTML instead of JSON',
        status: response.status,
        contentType: response.headers.get('content-type'),
        preview: text.substring(0, 200),
        hint: 'Invalid or expired API key. Get a new key at cloud.debank.com',
      });
    }

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        error: 'DeBank API error',
        status: response.status,
        data: parsed,
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'DeBank API connection OK',
      total_usd_value: parsed.total_usd_value,
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message,
    });
  }
};
