const { google } = require('googleapis');

// --- konfiguráció ---
const client_email = process.env.google_client_email;
const private_key = process.env.google_private_key.replace(/\\n/g, '\n');
const sheet_id = process.env.google_sheet_id;
const sheet_name = process.env.google_sheet_name_users;
const allowed_origin = process.env.allowed_origin;
// --- konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'access-control-allow-origin': allowed_origin, 'access-control-allow-headers': 'content-type' };
    if (event.httpmethod === 'options') { return { statuscode: 204, headers }; }

    try {
        const { userid, pin } = json.parse(event.body);
        if (!userid || !pin) { throw new error('hiányzó adatok.'); }

        const auth = new google.auth.googleauth({
            credentials: { client_email: client_email, private_key: private_key },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetid: sheet_id,
            range: `${sheet_name}!a:b`, // a név_id és pin oszlopokat olvassuk
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) { throw new error('nincsenek felhasználók a táblában.'); }

        // megkeressük a felhasználót és ellenőrizzük a pin-t
        const userrow = rows.find(row => row[0] === userid);

        if (!userrow) {
            return { statuscode: 404, headers, body: json.stringify({ message: 'felhasználó nem található.' }) };
        }
        
        const correctpin = userrow[1];
        if (pin !== correctpin) {
            return { statuscode: 401, headers, body: json.stringify({ message: 'hibás pin kód.' }) };
        }

        return {
            statuscode: 200,
            headers,
            body: json.stringify({ 
                success: true, 
                displayname: userid.replace(/_/g, ' ')
            }),
        };
    } catch (error) {
        console.error('hiba bejelentkezéskor:', error);
        return {
            statuscode: 500,
            headers,
            body: json.stringify({ message: error.message || 'szerver oldali hiba történt.' }),
        };
    }
};
