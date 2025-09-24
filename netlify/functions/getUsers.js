const { google } = require('googleapis');

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
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
            range: `${process.env.GOOGLE_SHEET_NAME_USERS}!A:A`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return { statusCode: 200, headers, body: JSON.stringify([]) };
        }

        const users = rows.slice(1).map(row => row[0]).filter(name => name).map(name => ({
            id: name,
            displayName: name
        }));

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
