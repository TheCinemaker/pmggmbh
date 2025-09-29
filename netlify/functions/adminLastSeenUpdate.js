// POST /.netlify/functions/adminLastSeenUpdate
// Body: { adminId: string, timestamp?: ISOstring }
const { getStore } = require('@netlify/blobs');

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const adminId = (body.adminId || '').trim();
    const ts = (body.timestamp || new Date().toISOString()).trim();
    if (!adminId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const store = getStore('admin-last-seen');
    const map = (await store.getJSON('state')) || {};

    map[adminId] = ts;
    await store.setJSON('state', map);

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, lastSeen: ts }) };
  } catch (e) {
    console.error('adminLastSeenUpdate error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
