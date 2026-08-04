const { Dropbox } = require('dropbox');
const { cleanEnv, describeDbxError } = require('./_dbx-helpers');

const baseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

function formatDbxPath(pathStr) {
  if (!pathStr) return '';
  let s = String(pathStr).trim();
  if (!s.startsWith('/')) s = '/' + s;
  return s;
}

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
      body: JSON.stringify({ message: 'Dropbox API error: missing credentials in environment.' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    let { fromPath, newName } = body;

    if (!fromPath || !newName) {
      return {
        statusCode: 400,
        headers: baseHeaders,
        body: JSON.stringify({ message: 'fromPath and newName are required.' })
      };
    }

    const formattedFromPath = formatDbxPath(fromPath);

    // Extract old filename and extension
    const pathParts = formattedFromPath.split('/');
    const oldFileName = pathParts.pop();
    const oldExtMatch = oldFileName.match(/\.([a-zA-Z0-9]+)$/);
    const oldExt = oldExtMatch ? oldExtMatch[1].toLowerCase() : '';

    let cleanNewName = newName.trim();
    // If user provided name without extension, append old extension automatically
    if (oldExt && !cleanNewName.toLowerCase().endsWith('.' + oldExt)) {
      cleanNewName += '.' + oldExt;
    }

    pathParts.push(cleanNewName);
    const formattedToPath = pathParts.join('/');

    console.log(`[Rename] Moving file from "${formattedFromPath}" to "${formattedToPath}"`);

    const dbx = new Dropbox({
      refreshToken: DROPBOX_REFRESH_TOKEN,
      clientId: DROPBOX_APP_KEY,
      clientSecret: DROPBOX_APP_SECRET
    });

    const result = await dbx.filesMoveV2({
      from_path: formattedFromPath,
      to_path: formattedToPath,
      autorename: true
    });

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({
        success: true,
        message: 'File successfully renamed!',
        fromPath: formattedFromPath,
        toPath: formattedToPath,
        result: result.result
      })
    };
  } catch (err) {
    console.error('[Rename] Error:', err);
    const dbxErr = describeDbxError(err);
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({
        message: dbxErr.summary || err.message || 'Dropbox rename error',
        error: dbxErr
      })
    };
  }
};
