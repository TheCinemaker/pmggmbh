// netlify/functions/getFiles.js
const { Dropbox } = require('dropbox');

// --- Konfig + ellenőrzés ---
const REQUIRED = ['ALLOWED_ORIGIN','DROPBOX_APP_KEY','DROPBOX_APP_SECRET','DROPBOX_REFRESH_TOKEN'];
function assertEnv() {
  const miss = REQUIRED.filter(k => !process.env[k]);
  if (miss.length) throw new Error(`Hiányzó környezeti változók: ${miss.join(', ')}`);
}

// --- Segéd: lapozós listázás ---
async function listAll(dbx, path) {
  let res = await dbx.filesListFolder({ path });
  const out = [...(res.result.entries || [])];
  while (res.result.has_more) {
    res = await dbx.filesListFolderContinue({ cursor: res.result.cursor });
    out.push(...(res.result.entries || []));
  }
  return out;
}

// --- Handler ---
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  try {
    assertEnv();

    const qs = event.queryStringParameters || {};
    // Netlify már dekódolt queryt ad -> nem kell újra decode-olni
    const userId        = (qs.userId || '').trim();
    const selectedMonth = (qs.selectedMonth || qs.selectedFolder || qs.month || '').trim();
    // Backcompat: ha valaki még linket kérne itt, engedjük (alapból: NEM kérünk)
    const wantLinks     = (qs.links ?? '0') !== '0';

    if (!userId || !selectedMonth) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Hiányzó felhasználó vagy hónap.' }) };
    }

    const dbx = new Dropbox({
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
      clientId: process.env.DROPBOX_APP_KEY,
      clientSecret: process.env.DROPBOX_APP_SECRET
    });

    const year = new Date().getFullYear();
    const folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}/${userId}/${selectedMonth}`;

    // Listázás (lapozással), ha mappa nincs: üres
    let entries;
    try {
      entries = await listAll(dbx, folderPath);
    } catch (err) {
      if (err?.status === 409) {
        return { statusCode: 200, headers, body: JSON.stringify([]) };
      }
      console.error('Dropbox list error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Hiba a fájlok lekérésekor.' }) };
    }

    const files = (entries || []).filter(e => e['.tag'] === 'file');

    // --- Csak meta – a linket alapból NEM gyártjuk itt (getFileLink intézi) ---
    // Ha mégis kérik (?links=1), megpróbálunk temp-linket adni (ID -> path fallback).
    const items = await Promise.all(files.map(async (f) => {
      let link = null;
      if (wantLinks) {
        try {
          const t = await dbx.filesGetTemporaryLink({ path: f.id });           // stabil
          link = t?.result?.link || null;
        } catch (e1) {
          try {
            const t2 = await dbx.filesGetTemporaryLink({ path: f.path_lower || f.path_display });
            link = t2?.result?.link || null;
          } catch (e2) {
            console.warn('Temp link hiba:', f.id, e1?.status || e1?.message, 'fallback:', e2?.status || e2?.message);
          }
        }
      }

      const uploadedAt = f.server_modified || f.client_modified || null;
      return {
        id: f.id,
        name: f.name,
        uploadedAt,
        uploadedAtDisplay: uploadedAt,
        path_lower: f.path_lower,
        path_display: f.path_display,
        link
      };
    }));

    // Legfrissebb elöl
    items.sort((a, b) => (new Date(b.uploadedAt || 0)) - (new Date(a.uploadedAt || 0)));

    return { statusCode: 200, headers, body: JSON.stringify(items) };
  } catch (error) {
    console.error('getFiles.js fatális hiba:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }) };
  }
};
