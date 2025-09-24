const { Dropbox } = require('dropbox');

// --- Konfiguráció ---
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const { userId, absenceType, selectedMonth, startDate, endDate } = JSON.parse(event.body);
        if (!userId || !absenceType || !selectedMonth || !startDate || !endDate) {
            throw new Error('Hiányzó adatok a távollét jelentéséhez.');
        }

        // Fájlnév és tartalom generálása
        const startDay = new Date(startDate).getDate().toString().padStart(2, '0');
        const fileName = `${absenceType}_vom_${startDay}.txt`;
        const fileContent = `${startDate.replace(/-/g, '.')} - ${endDate.replace(/-/g, '.')}`;

        const currentYear = new Date().getFullYear();
        const dropboxPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}/${selectedMonth}/${fileName}`;

        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

        await dbx.filesUpload({
            path: dropboxPath,
            contents: fileContent,
            mode: 'add', // 'add' módban hibát dob, ha már létezik a fájl
            autorename: true // Ha mégis létezne, átnevezi (pl. KRANK_vom_05 (1).txt)
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Távollét sikeresen rögzítve!' }),
        };

    } catch (error) {
        console.error('Távollét rögzítési hiba:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
        };
    }
};
