// netlify/functions/adminLastSeen.js

// GET /.netlify/functions/adminLastSeen?adminId=<ID>
// Vissza: { lastSeen: ISOstring | null }
const { HEADERS, createDbxClient, readState } = require('./_dbx-helpers');

exports.handler = async (event) => {
  const specificHeaders = { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: specificHeaders };

  try {
    const adminId = event.queryStringParameters?.adminId?.trim();
    if (!adminId) {
      return { statusCode: 400, headers: specificHeaders, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = createDbxClient();
    const map = await readState(dbx);
    const lastSeen = map[adminId] || null;

    return { statusCode: 200, headers: specificHeaders, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    console.error('adminLastSeen error:', e);
    return { statusCode: 500, headers: specificHeaders, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
