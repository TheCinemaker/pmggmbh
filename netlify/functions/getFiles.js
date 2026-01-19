// netlify/functions/getFiles.js
const { Dropbox } = require('dropbox');

const REQUIRED = ['ALLOWED_ORIGIN', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'];
function assertEnv() {
  const miss = REQUIRED.filter(k => !process.env[k]);
  if (miss.length) throw new Error(`Hiányzó környezeti változók: ${miss.join(', ')}`);
}

const headers = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

async function listAll(dbx, path) {
  try {
    let res = await dbx.filesListFolder({ path });
    const out = [...(res.result.entries || [])];
    while (res.result.has_more) {
      res = await dbx.filesListFolderContinue({ cursor: res.result.cursor });
      out.push(...(res.result.entries || []));
    }
    return out;
  } catch (err) {
    // Ha a mappa nincs meg → üres lista (nem hiba)
    if (err?.status === 409) return [];
    throw err;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  try { assertEnv(); }
  catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ message: e.message }) }; }

  try {
    const qs = event.queryStringParameters || {};
    const userId = (qs.userId || '').trim();
    const selectedMonth = (qs.selectedMonth || qs.selectedFolder || qs.month || '').trim();

    console.log(`[getFiles] Request: userId="${userId}", selectedMonth="${selectedMonth}"`);

    if (!userId || !selectedMonth) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Hiányzó felhasználó vagy hónap.' }) };
    }

    const dbx = new Dropbox({
      refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
      clientId: process.env.DROPBOX_APP_KEY,
      clientSecret: process.env.DROPBOX_APP_SECRET
    });

    const year = new Date().getFullYear();
    // Fontos: NFC normalizáció a speciális karakterek (ä, á, ő) miatt!
    const folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${year}/${userId}/${selectedMonth}`.normalize('NFC');

    console.log(`[getFiles] Listing folder: "${folderPath}"`);

    const entries = await listAll(dbx, folderPath);
    const files = (entries || []).filter(e => e['.tag'] === 'file');

    // Nem generálunk ideiglenes linket listázáskor (lassú és felesleges API hívás)
    // A frontend "Megtekintés" gombja majd lekéri on-demand a getFileLink-en keresztül
    const items = files.map(f => {
      const uploadedAt = f.server_modified || f.client_modified || null;
      return {
        id: f.id,
        name: f.name,
        path_lower: f.path_lower,
        path_display: f.path_display,
        uploadedAt,
        uploadedAtDisplay: uploadedAt,
        link: null // Mindig null, hogy a frontend gombot jelenítsen meg
      };
    });

    // legfrissebb elöl
    items.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

    return { statusCode: 200, headers, body: JSON.stringify(items) };
  } catch (error) {
    console.error('getFiles.js fatális hiba:', error);
    // Részletesebb logolás Dropbox hibákhoz
    if (error.error) {
      console.error('Dropbox hiba részletek:', JSON.stringify(error.error));
    }

    const statusCode = error.status || 500;
    const errorMsg = error.error?.error_summary || error.message || 'Szerver oldali hiba történt.';

    return {
      statusCode: statusCode,
      headers,
      body: JSON.stringify({
        error: errorMsg,
        details: error.error // Opcionális, de segít a debugban
      })
    };
  }
};
