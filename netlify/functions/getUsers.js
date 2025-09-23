const { google } = require('googleapis');

// --- Konfiguráció és Ellenőrzés ---
const requiredEnvVars = [ 'ALLOWED_ORIGIN', 'GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEET_ID', 'GOOGLE_SHEET_NAME_USERS' ];

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
    return;
}

const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME_USERS;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A:A`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        const users = rows.slice(1)
            .map(row => row[0])
            .filter(id => id)
            .map(id => ({
                id: id,
                displayName: id.replace(/_/g, ' ')
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
            body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
        };
    }
};
