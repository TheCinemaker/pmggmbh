// netlify/functions/getFileLink.js
const { Dropbox } = require('dropbox');
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY      = process.env.DROPBOX_APP_KEY;
const APP_SECRET   = process.env.DROPBOX_APP_SECRET;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const { fileId } = JSON.parse(event.body || '{}');
    if (!fileId) return { statusCode: 400, body: JSON.stringify({ error: 'fileId required' }) };

    const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

    // 1) temp link ID-vel
    try {
      const t = await dbx.filesGetTemporaryLink({ path: fileId });
      return { statusCode: 200, body: JSON.stringify({ url: t.result.link }) };
    } catch (e1) {
      // 2) nincs temp link -> megpróbálunk share linket keresni/létrehozni
      try {
        // sajnos itt nincs path_lower, ezért előbb meta-t kérünk, hogy legyen path
        const meta = await dbx.filesGetMetadata({ path: fileId });
        const pathLower = meta?.result?.path_lower;

        // már létező megosztás?
        const ls = await dbx.sharingListSharedLinks({ path: pathLower, direct_only: true });
        let sl = ls?.result?.links?.[0]?.url || null;

        if (!sl) {
          const cr = await dbx.sharingCreateSharedLinkWithSettings({ path: pathLower });
          sl = cr?.result?.url || null;
        }
        if (!sl) throw new Error('No share link');

        const direct = sl.includes('?') ? `${sl}&raw=1` : `${sl}?raw=1`;
        return { statusCode: 200, body: JSON.stringify({ url: direct }) };
      } catch (e2) {
        return { statusCode: 500, body: JSON.stringify({ error: e2?.error?.error_summary || e2?.message || 'Link create failed' }) };
      }
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
