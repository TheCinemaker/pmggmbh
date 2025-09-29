// GET /.netlify/functions/adminLastSeen?adminId=<ID>
// Válasz: { lastSeen: ISOstring | null }
const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };

  try {
    const adminId = (event.queryStringParameters?.adminId || '').trim();
    if (!adminId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const store = getStore('admin-last-seen');         // egy név a store-hoz
    const map = (await store.getJSON('state')) || {};  // { [adminId]: ISO }

    const lastSeen = map[adminId] || null;
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    console.error('adminLastSeen error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
