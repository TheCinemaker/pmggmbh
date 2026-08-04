const { google } = require('googleapis');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME_USERS;

// Laza normalizálás: mindenből csinálunk +… formátumot, ország-függetlenül
function normalizePhoneLoose(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2);
  return '+' + s;
}

exports.handler = async (event) => {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': reqOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // env ellenőrzés
    const missing = ['GOOGLE_CLIENT_EMAIL','GOOGLE_PRIVATE_KEY','GOOGLE_SHEET_ID','GOOGLE_SHEET_NAME_USERS']
      .filter(k => !process.env[k]);
    if (missing.length) {
      throw new Error(`Hiányzó környezeti változók: ${missing.join(', ')}`);
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // --- Tartomány kiterjesztése az J oszlopra (A:J) ---
    const range = `${SHEET_NAME}!A:J`; 
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range
    });

    let rows = response.data.values || [];

    // Fejléc-sor eldobása (heurisztika)
    if (rows.length) {
      const head = rows[0].join(' ').toLowerCase();
      if (/(pin|lang|role|phone|email|type|ceg|munkarend|baustelle)/.test(head)) {
        rows = rows.slice(1);
      }
    }

    if (!rows.length) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    const users = rows
      .filter(r => r && r[0]) // legyen id / displayName
      .map(r => {
        const id        = (r[0] || '').trim();
        const pin       = (r[1] || '').trim();
        const userType  = (r[2] || 'oralapos').trim().toLowerCase();
        const userLang  = (r[3] || 'hu').trim().toLowerCase();
        const userRole  = (r[4] || 'user').trim().toLowerCase();
        const phone     = normalizePhoneLoose(r[5] || '');
        const email     = (r[6] || '').trim();
        const company   = (r[7] || '').trim() || null;
        const munkarend = (r[8] || '').trim();
        const baustelle = (r[9] || '').trim();

        return {
          id,
          displayName: id,
          pin,
          userType,
          userLang,
          userRole,
          phone,
          email,
          company,
          munkarend,
          baustelle
        };
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(users),
    };
  } catch (error) {
    console.error('Hiba (getUsers):', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Hiba a felhasználók lekérésekor.' }),
    };
  }
};
