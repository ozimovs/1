/**
 * Временный тестовый endpoint для проверки интеграции с DeBank API.
 * Не логирует ключ.
 */

const DEBANK_BASE = 'https://pro-openapi.debank.com/v1';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.DEBANK_API_KEY;

  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: 'no key',
      hint: 'DEBANK_API_KEY не задана в Vercel Environment Variables',
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

    const bodyText = await response.text();

    return res.status(200).json({
      ok: response.ok,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || null,
      bodyPreview: bodyText.substring(0, 500),
      bodyLength: bodyText.length,
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err.message,
    });
  }
};
