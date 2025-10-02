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
    // 1) első próbálkozás: ID-vel (stabil)
    try {
      const t = await dbx.filesGetTemporaryLink({ path: f.id });
      link = t?.result?.link || null;
    } catch (e1) {
      console.warn('Temp link ID-vel bukott:', f.id, e1?.status, e1?.error?.error_summary || e1?.message);

      // 2) fallback: path_display (ha ID-vel valami team-namespace anomália lenne)
      try {
        const t2 = await dbx.filesGetTemporaryLink({ path: f.path_display });
        link = t2?.result?.link || null;
      } catch (e2) {
        console.warn('Temp link path_display-vel is bukott:', f.path_display, e2?.status, e2?.error?.error_summary || e2?.message);

        // 3) utolsó fallback: megpróbálunk megosztási linket (tartós), majd abból "raw" URL-t csinálunk
        try {
          // van-e már megosztási link?
          const ls = await dbx.sharingListSharedLinks({ path: f.path_lower, direct_only: true });
          let sl = ls?.result?.links?.[0]?.url || null;

          if (!sl) {
            // ha nincs, létrehozunk egyet
            const cr = await dbx.sharingCreateSharedLinkWithSettings({ path: f.path_lower });
            sl = cr?.result?.url || null;
          }

          if (sl) {
            // dropbox.com/s/… -> dl=1 / raw=1 direkt link
            link = sl.includes('?') ? `${sl}&raw=1` : `${sl}?raw=1`;
          }
        } catch (e3) {
          console.warn('Megosztási link létrehozás is bukott:', f.path_lower, e3?.status, e3?.error?.error_summary || e3?.message);
        }
      }
    }
  }

  const uploadedAt = f.server_modified || f.client_modified || null;
  return {
    id: f.id,
    name: f.name,
    link,                      // lehet null, ha semmi nem sikerült
    uploadedAt,
    uploadedAtDisplay: uploadedAt,
    path_lower: f.path_lower,  // debughoz hasznos lehet
    path_display: f.path_display
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
