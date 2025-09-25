const { Dropbox } = require('dropbox');

// --- Konfiguráció és Ellenőrzés ---
const requiredEnvVars = ['ALLOWED_ORIGIN', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'];

function checkEnvVars() {
  const missing = requiredEnvVars.filter(n => !process.env[n]);
  if (missing.length) throw new Error(`Hiányzó környezeti változók: ${missing.join(', ')}`);
}

try {
  checkEnvVars();
} catch (error) {
  exports.handler = async () => ({ statusCode: 500, body: JSON.stringify({ message: error.message }) });
  return;
}

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const qs = event.queryStringParameters || {};
    const userIdRaw = qs.userId;
    const monthRaw = qs.selectedMonth || qs.selectedFolder || qs.month;

    if (!userIdRaw || !monthRaw) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Hiányzó felhasználó vagy hónap.' }) };
    }

    // URL-dekódolás + trim
    const userId = decodeURIComponent(userIdRaw).trim();
    const selectedMonth = decodeURIComponent(monthRaw).trim();

    const currentYear = new Date().getFullYear();
    const folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}/${selectedMonth}`;

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    // --- Fájlok listázása lapozással ---
    let entries = [];
    let listResp = await dbx.filesListFolder({ path: folderPath });

    entries = entries.concat(listResp.result.entries || []);
    while (listResp.result.has_more) {
      listResp = await dbx.filesListFolderContinue({ cursor: listResp.result.cursor });
      entries = entries.concat(listResp.result.entries || []);
    }

    const files = entries.filter(e => e['.tag'] === 'file');

    if (files.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    // Ideiglenes linkek kérése párhuzamosan
    const linkResults = await Promise.all(
      files.map(f => dbx.filesGetTemporaryLink({ path: f.path_lower }))
    );

    const fileData = linkResults.map(r => ({
      name: r.result.metadata.name,
      link: r.result.link
    }));

    return { statusCode: 200, headers, body: JSON.stringify(fileData) };

  } catch (error) {
    // Not found mappa: adj vissza üres listát
    const tag = error?.error?.error?.path?.reason?.['.tag'] || error?.error?.error?.['.tag'];
    if (error?.status === 409 && (tag === 'not_found' || tag === 'path')) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    console.error('Dropbox fájllista hiba:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Hiba a fájlok lekérésekor.' })
    };
  }
};
