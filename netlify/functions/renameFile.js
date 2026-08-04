const { Dropbox } = require('dropbox');
const { cleanEnv, describeDbxError } = require('./_dbx-helpers');

const baseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: baseHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  const { DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET } = cleanEnv(process.env);

  if (!DROPBOX_REFRESH_TOKEN || !DROPBOX_APP_KEY || !DROPBOX_APP_SECRET) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ message: 'Dropbox API hiba: nincsenek beállítva a környezeti változók.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { fromPath, newName } = body;

    if (!fromPath || !newName) {
      return {
        statusCode: 400,
        headers: baseHeaders,
        body: JSON.stringify({ message: 'fromPath és newName megadása kötelező.' })
      };
    }

    const dbx = new Dropbox({
      refreshToken: DROPBOX_REFRESH_TOKEN,
      clientId: DROPBOX_APP_KEY,
      clientSecret: DROPBOX_APP_SECRET
    });

    const pathParts = fromPath.split('/');
    pathParts.pop(); // Remove old filename
    pathParts.push(newName.trim()); // Append new filename
    const toPath = pathParts.join('/');

    console.log(`[Rename] Moving file from "${fromPath}" to "${toPath}"`);

    const result = await dbx.filesMoveV2({
      from_path: fromPath,
      to_path: toPath,
      autorename: true
    });

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Fájl sikeresen átnevezve!',
        fromPath,
        toPath,
        result: result.result
      })
    };
  } catch (err) {
    console.error('[Rename] Hiba:', err);
    const dbxErr = describeDbxError(err);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({
        message: dbxErr.summary || err.message || 'Hiba a fájl átnevezése során',
        error: dbxErr
      })
    };
  }
};
