// netlify/functions/getAllUploads.js
const { Dropbox } = require('dropbox');

// ---- ENV ellenőrzés (modul-szinten, de biztonságosan) ----
const REQUIRED_ENV = [
  'ALLOWED_ORIGIN',
  'DROPBOX_APP_KEY',
  'DROPBOX_APP_SECRET',
  'DROPBOX_REFRESH_TOKEN',
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
  let resp;
  try {
    resp = await dbx.filesListFolder({ path });
  } catch (err) {
    // Ha a mappa nem létezik, üres listát adunk vissza, nem hibát
    const tag = err?.error?.error?.path?.reason?.['.tag'];
    if (err?.status === 409 && (tag === 'not_found' || tag === 'path')) {
      return []; // Üres lista, ha a mappa nem található
    }
    throw err; // Más hiba esetén dobjuk tovább
  }

  entries = entries.concat(resp.result.entries || []);
  while (resp.result.has_more) {
    resp = await dbx.filesListFolderContinue({ cursor: resp.result.cursor });
    entries = entries.concat(resp.result.entries || []);
  }
  return entries;
}

// ---- Helper: "9. September" (de-DE, nagy kezdőbetű) ----
function getMonthLabel(date) {
  const n = date.getMonth() + 1;
  let name = date.toLocaleString('de-DE', { month: 'long' });
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return `${n}. ${name}`;
}

// ---- Helper: biztonságos HU dátum string ----
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

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const currentYear = String(now.getFullYear());
    const currentMonthLabel = getMonthLabel(now);
    
    const prevYear = String(prevMonthDate.getFullYear());
    const prevMonthLabel = getMonthLabel(prevMonthDate);

    const relevantMonthLabels = [currentMonthLabel];
    if (currentMonthLabel !== prevMonthLabel) {
        relevantMonthLabels.push(prevMonthLabel);
    }
    
    const yearsToScan = [currentYear];
    if (currentYear !== prevYear && !yearsToScan.includes(prevYear)) {
        yearsToScan.push(prevYear);
    }
    
    const result = {};

    for (const year of yearsToScan) {
        const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;
        const userFolders = (await listFolderAll(dbx, basePath)).filter(e => e['.tag'] === 'folder');

        for (const uf of userFolders) {
            const userName = uf.name;
            if (!result[userName]) { result[userName] = []; }

            const monthFolders = (await listFolderAll(dbx, uf.path_lower)).filter(e => e['.tag'] === 'folder');

            for (const mf of monthFolders) {
                if (relevantMonthLabels.includes(mf.name)) {
                    const files = (await listFolderAll(dbx, mf.path_lower)).filter(e => e['.tag'] === 'file');
                    
                    files.forEach(f => {
                        const uploadedAt = f.server_modified || f.client_modified || null;
                        result[userName].push({
                            folder: mf.name,
                            name: f.name,
                            path: f.path_lower,
                            uploadedAt,
                            uploadedAtDisplay: formatHu(uploadedAt)
                        });
                    });
                }
            }
        }
    }
    
    for (const user in result) {
      result[user].sort((a, b) => {
        const da = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const db = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        return db - da;
      });
    }

    const ordered = Object.keys(result)
      .sort((a, b) => a.localeCompare(b, 'hu-HU'))
      .reduce((acc, k) => { acc[k] = result[k]; return acc; }, {});

    return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(ordered) };

  } catch (error) {
    console.error('getAllUploads hiba:', error);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: error.message || 'Szerver hiba getAllUploads-ben.' })
    };
  }
};
