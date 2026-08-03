// netlify/functions/getFileLink.js
const { Dropbox } = require('dropbox');

const REQUIRED = ['DROPBOX_REFRESH_TOKEN', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET'];
function assertEnv() {
  const miss = REQUIRED.filter((k) => !process.env[k]);
  if (miss.length) throw new Error(`Hiányzó környezeti változók: ${miss.join(', ')}`);
}

// A Dropbox SDK a nem-JSON hibatestet (pl. a hiányzó scope 400-as, sima szöveges
// válaszát) az e.error mezőben adja vissza, az e.message viszont csak annyi:
// "Response failed with a 400 code". Ezért mindkettőt ki kell olvasni.
function describeDbxError(e) {
  const body = typeof e?.error === 'string' ? e.error : e?.error?.error_summary;
  return body || e?.message || 'Unknown error';
}

function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || process.env.ALLOWED_ORIGIN || '*';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

exports.handler = async (event) => {
  const baseHeaders = getCorsHeaders(event);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    assertEnv();
  } catch (e) {
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e.message }) };
  }

  // Body parse (védetten)
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { }

  const fileId = (body.fileId || '').trim();   // pl. "id:abc123"
  // Normalizáljuk a path-ot is!
  const rawPath = (body.path || '').trim();  // pl. "/PMG ... /file.pdf"
  const path = rawPath.normalize('NFC');

  console.log(`[getFileLink] Request: fileId="${fileId}", path="${path}"`);

  if (!fileId && !path) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'fileId vagy path kötelező' }) };
  }

  const dbx = new Dropbox({
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
  });

  const problems = [];

  try {
    // --- 1) TEMP LINK próbálkozások több elérési úttal ---
    const candidates = [fileId, path, rawPath, rawPath ? rawPath.normalize('NFC') : '', rawPath ? rawPath.normalize('NFD') : ''].filter(Boolean);
    for (const candidate of candidates) {
      try {
        console.log(`[getFileLink] Trying temporary link with: "${candidate}"`);
        const t = await dbx.filesGetTemporaryLink({ path: candidate });
        if (t?.result?.link) {
          return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: t.result.link, link: t.result.link }) };
        }
      } catch (e1) {
        const desc = describeDbxError(e1);
        problems.push(`temp_link(${candidate}): ${e1?.status} ${desc}`);
        console.warn('Temp link candidate bukott:', candidate, e1?.status, desc);
      }
    }

    // --- 2) SHARE LINK fallback ---
    // Ha nincs path, kérjük le metával
    let usePath = path;
    if (!usePath) {
      try {
        const meta = await dbx.filesGetMetadata({ path: fileId });
        usePath = meta?.result?.path_lower || meta?.result?.path_display || null;
      } catch (eMeta) {
        console.warn('filesGetMetadata bukott:', fileId, eMeta?.status, eMeta?.error?.error_summary || eMeta?.message);
      }
    }

    if (!usePath) {
      // sem temp, sem path — valószínűleg rossz ID vagy nincs jogosultság
      return { statusCode: 404, headers: baseHeaders, body: JSON.stringify({ error: 'Fájl nem található (nincs elérhető path a share linkhez)' }) };
    }

    try {
      // Meglévő link?
      const ls = await dbx.sharingListSharedLinks({ path: usePath, direct_only: true });
      let sl = ls?.result?.links?.[0]?.url || null;

      if (!sl) {
        const cr = await dbx.sharingCreateSharedLinkWithSettings({ path: usePath });
        sl = cr?.result?.url || null;
      }
      if (!sl) throw new Error('Share link nem jött létre');

      const direct = sl.includes('?') ? `${sl}&raw=1` : `${sl}?raw=1`;
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: direct }) };
    } catch (eShare) {
      const msg = describeDbxError(eShare);
      console.warn('Share link bukott:', eShare?.status, msg);
      problems.push(`share_link(${usePath}): ${eShare?.status} ${msg}`);
      const code = /not_found|lookup_failed/i.test(msg) ? 404 : 500;
      return { statusCode: code, headers: baseHeaders, body: JSON.stringify({ error: msg, attempts: problems }) };
    }
  } catch (e) {
    console.error('getFileLink fatális:', e);

    // Részletesebb hibaüzenet visszaküldése
    const errMsg = describeDbxError(e);
    const statusCode = e.status || 500;

    return {
      statusCode: statusCode,
      headers: baseHeaders,
      body: JSON.stringify({
        error: errMsg,
        details: e.error,
        attempts: problems
      })
    };
  }
};
