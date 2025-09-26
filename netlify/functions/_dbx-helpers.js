// netlify/functions/_dbx-helpers.js
const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const STATE_DIR  = '/PMG Mindenes - PMG ALLES/Stundenzettel 2025/SYSTEM';
const STATE_PATH = `${STATE_DIR}/admin-last-seen.json`;

function createDbxClient() {
  // fontos: ugyanaz a refreshToken/appKey/appSecret mint a többi működő fn-ben
  return new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  });
}

// Idempotens mappalétrehozás
async function ensureFolder(dbx, path) {
  try {
    await dbx.filesCreateFolderV2({ path, autorename: false });
  } catch (err) {
    if (err?.status !== 409) throw err; // 409 = already exists -> ok
  }
}

// Állapot JSON beolvasása; ha nincs, üres {}
async function readState(dbx) {
  try {
    const dl = await dbx.filesDownload({ path: STATE_PATH });
    const buf = dl.result.fileBinary;
    const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
    return JSON.parse(text || '{}');
  } catch (err) {
    const tag = err?.error?.error?.path?.reason?.['.tag'] || err?.error?.error?.['.tag'];
    const notFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
    if (notFound) return {};
    console.error('Dropbox state read error:', err);
    throw err;
  }
}

module.exports = { HEADERS, STATE_DIR, STATE_PATH, createDbxClient, ensureFolder, readState };
