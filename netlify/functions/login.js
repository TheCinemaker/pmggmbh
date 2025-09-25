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
        const { userId, pin } = JSON.parse(event.body);
        if (!userId || !pin) { throw new Error('Hiányzó adatok.'); }

        const auth = new google.auth.GoogleAuth({ /* ... */ });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHE-ET_NAME}!A:E`, // Olvassuk az E oszlopot is
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) { throw new Error('Nincsenek felhasználók a táblában.'); }

        const userRow = rows.find(row => row[0] === userId);
        if (!userRow) {
            return { statusCode: 404, /* ... */ };
        }
        
        const correctPin = userRow[1];
        if (pin !== correctPin) {
            return { statusCode: 401, /* ... */ };
        }

        const userType = userRow[2] || 'oralapos'; 
        const userLang = userRow[3] || 'hu';
        const userRole = userRow[4] || 'user'; // E oszlop, alapértelmezett 'user'

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                displayName: userId,
                userType: userType,
                userLang: userLang,
                userRole: userRole // <-- Visszaadjuk a szerepkört
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
