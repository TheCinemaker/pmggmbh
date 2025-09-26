// POST /.netlify/functions/adminLastSeenUpdate
// Body: { adminId: string, timestamp?: ISOstring }
// Ment: { [adminId]: ISOstring } a STATE_PATH alá
const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;

const STATE_PATH = '/PMG Mindenes - PMG ALLES/system/admin-last-seen.json';

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

    const dbx = new Dropbox({ clientId: APP_KEY, clientSecret: APP_SECRET, refreshToken: REFRESH_TOKEN });

    // Jelenlegi map betöltése (ha nincs, üres)
    let map = {};
    try {
      const dl = await dbx.filesDownload({ path: STATE_PATH });
      const buf = dl.result.fileBinary;
      const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
      map = JSON.parse(text || '{}');
    } catch (err) {
      const tagTop = err?.error?.error?.['.tag'];            // 'path'
      const tagDeep = err?.error?.error?.path?.['.tag'];     // 'not_found'
      if (!(err?.status === 409 && (tagTop === 'path' || tagDeep === 'not_found'))) {
        console.error('adminLastSeenUpdate download error:', err);
        throw err;
      }
    }

    map[adminId] = ts;

    await dbx.filesUpload({
      path: STATE_PATH,
      contents: Buffer.from(JSON.stringify(map, null, 2), 'utf8'),
      mode: { '.tag': 'overwrite' },
      mute: true,
    });

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true, lastSeen: ts }) };
  } catch (e) {
    console.error('adminLastSeenUpdate error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ message: e.message || 'Server error' }) };
  }
};
