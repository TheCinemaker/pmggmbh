// /netlify/functions/logAbsence.js

const { Dropbox } = require('dropbox');

// --- Konfiguráció ---
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const { userId, absenceType, selectedMonth, startDate, endDate } = JSON.parse(event.body);

        if (!userId || !absenceType || !selectedMonth || !startDate) {
            throw new Error('Hiányzó adatok a távollét rögzítéséhez.');
        }

        if (absenceType !== 'URLAUB' && absenceType !== 'UNBEZAHLT') {
            throw new Error('Érvénytelen távollét típus.');
        }

        const start = new Date(startDate);
        // Ha nincs endDate, akkor az megegyezik a startDate-szel
        const end = endDate ? new Date(endDate) : start;

        // --- JAVÍTÁS: Fájlnév generálása a teljes időtartammal ---
        const startDay = start.getDate();
        const endDay = end.getDate();
        const dateRange = (startDay === endDay) ? `${startDay}` : `${startDay}-${endDay}`;
        
        const newFileName = `${absenceType}_${dateRange}.txt`; // Eredmény: URLAUB_1-3.txt vagy UNBEZAHLT_5.txt

        // A fájl tartalma maradhat a régi, informatív formátumban
        const fileContent = `Abwesenheit gemeldet:\nTyp: ${absenceType}\nVon: ${startDate}\nBis: ${endDate || startDate}`;
        
        const currentYear = start.getFullYear();
        const dropboxPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}/${selectedMonth}/${newFileName}`;

        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

        await dbx.filesUpload({
            path: dropboxPath,
            contents: fileContent,
            mode: { '.tag': 'overwrite' }, // 'overwrite' jobb, mert ha módosítják, felülírja a régit
            autorename: false
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
