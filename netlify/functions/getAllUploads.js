// netlify/functions/getAllUploads.js
const { Dropbox } = require('dropbox');

// --- Konfiguráció és Ellenőrzés (modul-szinten biztonságos) ---
const REQUIRED_ENV = [
  'ALLOWED_ORIGIN',
  'DROPBOX_APP_KEY',
  'DROPBOX_APP_SECRET',
  'DROPBOX_REFRESH_TOKEN',
  // opcionális: 'ADMIN_API_KEY'
];

function checkEnv() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Hiányzó környezeti változók: ${missing.join(', ')}`);
}

try {
  checkEnv();
} catch (err) {
  // Ha már itt elhasalna, adjunk vissza JSON-t
  exports.handler = async () => ({
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: err.message }),
  });
  return;
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const APP_KEY       = process.env.DROPBOX_APP_KEY;
const APP_SECRET    = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null; // ha használsz szerveroldali védelmet

// --- Közös headerek ---
const baseHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
  'Content-Type': 'application/json',
};

// --- Helper: teljes mappa bejárása lapozással ---
async function listFolderAll(dbx, path) {
  let entries = [];
  let resp = await dbx.filesListFolder({ path });
  entries = entries.concat(resp.result.entries || []);
  while (resp.result.has_more) {
    resp = await dbx.filesListFolderContinue({ cursor: resp.result.cursor });
    entries = entries.concat(resp.result.entries || []);
  }
  return entries;
}

// --- Opcionális normalizálás hónapnevekre, ha kellene ---
// Itt most az eredeti mappanevet visszük tovább érintetlenül.

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders };
  }

  try {
    // (OPCIONÁLIS) Szerveroldali admin védelem – NE bízz a sessionStorage-ben!
    if (ADMIN_API_KEY) {
      const key = event.headers['x-admin-key'];
      if (!key || key !== ADMIN_API_KEY) {
        return {
          statusCode: 401,
          headers: baseHeaders,
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }
    }

    // Query paramok (mind opcionális)
    const qs = event.queryStringParameters || {};
    const yearParam   = (qs.year && String(qs.year).trim()) || '';
    const userFilter  = (qs.user && decodeURIComponent(qs.user).trim()) || '';        // pl. "AVAR Szilveszter"
    const monthFilter = (qs.month && decodeURIComponent(qs.month).trim()) || '';      // pl. "12. Dezember"
    const withLinks   = (qs.links === '1' || qs.links === 'true');                    // ideiglenes linket kér-e
    const fallbackPrevYear = (qs.fallbackPrevYear === '1' || qs.fallbackPrevYear === 'true');

    const now = new Date();
    const year = yearParam || String(now.getFullYear());

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET,
    });

    // Gyökér: év mappa
    const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;

    // Listázzuk a user mappákat; ha nem található és engedélyezett, próbáljuk az előző évet
    let userFoldersEntries;
    try {
      userFoldersEntries = await listFolderAll(dbx, basePath);
    } catch (err) {
      const tag = err?.error?.error?.path?.reason?.['.tag'];
      const isNotFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
      if (isNotFound && fallbackPrevYear) {
        const prevBasePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${Number(year) - 1}`;
        userFoldersEntries = await listFolderAll(dbx, prevBasePath);
      } else {
        throw err;
      }
    }

    const userFolders = userFoldersEntries.filter(e => e['.tag'] === 'folder');

    // Eredmény struktúra: { [userName]: [{ folder, name, path, link? }] }
    const result = {};

    // Végigmegyünk a usereken (defenzív: ha userFilter van, csak arra)
    for (const uf of userFolders) {
      const userName = uf.name; // pl. "AVAR Szilveszter"
      if (userFilter && userName !== userFilter) continue;

      result[userName] = [];

      // Hónap mappák a user alatt
      let monthEntries;
      try {
        monthEntries = await listFolderAll(dbx, uf.path_lower);
      } catch (innerErr) {
        console.error(`Hiba a(z) ${userName} hónap-listázásánál:`, innerErr);
        continue; // Egy user hibája ne állítsa meg az egészet
      }

      const monthFolders = monthEntries.filter(e => e['.tag'] === 'folder');

      for (const mf of monthFolders) {
        const monthName = mf.name; // pl. "12. Dezember"
        if (monthFilter && monthName !== monthFilter) continue;

        // Fájlok a hónap mappában
        let fileEntries;
        try {
          fileEntries = await listFolderAll(dbx, mf.path_lower);
        } catch (innerErr) {
          console.error(`Hiba a(z) ${userName} / ${monthName} fájllistázásánál:`, innerErr);
          continue;
        }

        const files = fileEntries.filter(e => e['.tag'] === 'file');

        if (!withLinks) {
          // csak meta
          for (const f of files) {
            result[userName].push({
              folder: monthName,
              name: f.name,
              path: f.path_lower,
            });
          }
        } else {
          // ideiglenes linkek (sorrendben, hogy elkerüljük a túl sok párhuzamos kérést / rate limitet)
          for (const f of files) {
            try {
              const linkResp = await dbx.filesGetTemporaryLink({ path: f.path_lower });
              result[userName].push({
                folder: monthName,
                name: f.name,
                path: f.path_lower,
                link: linkResp.result.link,
              });
            } catch (linkErr) {
              console.error(`Link hiba: ${userName} / ${monthName} / ${f.name}`, linkErr);
              // link nélkül is tehetjük a listába
              result[userName].push({
                folder: monthName,
                name: f.name,
                path: f.path_lower,
              });
            }
          }
        }
      }

      // Opcionális: rendezzük a user fájljait (hónap szerint, majd név szerint)
      result[userName].sort((a, b) => {
        if (a.folder === b.folder) return a.name.localeCompare(b.name, 'de-DE');
        // próbáljuk a hónap sorszámát kiolvasni a "12. Dezember" mintából:
        const numA = parseInt(a.folder, 10) || 0;
        const numB = parseInt(b.folder, 10) || 0;
        return numB - numA; // csökkenő: legújabb elöl
      });
    }

    // Opcionális: a user kulcsok rendezése
    const ordered = Object.keys(result)
      .sort((a, b) => a.localeCompare(b, 'hu-HU'))
      .reduce((acc, key) => { acc[key] = result[key]; return acc; }, {});

    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(ordered) };

  } catch (error) {
    console.error('getAllUploads hiba:', error);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: error.message || 'Szerver hiba getAllUploads-ben.' }),
    };
  }
};
