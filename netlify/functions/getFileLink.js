// netlify/functions/getFileLink.js
const { Dropbox } = require('dropbox');

const REQUIRED = ['DROPBOX_REFRESH_TOKEN', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'ALLOWED_ORIGIN'];
function assertEnv() {
  const miss = REQUIRED.filter((k) => !process.env[k]);
  if (miss.length) throw new Error(`Hiányzó környezeti változók: ${miss.join(', ')}`);
}

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

exports.handler = async (event) => {
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
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const fileId = (body.fileId || '').trim();   // pl. "id:abc123"
  const path   = (body.path   || '').trim();   // pl. "/PMG ... /file.pdf"

  if (!fileId && !path) {
    return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'fileId vagy path kötelező' }) };
  }

  const dbx = new Dropbox({
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
    clientId: process.env.DROPBOX_APP_KEY,
    clientSecret: process.env.DROPBOX_APP_SECRET,
  });

  try {
    // --- 1) TEMP LINK elsőre ID-vel (ha van), aztán path-szal ---
    // Dropbox 'path' paramja elfogad "id:..." és tényleges útvonalat is.
    const firstTry = fileId || path;
    try {
      const t = await dbx.filesGetTemporaryLink({ path: firstTry });
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: t.result.link }) };
    } catch (e1) {
      console.warn('Temp link bukott (first):', firstTry, e1?.status, e1?.error?.error_summary || e1?.message);

      // ha elsőre ID-vel próbáltunk és bukott, próbáljuk path-szal is (ha van)
      if (fileId && path) {
        try {
          const t2 = await dbx.filesGetTemporaryLink({ path });
          return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: t2.result.link }) };
        } catch (e2) {
          console.warn('Temp link bukott (path fallback):', path, e2?.status, e2?.error?.error_summary || e2?.message);
        }
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
      console.warn('Share link bukott:', eShare?.status, eShare?.error?.error_summary || eShare?.message);
      const msg = eShare?.error?.error_summary || eShare?.message || 'Link create failed';
      const code = /not_found|lookup_failed/i.test(msg) ? 404 : 500;
      return { statusCode: code, headers: baseHeaders, body: JSON.stringify({ error: msg }) };
    }
  } catch (e) {
    console.error('getFileLink fatális:', e);
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e.message || 'Server error' }) };
  }
};
