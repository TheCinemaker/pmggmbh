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
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CREDENTIALS.client_email, private_key: CREDENTIALS.private_key },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A:A`, // Csak az A oszlopot (Név_ID) olvassuk
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        // Átalakítjuk a frontend számára emészthető formátumra
        const users = rows.slice(1) // Kihagyjuk a fejlécet
            .map(row => row[0])
            .filter(id => id) // Kihagyjuk az üres sorokat
            .map(id => ({
                id: id,
                displayName: id.replace(/_/g, ' ') // Lecseréljük az alsóvonásokat szóközre a szép megjelenítéshez
            }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(users),
        };
    } catch (error) {
        console.error('Hiba a felhasználók lekérésekor:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: 'Szerver oldali hiba történt.' }),
        };
    }
};
