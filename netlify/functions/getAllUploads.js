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

const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();
const APP_KEY = (process.env.DROPBOX_APP_KEY || '').trim();
const APP_SECRET = (process.env.DROPBOX_APP_SECRET || '').trim();
const REFRESH_TOKEN = (process.env.DROPBOX_REFRESH_TOKEN || '').trim();
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ? process.env.ADMIN_API_KEY.trim() : null;

function describeDbxError(e) {
  if (!e) return 'Unknown error';
  const status = e.status ? `[${e.status}] ` : '';
  let body = '';
  if (typeof e.error === 'string') {
    body = e.error;
  } else if (e.error?.error_description) {
    body = `${e.error.error}: ${e.error.error_description}`;
  } else if (e.error?.error_summary) {
    body = e.error.error_summary;
  } else if (e.error?.error) {
    body = typeof e.error.error === 'string' ? e.error.error : JSON.stringify(e.error.error);
  }
  return `${status}${body || e.message || 'Unknown error'}`;
}

const baseHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
  'Content-Type': 'application/json'
};

// ---- Helper: lapozásos listázás teljes mappára ----
async function listFolderAll(dbx, path, recursive = false) {
  let entries = [];
  let resp;
  try {
    console.log(`[DEBUG] Attempting to list folder: "${path}" (recursive: ${recursive})`);
    resp = await dbx.filesListFolder({ path, recursive });
    console.log(`[DEBUG] Successfully listed folder: "${path}", found ${resp.result.entries?.length || 0} entries`);
  } catch (err) {
    // Részletes hibainformáció naplózása
    console.error('=== DROPBOX API ERROR ===');
    console.error('Path:', path);
    console.error('Status:', err?.status);
    console.error('Error summary:', err?.error?.error_summary);
    console.error('Full error object:', JSON.stringify(err, null, 2));
    console.error('Error.error structure:', JSON.stringify(err?.error, null, 2));

    // Dropbox 409 hibák kezelése (általában "not found" vagy path hiba)
    if (err?.status === 409) {
      // Több lehetséges hibaobjektum struktúra kezelése
      const tag = err?.error?.error?.path?.['.tag']
        || err?.error?.error?.path?.reason?.['.tag']
        || err?.error?.error?.['.tag']
        || err?.error?.['.tag'];

      const errorSummary = err?.error?.error_summary || '';

      console.warn(`[409 ERROR] Tag: ${tag}, Error summary: ${errorSummary}`);

      // Ha "not_found" vagy "path" tag, vagy az error_summary tartalmazza a "not_found"-ot
      const isNotFound = tag === 'not_found'
        || tag === 'path'
        || errorSummary.includes('not_found')
        || errorSummary.includes('path/not_found');

      if (isNotFound) {
        console.log(`Mappa nem található: ${path}, üres listát adunk vissza`);
        return []; // Üres lista, ha a mappa nem található
      }

      // Bármilyen más 409-es hiba esetén is próbáljuk meg kezelni
      console.warn(`409-es hiba a következő mappánál: ${path}, üres listát adunk vissza. Error summary: ${errorSummary}`);
      return [];
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
    const currentMonth = now.getMonth() + 1; // 1-12

    const prevYear = String(prevMonthDate.getFullYear());
    const prevMonth = prevMonthDate.getMonth() + 1; // 1-12

    // Releváns hónapok számai (pl. [1, 12] ha január van és az előző hónap december)
    const relevantMonths = [currentMonth];
    if (currentMonth !== prevMonth) {
      relevantMonths.push(prevMonth);
    }

    const yearsToScan = [currentYear];
    if (currentYear !== prevYear && !yearsToScan.includes(prevYear)) {
      yearsToScan.push(prevYear);
    }

    console.log('[DEBUG] Relevant months:', relevantMonths);
    console.log('[DEBUG] Years to scan:', yearsToScan);

    const result = {};

    for (const year of yearsToScan) {
      const basePath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}`;
      const entries = await listFolderAll(dbx, basePath, true);

      entries.forEach(f => {
        if (f['.tag'] !== 'file') return;

        const pathToUse = f.path_display || f.path_lower || '';
        const parts = pathToUse.split('/').filter(Boolean);

        // Szerkezet: ["PMG Mindenes - PMG ALLES", "Stundenzettel 2026", "Munkatárs Neve", "Hónap Mappa", "Fájlnév"]
        if (parts.length < 5) return;

        const userName = parts[2];
        const monthFolderName = parts[3];

        const monthMatch = monthFolderName.match(/^(\d+)\./);
        if (monthMatch) {
          const folderMonth = parseInt(monthMatch[1], 10);
          if (relevantMonths.includes(folderMonth)) {
            if (!result[userName]) { result[userName] = []; }
            const uploadedAt = f.server_modified || f.client_modified || null;
            result[userName].push({
              folder: monthFolderName,
              name: f.name,
              path: pathToUse,
              path_lower: f.path_lower,
              path_display: f.path_display,
              id: f.id,
              uploadedAt,
              uploadedAtDisplay: formatHu(uploadedAt)
            });
          }
        }
      });
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
    const detailMsg = describeDbxError(error);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: detailMsg, error: detailMsg })
    };
  }
};
