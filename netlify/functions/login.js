const { google } = require('googleapis');

// --- Konfiguráció ---
const CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME_USERS;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const { userId, pin } = JSON.parse(event.body);
        if (!userId || !pin) { throw new Error('Hiányzó adatok.'); }

        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CREDENTIALS.client_email, private_key: CREDENTIALS.private_key },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A:B`, // A Név_ID és PIN oszlopokat olvassuk
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) { throw new Error('Nincsenek felhasználók a táblában.'); }

        // Megkeressük a felhasználót és ellenőrizzük a PIN-t
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
            body: JSON.stringify({ 
                success: true, 
                displayName: userId.replace(/_/g, ' ')
            }),
        };
    } catch (error) {
        console.error('Hiba bejelentkezéskor:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
        };
    }
};
