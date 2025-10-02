const { Dropbox } = require('dropbox');

const REFRESH_TOKEN  = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY        = process.env.DROPBOX_APP_KEY;
const APP_SECRET     = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders };
  }

  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const fileId = (body.fileId || '').trim();
    const path   = (body.path || '').trim();

    if (!fileId && !path) {
      return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'fileId or path required' }) };
    }

    const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

    // Próbáljuk először temp linkkel
    try {
      const t = await dbx.filesGetTemporaryLink({ path: fileId || path });
      return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: t.result.link }) };
    } catch (e1) {
      console.warn('Temp link bukott:', (fileId || path), e1?.status, e1?.error?.error_summary || e1?.message);

      // Share link fallback – ha ID volt, kell path-ot szereznünk
      try {
        let usePath = path;
        if (!usePath) {
          const meta = await dbx.filesGetMetadata({ path: fileId });
          usePath = meta?.result?.path_lower;
        }
        if (!usePath) throw new Error('No path available for share link');

        const ls = await dbx.sharingListSharedLinks({ path: usePath, direct_only: true });
        let sl = ls?.result?.links?.[0]?.url || null;

        if (!sl) {
          const cr = await dbx.sharingCreateSharedLinkWithSettings({ path: usePath });
          sl = cr?.result?.url || null;
        }
        if (!sl) throw new Error('No share link created');

        const direct = sl.includes('?') ? `${sl}&raw=1` : `${sl}?raw=1`;
        return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ url: direct }) };
      } catch (e2) {
        console.warn('Share link bukott:', e2?.status, e2?.error?.error_summary || e2?.message);
        return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e2?.error?.error_summary || e2?.message || 'Link create failed' }) };
      }
    }
  } catch (e) {
    console.error('getFileLink fatális:', e);
    return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: e.message || 'Server error' }) };
  }
};
