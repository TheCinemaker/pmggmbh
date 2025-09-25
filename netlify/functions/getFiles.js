const { Dropbox } = require('dropbox');

// --- Konfig + ellenőrzés ---
const REQUIRED = ['ALLOWED_ORIGIN','DROPBOX_APP_KEY','DROPBOX_APP_SECRET','DROPBOX_REFRESH_TOKEN'];
function assertEnv() {
  const miss = REQUIRED.filter(k => !process.env[k]);
  if (miss.length) throw new Error(`Hiányzó környezeti változók: ${miss.join(', ')}`);
}

// --- Handler ---
exports.handler = async (event) => {
  try { assertEnv(); }
  catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: e.message }) };
  }

  const headers = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  try {
    const qs = event.queryStringParameters || {};
    // Netlify már dekódolt paramokat ad vissza -> ne decodeURIComponent-eljünk újra
    const userId = (qs.userId || '').trim();
    const selectedMonth = (qs.selectedMonth || qs.selectedFolder || qs.month || '').trim();
    const wantLinks = (qs.links ?? '1') !== '0'; // ha ?links=0 → ne kérjünk temp linkeket

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

    // Listázás (lapozással)
    let entries = [];
    let resp;
    try {
      resp = await dbx.filesListFolder({ path: folderPath });
    } catch (err) {
      // path not found → üres lista
      if (err?.status === 409) return { statusCode: 200, headers, body: JSON.stringify([]) };
      console.error('Dropbox list error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Hiba a fájlok lekérésekor.' }) };
    }
    entries = entries.concat(resp.result.entries || []);
    while (resp.result.has_more) {
      resp = await dbx.filesListFolderContinue({ cursor: resp.result.cursor });
      entries = entries.concat(resp.result.entries || []);
    }

    const files = entries.filter(e => e['.tag'] === 'file');
    if (!files.length) return { statusCode: 200, headers, body: JSON.stringify([]) };

    // Elemenkénti link kérés – ne bukjon az egész, ha 1-2 hiba van
    const items = await Promise.all(files.map(async (f) => {
      let link = null;
      if (wantLinks) {
        try {
          const t = await dbx.filesGetTemporaryLink({ path: f.path_lower });
          link = t?.result?.link || null;
        } catch (e) {
          console.warn('Temp link hiba:', f.path_lower, e?.status || e?.message);
        }
      }
      const uploadedAt = f.server_modified || f.client_modified || null;
      return {
        name: f.name,
        link,
        uploadedAt,
        uploadedAtDisplay: uploadedAt
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
