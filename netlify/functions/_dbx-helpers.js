// netlify/functions/_dbx-helpers.js

const { Dropbox } = require('dropbox');

const HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const STATE_PATH = '/PMG Mindenes - PMG ALLES/Stundenzettel 2025/SYSTEM/admin-last-seen.json';

/**
 * Létrehoz és visszaad egy inicializált Dropbox klienst.
 * @returns {Dropbox}
 */
function createDbxClient() {
  return new Dropbox({
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  });
}

/**
 * Beolvassa és parse-olja az admin last seen állapotot tartalmazó JSON fájlt.
 * Ha a fájl nem létezik, üres objektumot ad vissza.
 * Más hiba esetén dobja a hibát.
 * @param {Dropbox} dbx - Egy inicializált Dropbox kliens.
 * @returns {Promise<Object>} Az állapotokat tartalmazó map.
 */
async function readState(dbx) {
  try {
    const dl = await dbx.filesDownload({ path: STATE_PATH });
    const buf = dl.result.fileBinary;
    const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || '');
    return JSON.parse(text || '{}');
  } catch (err) {
    // Csak a "file not found" hibát nyeljük el, a többit továbbdobjuk.
    const isNotFoundError = err?.status === 409 &&
      err?.error?.error?.['.tag'] === 'path' &&
      err?.error?.error?.path?.['.tag'] === 'not_found';

    if (isNotFoundError) {
      return {}; // Fájl nem létezik még, ez normális.
    }
    // Minden más hiba komoly probléma.
    console.error('Dropbox state read error:', err);
    throw err;
  }
}

module.exports = { HEADERS, STATE_PATH, createDbxClient, readState };
