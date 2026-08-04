// netlify/functions/saveNote.js
const { Dropbox } = require('dropbox');

const REFRESH_TOKEN = (process.env.DROPBOX_REFRESH_TOKEN || '').trim();
const APP_KEY = (process.env.DROPBOX_APP_KEY || '').trim();
const APP_SECRET = (process.env.DROPBOX_APP_SECRET || '').trim();
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();

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
  }
  return `${status}${body || e.message || 'Unknown error'}`;
}

function formatFilenameDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || ALLOWED_ORIGIN;
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}

    const folderPath = (body.folderPath || body.path || '').trim();
    const noteText = (body.noteText || body.text || '').trim();
    const customName = (body.fileName || '').trim();

    if (!folderPath) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'folderPath is required' }) };
    }
    if (!noteText) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'noteText is required' }) };
    }

    const cleanFolderPath = folderPath.replace(/\/+$/, '');
    const timeStamp = formatFilenameDate();
    const fileName = customName || `notes_${timeStamp}.txt`;
    const targetPath = `${cleanFolderPath}/${fileName}`;

    console.log(`[saveNote] Saving note to: "${targetPath}"`);

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    const fileContent = Buffer.from(noteText, 'utf8');

    const uploadRes = await dbx.filesUpload({
      path: targetPath,
      contents: fileContent,
      mode: { '.tag': 'overwrite' },
      autorename: true
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Jegyzet sikeresen elmentve!',
        fileName,
        path: uploadRes?.result?.path_display || targetPath,
        id: uploadRes?.result?.id
      })
    };
  } catch (error) {
    console.error('[saveNote] Hiba:', error);
    const detailMsg = describeDbxError(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: detailMsg, error: detailMsg })
    };
  }
};
