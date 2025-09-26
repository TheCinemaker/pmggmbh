// netlify/functions/adminLastSeen.js
const { HEADERS, createDbxClient, readState, whoAmI } = require('./_dbx-helpers');

exports.handler = async (event) => {
  const headers = { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  try {
    const adminId = event.queryStringParameters?.adminId?.trim();
    if (!adminId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = createDbxClient();
    // 401 diagnosztika
    await whoAmI(dbx);

    const map = await readState(dbx);
    const lastSeen = map[adminId] || null;

    return { statusCode: 200, headers, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    console.error('adminLastSeen error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
