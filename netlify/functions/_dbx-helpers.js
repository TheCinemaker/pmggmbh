// netlify/functions/_dbx-helpers.js
const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const STATE_DIR  = '/PMG Mindenes - PMG ALLES/Stundenzettel 2025/SYSTEM';
const STATE_PATH = `${STATE_DIR}/admin-last-seen.json`;

function createDbxClient() {
  // Gyors sanity log (értéket nem írunk ki)
  if (!process.env.DROPBOX_APP_KEY || !process.env.DROPBOX_APP_SECRET || !process.env.DROPBOX_REFRESH_TOKEN) {
    console.error('Dropbox env hiányzik: ',
      !!process.env.DROPBOX_APP_KEY, !!process.env.DROPBOX_APP_SECRET, !!process.env.DROPBOX_REFRESH_TOKEN);
  }
  return new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  });
}

// Ha hiányzik a SYSTEM mappa: létrehozzuk (idempotens).
async function ensureFolder(dbx, path) {
  try {
    await dbx.filesCreateFolderV2({ path, autorename: false });
  } catch (err) {
    const already = err?.status === 409;
    if (!already) throw err;
  }
}

async function whoAmI(dbx) {
  // 401-et itt is megfogjuk, és érthetőbb hibát adunk vissza a logban
  try {
    const me = await dbx.usersGetCurrentAccount();
    return me?.result?.account_id || 'unknown';
  } catch (e) {
    console.error('Dropbox auth check (whoAmI) failed:', e?.message || e);
    throw e;
  }
}

async function readState(dbx) {
  try {
    const dl = await dbx.filesDownload({ path: STATE_PATH });
    const buf = dl.result.fileBinary;
    const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
    return JSON.parse(text || '{}');
  } catch (err) {
    const isNotFound =
      err?.status === 409 &&
      (err?.error?.error?.path?.reason?.['.tag'] === 'not_found' ||
       err?.error?.error?.['.tag'] === 'path');
    if (isNotFound) return {};
    console.error('Dropbox state read error:', err);
    throw err;
  }
}

module.exports = { HEADERS, STATE_DIR, STATE_PATH, createDbxClient, ensureFolder, readState, whoAmI };
