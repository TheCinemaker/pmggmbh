// netlify/functions/updateStatus.js
const { Dropbox } = require('dropbox');

const REFRESH_TOKEN = (process.env.DROPBOX_REFRESH_TOKEN || '').trim();
const APP_KEY = (process.env.DROPBOX_APP_KEY || '').trim();
const APP_SECRET = (process.env.DROPBOX_APP_SECRET || '').trim();
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();

function describeDbxError(e) {
  if (!e) return 'Unknown error';
  const status = e.status ? `[${e.status}] ` : '';
  let body = '';
  if (typeof e.error === 'string') {
    body = e.error;
  } else if (e.error?.error_description) {
    body = `${e.error.error}: ${e.error.error_description}`;
  } else if (e.error?.error_summary) {
    body = e.error.error_summary;
  }
  return `${status}${body || e.message || 'Unknown error'}`;
}

const STATE_FILE_PATH = '/PMG Mindenes - PMG ALLES/Stundenzettel 2026/SYSTEM/status_registry.json';

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || ALLOWED_ORIGIN;
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const dbx = new Dropbox({
    refreshToken: REFRESH_TOKEN,
    clientId: APP_KEY,
    clientSecret: APP_SECRET
  });

  // GET: Fetch status registry
  if (event.httpMethod === 'GET') {
    try {
      const dl = await dbx.filesDownload({ path: STATE_FILE_PATH });
      const buf = dl.result.fileBinary;
      const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '{}');
      const data = JSON.parse(text || '{}');
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch (e) {
      // Return empty registry if file doesn't exist yet
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }
  }

  // POST: Update status for a user/folder/file
  if (event.httpMethod === 'POST') {
    try {
      let body = {};
      try { body = JSON.parse(event.body || '{}'); } catch {}

      const key = (body.key || body.user || body.path || '').trim();
      const status = (body.status || 'geprüft').trim(); // 'geprüft', 'bearbeitung', 'abgelehnt', 'offen'
      const note = (body.note || '').trim();

      if (!key) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'key/user is required' }) };
      }

      // Read current registry
      let currentData = {};
      try {
        const dl = await dbx.filesDownload({ path: STATE_FILE_PATH });
        const buf = dl.result.fileBinary;
        const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '{}');
        currentData = JSON.parse(text || '{}');
      } catch (e) {}

      // Update entry
      currentData[key] = {
        status,
        note,
        updatedAt: new Date().toISOString()
      };

      // Upload updated registry
      await dbx.filesUpload({
        path: STATE_FILE_PATH,
        contents: Buffer.from(JSON.stringify(currentData, null, 2), 'utf8'),
        mode: { '.tag': 'overwrite' }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, key, statusData: currentData[key] })
      };
    } catch (error) {
      console.error('[updateStatus] Hiba:', error);
      const detailMsg = describeDbxError(error);
      return { statusCode: 500, headers, body: JSON.stringify({ message: detailMsg, error: detailMsg }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
};
