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

// --- JAVÍTÁS: Kivételek listája ---
const EXCLUDED_USERS = ['AVAR Szilveszter', 'ADMIN Admin'];
// --- Konfiguráció vége ---

// --- Segédfüggvények (változatlan) ---
function getWorkWeek(date) { const startOfWeek = new Date(date); const dayOfWeek = startOfWeek.getDay(); const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); startOfWeek.setDate(diff); const week = []; for (let i = 0; i < 5; i++) { const currentDay = new Date(startOfWeek); currentDay.setDate(startOfWeek.getDate() + i); week.push({ year: currentDay.getFullYear(), month: currentDay.getMonth() + 1, day: currentDay.getDate(), dayOfWeek: i + 1, }); } return week; }
function parseDaysFromFilename(filename) { const name = (filename || '').split('.')[0]; const parts = name.split('_'); const dayPart = parts[parts.length - 1]; const days = new Set(); if (!dayPart || !/^[0-9-]+$/.test(dayPart)) return days; if (dayPart.includes('-')) { const [start, end] = dayPart.split('-').map(Number); if (!isNaN(start) && !isNaN(end)) { for (let i = start; i <= end; i++) days.add(i); } } else { const day = Number(dayPart); if (!isNaN(day)) days.add(day); } return days; }
function getEntryType(filename) { const upper = (filename || '').toUpperCase(); if (upper.startsWith('KRANK')) return 'KRANK'; if (upper.startsWith('URLAUB')) return 'URLAUB'; if (upper.startsWith('UNBEZAHLT')) return 'UNBEZAHLT'; return 'ABGEGEBEN'; }

exports.handler = async (event) => {
    try {
        const today = new Date();
        const workWeek = getWorkWeek(today);

        // 1. Felhasználók lekérése
        const auth = new google.auth.GoogleAuth({ credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], });
        const sheets = google.sheets({ version: 'v4', auth });
        const usersResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME_USERS}!A:I`,
        });
        
        const userRows = (usersResponse.data.values || []).slice(1);
        const users = userRows.map(r => ({
            name: r[0] || null,
            type: (r[2] || 'oralapos').toLowerCase(), // C oszlop: userType
            phone: r[5] || null,
            workSchedule: (r[8] || '1,2,3,4,5').split(',').map(Number)
        }))
        // --- JAVÍTÁS: Szűrés a releváns felhasználókra ---
        .filter(u => 
            u.name &&                                  // Legyen neve
            u.type === 'oralapos' &&                   // Legyen "óralapos"
            !EXCLUDED_USERS.includes(u.name)           // Ne legyen a kivételek listáján
        );

        // 2. Dropbox fájlok lekérése (megbízhatóbban)
        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });
        // --- JAVÍTÁS: A keresés a teljes Stundenzettel mappában történik ---
        const allFilesResponse = await dbx.filesListFolder({
            path: `/PMG Mindenes - PMG ALLES/Stundenzettel 2025${today.getFullYear()}`,
            recursive: true,
            limit: 2000, // Több fájl engedélyezése
        });
        const allFiles = allFilesResponse.result.entries;

        // 3. Riport generálása
        const report = [];
        for (const user of users) {
            const userReport = {
                name: user.name,
                phone: user.phone,
                weekStatus: {},
            };

            const expectedDays = workWeek.filter(day => user.workSchedule.includes(day.dayOfWeek));
            expectedDays.forEach(day => userReport.weekStatus[day.day] = 'FEHLT'); // Alapértelmezetten hiányzik

            const relevantMonths = [...new Set(workWeek.map(day => `${day.month}. ${new Date(day.year, day.month - 1).toLocaleString('de-DE', { month: 'long' })}`))];

            // --- JAVÍTÁS: Sokkal pontosabb fájlkeresés ---
            const userFiles = allFiles.filter(file => {
                if (file['.tag'] !== 'file') return false; // Csak fájlokat nézünk
                const pathLower = (file.path_display || '').toLowerCase(); // path_display a teljes útvonal
                
                const hasUserName = pathLower.includes(`/${user.name.toLowerCase()}/`);
                const hasMonth = relevantMonths.some(month => pathLower.includes(`/${month.toLowerCase()}/`));
                
                return hasUserName && hasMonth;
            });

            for (const file of userFiles) {
                const coveredDays = parseDaysFromFilename(file.name);
                const entryType = getEntryType(file.name);
                coveredDays.forEach(dayNum => {
                    // Csak akkor írja felül, ha az a nap releváns a héten
                    if (userReport.weekStatus[dayNum] !== undefined) {
                        userReport.weekStatus[dayNum] = entryType;
                    }
                });
            }

            userReport.isMissing = Object.values(userReport.weekStatus).includes('FEHLT');
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
