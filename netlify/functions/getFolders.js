const { Dropbox } = require('dropbox');

// --- Konfiguráció (ugyanaz, mint az upload.js-ben) ---
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const userId = event.queryStringParameters.userId;
        if (!userId) { throw new Error('Hiányzó felhasználói azonosító.'); }

        const currentYear = new Date().getFullYear();
        const userFolderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}`;

        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

        const response = await dbx.filesListFolder({
            path: userFolderPath,
        });

        // Kiszűrjük, hogy csak a mappákat adjuk vissza
        const folders = response.result.entries
            .filter(entry => entry['.tag'] === 'folder')
            .map(folder => folder.name);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(folders),
        };
    } catch (error) {
        // Speciális hiba, ha a felhasználó mappája még nem létezik
        if (error.status === 409 && error.error && error.error.error_summary.startsWith('path/not_found/')) {
             return { statusCode: 200, headers, body: JSON.stringify([]) }; // Üres listát adunk vissza
        }
        console.error('Dropbox mappalista hiba:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Hiba a mappák lekérésekor.' }),
        };
    }
};
