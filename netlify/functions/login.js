const { google } = require('googleapis');

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const { userId, pin } = JSON.parse(event.body);
        if (!userId || !pin) { throw new Error('Hiányzó adatok.'); }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `${process.env.GOOGLE_SHEET_NAME_USERS}!A:B`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) { throw new Error('Nincsenek felhasználók a táblában.'); }

        const userRow = rows.find(row => row[0] === userId);
        if (!userRow) {
            return { statusCode: 404, headers, body: JSON.stringify({ message: 'Felhasználó nem található.' }) };
        }
        
        const correctPin = userRow[1];
        if (pin !== correctPin) {
            return { statusCode: 401, headers, body: JSON.stringify({ message: 'Hibás PIN kód.' }) };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, displayName: userId }),
        };
    } catch (error) {
        console.error('Hiba (login):', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Hiba bejelentkezéskor.' }),
        };
    }
};
