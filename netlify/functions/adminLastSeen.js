// netlify/functions/adminLastSeen.js
const { HEADERS, createDbxClient, readState } = require('./_dbx-helpers');

exports.handler = async (event) => {
  const headers = { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  try {
    const adminId = event.queryStringParameters?.adminId?.trim();
    if (!adminId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = createDbxClient();
    const map = await readState(dbx);
    const lastSeen = map[adminId] || null;

    return { statusCode: 200, headers, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    // adjunk több infót a kliensnek
    const code = e?.status || e?.statusCode || 500;
    const tag = e?.error?.error_summary || e?.error?.error?.['.tag'] || null;
    console.error('adminLastSeen error:', code, tag, e?.error || e);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'dropbox_error', code, tag }) };
  }
};
