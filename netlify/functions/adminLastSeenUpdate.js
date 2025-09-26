// netlify/functions/adminLastSeenUpdate.js

// POST /.netlify/functions/adminLastSeenUpdate
// Body: { adminId: string, timestamp?: ISOstring }
// Ment: { [adminId]: ISOstring }
const { HEADERS, STATE_PATH, createDbxClient, readState } = require('./_dbx-helpers');

exports.handler = async (event) => {
  const specificHeaders = { ...HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: specificHeaders };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: specificHeaders, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const adminId = body.adminId?.trim();
    const ts = (body.timestamp || new Date().toISOString()).trim();
    if (!adminId) {
      return { statusCode: 400, headers: specificHeaders, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = createDbxClient();
    const map = await readState(dbx);
    map[adminId] = ts;

    await dbx.filesUpload({
      path: STATE_PATH,
      contents: Buffer.from(JSON.stringify(map, null, 2), 'utf8'),
      mode: { '.tag': 'overwrite' },
      mute: true,
    });

    return { statusCode: 200, headers: specificHeaders, body: JSON.stringify({ ok: true, lastSeen: ts }) };
  } catch (e) {
    console.error('adminLastSeenUpdate error:', e);
    return { statusCode: 500, headers: specificHeaders, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
