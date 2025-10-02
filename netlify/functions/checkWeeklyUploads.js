const { google } = require('googleapis');
const { Dropbox } = require('dropbox');

// --- Konfiguráció ---
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME_USERS = process.env.GOOGLE_SHEET_NAME_USERS;

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
// --- Konfiguráció vége ---

// --- Segédfüggvények ---

/** Visszaadja a hét napjait (H-P) az adott dátumhoz. */
function getWorkWeek(date) {
    const startOfWeek = new Date(date);
    const dayOfWeek = startOfWeek.getDay(); // Vasárnap = 0, Hétfő = 1
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const week = [];
    for (let i = 0; i < 5; i++) {
        const currentDay = new Date(startOfWeek);
        currentDay.setDate(startOfWeek.getDate() + i);
        week.push({
            year: currentDay.getFullYear(),
            month: currentDay.getMonth() + 1, // 1-12
            day: currentDay.getDate(),
            dayOfWeek: i + 1, // 1=H, 2=K, ...
        });
    }
    return week;
}

/** Egy fájlnévből kinyeri a lefedett napok listáját. */
function parseDaysFromFilename(filename) {
    const name = (filename || '').split('.')[0];
    const parts = name.split('_');
    const dayPart = parts[parts.length - 1];
    
    const days = new Set();
    if (!dayPart || !/^[0-9-]+$/.test(dayPart)) return days;

    if (dayPart.includes('-')) {
        const [start, end] = dayPart.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) days.add(i);
        }
    } else {
        const day = Number(dayPart);
        if (!isNaN(day)) days.add(day);
    }
    return days;
}

/** Visszaadja a fájlnév típusát. */
function getEntryType(filename) {
    const upper = (filename || '').toUpperCase();
    if (upper.startsWith('KRANK')) return 'KRANK';
    if (upper.startsWith('URLAUB')) return 'URLAUB';
    if (upper.startsWith('UNBEZAHLT')) return 'UNBEZAHLT';
    return 'LEADVA';
}

exports.handler = async (event) => {
    try {
        const today = new Date();
        const workWeek = getWorkWeek(today); // Az aktuális hét H-P napjai

        // 1. Felhasználók lekérése a Google Sheet-ből
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const usersResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME_USERS}!A:I`, // Feltételezzük, hogy I-ig vannak adatok
        });
        const userRows = (usersResponse.data.values || []).slice(1); // Fejléc átugrása
        const users = userRows.map(r => ({
            name: r[0],
            phone: r[5] || null, // F oszlop
            workSchedule: (r[8] || '1,2,3,4,5').split(',').map(Number) // I oszlop (munkarend)
        })).filter(u => u.name);

        // 2. Dropbox fájlok lekérése
        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });
        const allFilesResponse = await dbx.filesListFolder({
            path: `/PMG Mindenes - PMG ALLES/Stundenzettel ${today.getFullYear()}`,
            recursive: true,
        });
        const allFiles = allFilesResponse.result.entries;

        // 3. Riport generálása
        const report = [];
        for (const user of users) {
            const userReport = {
                name: user.name,
                phone: user.phone,
                weekStatus: {}, // { 29: 'LEADVA', 30: 'KRANK', 1: 'HIÁNYZIK' }
            };

            const expectedDays = workWeek.filter(day => user.workSchedule.includes(day.dayOfWeek));
            expectedDays.forEach(day => userReport.weekStatus[day.day] = 'HIÁNYZIK');

            // Hónapok, amiket érint a hét
            const relevantMonths = [...new Set(workWeek.map(day => `${day.month}. ${new Date(day.year, day.month - 1).toLocaleString('de-DE', { month: 'long' })}`))];

            // Felhasználó fájljainak szűrése az érintett hónapokra
            const userFiles = allFiles.filter(file => {
                const pathParts = (file.path_lower || '').split('/');
                const hasUserName = pathParts.includes(user.name.toLowerCase());
                const hasMonth = relevantMonths.some(month => pathParts.includes(month.toLowerCase()));
                return hasUserName && hasMonth;
            });

            // Fájlok feldolgozása a lefedettséghez
            for (const file of userFiles) {
                const coveredDays = parseDaysFromFilename(file.name);
                const entryType = getEntryType(file.name);
                coveredDays.forEach(dayNum => {
                    if (userReport.weekStatus[dayNum] !== undefined) {
                        userReport.weekStatus[dayNum] = entryType;
                    }
                });
            }

            // Mulasztás ellenőrzése
            userReport.isMissing = Object.values(userReport.weekStatus).includes('HIÁNYZIK');
            report.push(userReport);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ report, workWeek }),
        };

    } catch (error) {
        console.error('Heti riport hiba:', error);
        return { statusCode: 500, body: JSON.stringify({ message: error.message }) };
    }
};
