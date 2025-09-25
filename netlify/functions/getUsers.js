const { google } = require('googleapis');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME_USERS;

const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Laza normalizálás: mindenből csinálunk +… formátumot, ország-függetlenül
function normalizePhoneLoose(raw) {
  if (!raw) return '';
  let s = String(raw).trim();

  // csak szám és + maradjon
  s = s.replace(/[^\d+]/g, '');

  if (s.startsWith('+')) return s;             // már jó
  if (s.startsWith('00')) return '+' + s.slice(2); // 00… -> +…

  // egyébként egyszerűen tegyünk elé pluszt (nem okoskodunk országkóddal)
  return '+' + s;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    // env ellenőrzés
    const missing = ['ALLOWED_ORIGIN','GOOGLE_CLIENT_EMAIL','GOOGLE_PRIVATE_KEY','GOOGLE_SHEET_ID','GOOGLE_SHEET_NAME_USERS']
      .filter(k => !process.env[k]);
    if (missing.length) {
      throw new Error(`Hiányzó környezeti változók: ${missing.join(', ')}`);
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // A:id  B:pin  C:type  D:lang  E:role  F:phone  G:email
    const range = `${SHEET_NAME}!A:G`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range
    });

    let rows = response.data.values || [];

    // Ha van fejléc-sor, dobjuk el (heurisztika)
    if (rows.length) {
      const head = rows[0].join(' ').toLowerCase();
      if (/(pin|lang|role|phone|email|type)/.test(head)) {
        rows = rows.slice(1);
      }
    }

    if (!rows.length) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    const users = rows
      .filter(r => r && r[0]) // legyen id / displayName
      .map(r => {
        const id       = (r[0] || '').trim();
        const userType = (r[2] || 'oralapos').trim().toLowerCase();
        const userLang = (r[3] || 'hu').trim().toLowerCase();
        const userRole = (r[4] || 'user').trim().toLowerCase();
        const phone    = normalizePhoneLoose(r[5] || '');
        const email    = (r[6] || '').trim();

        return {
          id,
          displayName: id,
          userType,
          userLang,
          userRole,
          phone,
          email
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
