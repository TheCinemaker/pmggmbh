// netlify/functions/getUploadsCurrentMonth.js
const { Dropbox } = require('dropbox');

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
  'Content-Type': 'application/json',
};

// Lapozás helper
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

// "9. September" formátum (de-DE, nagy kezdőbetű)
function getCurrentMonthLabel(date = new Date()) {
  const monthNum = date.getMonth() + 1;
  let monthName = date.toLocaleString('de-DE', { month: 'long' }); // pl. "september"
  monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1); // "September"
  return `${monthNum}. ${monthName}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders };
  }

  try {
    // (opcionális) szerveroldali védelem
    if (ADMIN_API_KEY) {
      const key = event.headers['x-admin-key'];
      if (!key || key !== ADMIN_API_KEY) {
        return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ message: 'Unauthorized' }) };
      }
    }

    const qs = event.queryStringParameters || {};
    const withLinks = (qs.links === '1' || qs.links === 'true');

    const now = new Date();
    const year = String(now.getFullYear());
    const monthLabel = getCurrentMonthLabel(now); // pl. "9. September"

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    // 1) év gyökér
    const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;

    // user mappák
    let yearEntries;
    try {
      yearEntries = await listFolderAll(dbx, basePath);
    } catch (err) {
      const tag = err?.error?.error?.path?.reason?.['.tag'];
      const notFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
      if (notFound) {
        // nincs még idei mappa → üres lista
        return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({}) };
      }
      throw err;
    }

    const userFolders = yearEntries.filter(e => e['.tag'] === 'folder');
    const result = {};

    // 2) minden usernél csak az adott hónap mappát nézzük
    for (const uf of userFolders) {
      const userName = uf.name; // pl. "AVAR Szilveszter"
      result[userName] = [];

      const monthPath = `${uf.path_lower}/${monthLabel}`; // /.../User/9. September

      let monthFiles;
      try {
        const entries = await listFolderAll(dbx, monthPath);
        monthFiles = entries.filter(e => e['.tag'] === 'file');
      } catch (err) {
        // ha nincs ilyen hónap mappa → üresen hagyjuk
        const tag = err?.error?.error?.path?.reason?.['.tag'];
        const notFound = err?.status === 409 && (tag === 'not_found' || tag === 'path');
        if (notFound) continue;
        console.error(`Hiba a(z) ${userName} / ${monthLabel}:`, err);
        continue;
      }

      if (!withLinks) {
        for (const f of monthFiles) {
          result[userName].push({ folder: monthLabel, name: f.name, path: f.path_lower });
        }
      } else {
        // linkek sorban (kisebb rate-limit kockázat)
        for (const f of monthFiles) {
          try {
            const linkResp = await dbx.filesGetTemporaryLink({ path: f.path_lower });
            result[userName].push({
              folder: monthLabel,
              name: f.name,
              path: f.path_lower,
              link: linkResp.result.link
            });
          } catch (linkErr) {
            console.error(`Link hiba: ${userName} / ${monthLabel} / ${f.name}`, linkErr);
            result[userName].push({ folder: monthLabel, name: f.name, path: f.path_lower });
          }
        }
      }

      // igény szerint név szerinti rendezés
      result[userName].sort((a, b) => a.name.localeCompare(b.name, 'de-DE'));
    }

    // user kulcsok rendezése
    const ordered = Object.keys(result)
      .sort((a, b) => a.localeCompare(b, 'hu-HU'))
      .reduce((acc, key) => { acc[key] = result[key]; return acc; }, {});

    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(ordered) };

  } catch (error) {
    console.error('getUploadsCurrentMonth hiba:', error);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: error.message || 'Szerver hiba (aktuális hónap).' })
    };
  }
};
