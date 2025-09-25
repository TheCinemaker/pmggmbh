// netlify/functions/getAllUploads.js
const { Dropbox } = require('dropbox');

// ---- ENV ellenőrzés (modul-szinten, de biztonságosan) ----
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

try { checkEnv(); }
catch (err) {
  exports.handler = async () => ({
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: err.message })
  });
  return;
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const APP_KEY       = process.env.DROPBOX_APP_KEY;
const APP_SECRET    = process.env.DROPBOX_APP_SECRET;
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || null;

const baseHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
  'Content-Type': 'application/json'
};

// ---- Helper: lapozásos listázás teljes mappára ----
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

// ---- Helper: "9. September" (de-DE, nagy kezdőbetű) ----
function currentMonthLabel(d = new Date()) {
  const n = d.getMonth() + 1;
  let name = d.toLocaleString('de-DE', { month: 'long' });
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return `${n}. ${name}`;
}

// ---- Helper: biztonságos HU dátum string (ha a kliens nem formázna) ----
function formatHu(dtIso) {
  try {
    const d = new Date(dtIso);
    return d.toLocaleString('hu-HU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return dtIso;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders };
  }

  try {
    // (opcionális) szerveroldali admin védelem
    if (ADMIN_API_KEY) {
      const key = event.headers['x-admin-key'];
      if (!key || key !== ADMIN_API_KEY) {
        return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
      }
    }

    const qs = event.queryStringParameters || {};
    const withLinks = (qs.links === '1' || qs.links === 'true');   // ideiglenes letöltési linkeket is kérsz-e

    const now  = new Date();
    const year = String(now.getFullYear());
    const monthLabel = currentMonthLabel(now); // pl. "9. September"

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    // 1) Év gyökér mappa
    const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;

    let yearEntries;
    try {
      yearEntries = await listFolderAll(dbx, basePath);
    } catch (err) {
      const tag = err?.error?.error?.path?.reason?.['.tag'];
      const notFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
      if (notFound) {
        return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({}) };
      }
      throw err;
    }

    // 2) User mappák
    const userFolders = yearEntries.filter(e => e['.tag'] === 'folder');
    const result = {};

    // 3) Minden usernél CSAK az aktuális hónap mappát nézzük
    for (const uf of userFolders) {
      const userName = uf.name; // pl. "AVAR Szilveszter"
      result[userName] = [];

      const monthPath = `${uf.path_lower}/${monthLabel}`;

      let monthEntries;
      try {
        monthEntries = await listFolderAll(dbx, monthPath);
      } catch (err) {
        const tag = err?.error?.error?.path?.reason?.['.tag'];
        const notFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
        if (notFound) continue;
        console.error(`Hiba a(z) ${userName} / ${monthLabel}:`, err);
        continue;
      }

      const files = monthEntries.filter(e => e['.tag'] === 'file');

      if (!withLinks) {
        for (const f of files) {
          // server_modified: a Dropbox szerveren utoljára módosítva (ISO)
          const uploadedAt = f.server_modified || f.client_modified || null;
          result[userName].push({
            folder: monthLabel,
            name:  f.name,
            path:  f.path_lower,
            uploadedAt,                       // ISO
            uploadedAtDisplay: formatHu(uploadedAt) // emberi (HU)
          });
        }
      } else {
        for (const f of files) {
          const uploadedAt = f.server_modified || f.client_modified || null;
          try {
            const linkResp = await dbx.filesGetTemporaryLink({ path: f.path_lower });
            result[userName].push({
              folder: monthLabel,
              name:  f.name,
              path:  f.path_lower,
              link:  linkResp.result.link,
              uploadedAt,
              uploadedAtDisplay: formatHu(uploadedAt)
            });
          } catch (linkErr) {
            console.error(`Link hiba: ${userName} / ${monthLabel} / ${f.name}`, linkErr);
            result[userName].push({
              folder: monthLabel,
              name:  f.name,
              path:  f.path_lower,
              uploadedAt,
              uploadedAtDisplay: formatHu(uploadedAt)
            });
          }
        }
      }

      // fájlok rendezése: legújabb felül
      result[userName].sort((a, b) => {
        const da = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const db = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        if (db !== da) return db - da; // újabb előre
        return a.name.localeCompare(b.name, 'de-DE');
      });
    }

    // user kulcsok rendezése
    const ordered = Object.keys(result)
      .sort((a, b) => a.localeCompare(b, 'hu-HU'))
      .reduce((acc, k) => { acc[k] = result[k]; return acc; }, {});

    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(ordered) };

  } catch (error) {
    console.error('getAllUploads (aktuális hónap) hiba:', error);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: error.message || 'Szerver hiba (aktuális hónap).' })
    };
  }
};
