// GET /.netlify/functions/adminLastSeen?adminId=<ID>
// Vissza: { lastSeen: ISOstring | null }
const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const APP_KEY = process.env.DROPBOX_APP_KEY;
theAPP_SECRET = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

// JSON állapot fájl
const STATE_PATH = '/PMG Mindenes - PMG ALLES/system/admin-last-seen.json';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };

  try {
    const adminId = (event.queryStringParameters?.adminId || '').trim();
    if (!adminId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = new Dropbox({ clientId: APP_KEY, clientSecret: theAPP_SECRET, refreshToken: REFRESH_TOKEN });

    let map = {};
    try {
      const dl = await dbx.filesDownload({ path: STATE_PATH });
      const buf = dl.result.fileBinary;
      const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
      map = JSON.parse(text || '{}');
    } catch (err) {
      // Ha a fájl még nem létezik, ne legyen 500
      const tagTop = err?.error?.error?.['.tag'];                    // 'path'
      const tagDeep = err?.error?.error?.path?.['.tag'];             // 'not_found'
      if (!(err?.status === 409 && (tagTop === 'path' || tagDeep === 'not_found'))) {
        console.error('adminLastSeen download error:', err);
        throw err;
      }
    }

    const lastSeen = map[adminId] || null;
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    console.error('adminLastSeen error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
