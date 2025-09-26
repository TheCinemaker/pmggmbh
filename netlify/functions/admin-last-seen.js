// GET /.netlify/functions/admin-last-seen?adminId=<ID>
// Visszaadja { lastSeen: ISOstring | null }
const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

// hova mentjük a JSON-t
const STATE_PATH = '/PMG Mindenes - PMG ALLES/system/admin-last-seen.json';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };

  try {
    const adminId = (event.queryStringParameters?.adminId || '').trim();
    if (!adminId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ message: 'Missing adminId' }) };
    }

    const dbx = new Dropbox({ clientId: APP_KEY, clientSecret: APP_SECRET, refreshToken: REFRESH_TOKEN });

    // fájl letöltése (ha nincs, null)
    let map = {};
    try {
      const dl = await dbx.filesDownload({ path: STATE_PATH });
      const buf = dl.result.fileBinary;
      const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
      map = JSON.parse(text || '{}');
    } catch (err) {
      const tag = err?.error?.error?.path?.reason?.['.tag'] || err?.error?.error?.['.tag'];
      if (!(err?.status === 409 && (tag === 'not_found' || tag === 'path'))) {
        // nem "not_found" -> valódi hiba
        throw err;
      }
    }

    const lastSeen = map[adminId] || null;
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ lastSeen }) };
  } catch (e) {
    console.error('admin-last-seen error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
