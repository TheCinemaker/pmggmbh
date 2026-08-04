const { google } = require('googleapis');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
const CLIENT_EMAIL   = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID       = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME     = process.env.GOOGLE_SHEET_NAME_USERS || 'Munkások';

function formatSheetRange(cells) {
  const safeName = (SHEET_NAME || '').replace(/'/g, "''");
  return `'${safeName}'!${cells}`;
}

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
      baustelle = '',
      vorarbeiterName = '',
      vorarbeiterTelefon = ''
    } = body;

    const targetId = (newId || id || '').trim();

    if (!targetId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Név_ID (Mitarbeiter ID) ist erforderlich!' }) };
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'] // READ & WRITE
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Read full sheet to locate existing row index
    const readRange = formatSheetRange('A:L');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: readRange
    });

    const rows = response.data.values || [];

    // Find row index (1-based index for Google Sheets API)
    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const rId = String(rows[i][0] || '').trim();
      if (rId && (rId.toLowerCase() === String(id || '').trim().toLowerCase() || rId.toLowerCase() === targetId.toLowerCase())) {
        targetRowIndex = i + 1; // 1-based index
        break;
      }
    }

    // ACTION: ADD NEW WORKER
    if (action === 'add') {
      // If worker already exists, update instead of duplicating
      if (targetRowIndex !== -1) {
        const updateRowValues = [
          targetId,
          String(pin).trim(),
          String(userType).trim(),
          String(userLang).trim(),
          String(userRole).trim(),
          String(phone).trim(),
          String(email).trim(),
          String(company).trim(),
          String(munkarend).trim(),
          String(baustelle).trim(),
          String(vorarbeiterName).trim(),
          String(vorarbeiterTelefon).trim()
        ];

        const updateRange = formatSheetRange(`A${targetRowIndex}:L${targetRowIndex}`);
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: updateRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [updateRowValues] }
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: `Mitarbeiter "${targetId}" wurde aktualisiert.` })
        };
      }

      // Append new row at bottom
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
        String(baustelle).trim(),
        String(vorarbeiterName).trim(),
        String(vorarbeiterTelefon).trim()
      ];

      const appendRange = formatSheetRange('A1');
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: appendRange,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRowValues] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Neuer Mitarbeiter "${targetId}" erfolgreich hinzugefügt.` })
      };
    }

    // ACTION: MARK AS INACTIVE (AUSGESCHIEDEN)
    if (action === 'set_inactive') {
      if (targetRowIndex === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: `Mitarbeiter "${targetId}" wurde im Sheet nem található.` }) };
      }

      // Set company column H (column 8) to 'Ausgeschieden'
      const rowRange = formatSheetRange(`H${targetRowIndex}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: rowRange,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Ausgeschieden']] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Mitarbeiter "${targetId}" als Ausgeschieden markiert.` })
      };
    }

    // ACTION: UPDATE EXISTING WORKER
    if (targetRowIndex === -1) {
      // If not found when updating, append as new worker automatically!
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
        String(baustelle).trim(),
        String(vorarbeiterName).trim(),
        String(vorarbeiterTelefon).trim()
      ];

      const appendRange = formatSheetRange('A1');
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: appendRange,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRowValues] }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Mitarbeiter "${targetId}" neu hinzugefügt (nicht gefunden zum Bearbeiten).` })
      };
    }

    // Update existing row (Columns A:L)
    const updatedRowValues = [
      targetId,
      String(pin).trim(),
      String(userType).trim(),
      String(userLang).trim(),
      String(userRole).trim(),
      String(phone).trim(),
      String(email).trim(),
      String(company).trim(),
      String(munkarend).trim(),
      String(baustelle).trim(),
      String(vorarbeiterName).trim(),
      String(vorarbeiterTelefon).trim()
    ];

    const updateRange = formatSheetRange(`A${targetRowIndex}:L${targetRowIndex}`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: updateRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRowValues] }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: `Mitarbeiterdaten für "${targetId}" erfolgreich aktualisiert.` })
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
