const { Dropbox } = require('dropbox');
const Busboy = require('busboy');

const requiredEnvVars = [ 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN' ];

function checkEnvVars() {
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Hiányzó környezeti változók: ${missingVars.join(', ')}`);
  }
}

try {
  checkEnvVars();
} catch (error) {
  exports.handler = async () => ({
    statusCode: 500,
    body: JSON.stringify({ message: error.message }),
  });
}

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;

const parseMultipartForm = (event) => {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileData = null;
    const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
    busboy.on('file', (fieldname, file, filename) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => { fileData = { content: Buffer.concat(chunks), filename: filename.filename }; });
    });
    busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
    busboy.on('finish', () => {
      if (!fileData) return reject(new Error('Hiányzik a fájl.'));
      resolve({ fields, file: fileData });
    });
    busboy.on('error', err => reject(err));
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    busboy.end(body);
  });
};

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || process.env.ALLOWED_ORIGIN || '*';
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type' };
  if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

  try {
    const { fields, file } = await parseMultipartForm(event);
    const { employeeName, selectedMonth, weekRange, docType, customName, folderPath } = fields;

    const currentYear = new Date().getFullYear();
    const origFilename = file.filename || 'file';
    const extMatch = origFilename.match(/\.([a-zA-Z0-9]+)$/);
    const fileExtension = extMatch ? extMatch[1].toLowerCase() : 'jpg';

    // Construct docType prefix
    let prefix = '';
    if (docType === 'urlaub') prefix = 'Urlaub';
    else if (docType === 'krank') prefix = 'Krankmeldung';
    else if (docType === 'parkticket') prefix = 'Parkticket';
    else if (docType === 'oeffi') prefix = 'Oeffi_Ticket';

    let baseName = (customName || weekRange || origFilename.replace(/\.[^/.]+$/, "")).trim();
    if (prefix && !baseName.toLowerCase().includes(prefix.toLowerCase())) {
      baseName = `${prefix}_${baseName}`;
    }

    let finalFileName = baseName;
    if (!finalFileName.toLowerCase().endsWith('.' + fileExtension)) {
      finalFileName += '.' + fileExtension;
    }

    let dropboxPath = '';
    if (folderPath) {
      const cleanFolder = folderPath.replace(/\/+$/, '');
      dropboxPath = cleanFolder.startsWith('/') ? `${cleanFolder}/${finalFileName}` : `/${cleanFolder}/${finalFileName}`;
    } else if (employeeName && selectedMonth) {
      dropboxPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${employeeName}/${selectedMonth}/${finalFileName}`;
    } else {
      throw new Error('Mitarbeiter és hónap vagy folderPath megadása kötelező.');
    }

    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET,
    });

    const uploadRes = await dbx.filesUpload({
      path: dropboxPath,
      contents: file.content,
      mode: 'overwrite',
      autorename: true
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Sikeres feltöltés: ${finalFileName}`,
        path: uploadRes?.result?.path_display || dropboxPath
      }),
    };
  } catch (error) {
    console.error('Dropbox feltöltési hiba:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
    };
  }
};
