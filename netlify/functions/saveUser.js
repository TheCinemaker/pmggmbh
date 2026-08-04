const { google } = require('googleapis');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME_USERS;

exports.handler = async (event) => {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin || process.env.ALLOWED_ORIGIN || '*';
  const headers = {
    'Access-Control-Allow-Origin': reqOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 450, headers, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      action = 'update',
      id,
      newId,
      pin = '',
      userType = 'oralapos',
      userLang = 'hu',
      userRole = 'user',
      phone = '',
      email = '',
      company = '',
      munkarend = '',
      baustelle = ''
    } = body;

    if (!id && action !== 'add') {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Mitarbeiter ID ist erforderlich!' }) };
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'] // READ & WRITE
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const range = `${SHEET_NAME}!A:J`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range
    });

    const rows = response.data.values || [];

    // Find row index (1-based for Google Sheets API)
    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const rId = String(rows[i][0] || '').trim();
      if (rId && rId.toLowerCase() === String(id).trim().toLowerCase()) {
        targetRowIndex = i + 1; // 1-based index
        break;
      }
    }

    if (action === 'add') {
      const targetId = (newId || id || '').trim();
      if (!targetId) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Név_ID ist erforderlich!' }) };
      }
      const newRowValues = [
        targetId,
        String(pin).trim(),
        String(userType).trim(),
        String(userLang).trim(),
        String(userRole).trim(),
        String(phone).trim(),
        String(email).trim(),
        String(company).trim(),
        String(munkarend).trim(),
        String(baustelle).trim()
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRowValues] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Neuer Mitarbeiter erfolgreich hinzugefügt.' })
      };
    }

    if (targetRowIndex === -1) {
      return { statusCode: 444, headers, body: JSON.stringify({ message: `Mitarbeiter "${id}" wurde in Google Sheet nicht gefunden.` }) };
    }

    if (action === 'set_inactive') {
      // Set company column H (index 8 in 1-based columns: A=1, B=2, C=3, D=4, E=5, F=6, G=7, H=8)
      const rowRange = `${SHEET_NAME}!H${targetRowIndex}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: rowRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Ausgeschieden']] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Mitarbeiter als Ausgeschieden markiert.' })
      };
    }

    // Update existing row
    const finalId = (newId || id || '').trim();
    const updatedRowValues = [
      finalId,
      String(pin).trim(),
      String(userType).trim(),
      String(userLang).trim(),
      String(userRole).trim(),
      String(phone).trim(),
      String(email).trim(),
      String(company).trim(),
      String(munkarend).trim(),
      String(baustelle).trim()
    ];

    const updateRange = `${SHEET_NAME}!A${targetRowIndex}:J${targetRowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: updateRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRowValues] }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Mitarbeiterdaten erfolgreich aktualisiert.' })
    };

  } catch (error) {
    console.error('Hiba (saveUser):', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message || 'Fehler beim Speichern der Mitarbeiterdaten.' })
    };
  }
};
