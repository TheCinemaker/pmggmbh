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

// --- Kivételek (case/ékezet-insensitive lesz belőlük) ---
const EXCLUDED_USERS = ['AVAR Szilveszter', 'ADMIN Admin'];

// ---------- Segéd: dátumok, normalizálás, parse ----------
function getWorkWeek(date) {
  const startOfWeek = new Date(date);
  // Hétfő legyen a kezdete
  const dayOfWeek = startOfWeek.getDay(); // 0=vas
  const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  const week = [];
  for (let i = 0; i < 5; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);
    week.push({
      year: currentDay.getFullYear(),
      month: currentDay.getMonth() + 1,
      day: currentDay.getDate(),
      dayOfWeek: i + 1, // 1..5 (H..P)
    });
  }
  return week;
}

// ékezetelt betűk eldobása, kis-nagy egyenlősítése
function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// fájlnévben szereplő nap(ok) kinyerése (1..31)
function extractDaysFromFilename(filename) {
  const name = String(filename || '').split('.')[0];

  const days = new Set();

  // range-ek: 29-30, 29_30, 29–30, 29 — 30
  const rangeRe = /(^|[\s_\-\.])(\d{1,2})\s*[-–—_]\s*(\d{1,2})(?=($|[\s_\-\.]))/g;
  let m;
  while ((m = rangeRe.exec(name)) !== null) {
    const a = Number(m[2]), b = Number(m[3]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 31) {
      const start = Math.min(a, b);
      const end = Math.max(a, b);
      for (let d = start; d <= end; d++) days.add(d);
    }
  }

  // egyedi napok: " 29 ", "_29", ".29", "29.", "29_"
  const singleRe = /(^|[\s_\-\.])(\d{1,2})(?=($|[\s_\-\.]))/g;
  while ((m = singleRe.exec(name)) !== null) {
    const d = Number(m[2]);
    if (d >= 1 && d <= 31) days.add(d);
  }

  return days;
}

// státusz detektálása: ha bárhol szerepel a kulcsszó
function getEntryType(filename) {
  const upper = String(filename || '').toUpperCase();
  if (upper.includes('KRANK'))     return 'KRANK';
  if (upper.includes('URLAUB'))    return 'URLAUB';
  if (upper.includes('UNBEZAHLT')) return 'UNBEZAHLT';
  return 'ABGEGEBEN';
}

// adott (év, hónap) lehetséges mappanév-variánsai
function monthFolderVariants(year, month) {
  const date = new Date(year, month - 1, 1);
  const deName = date.toLocaleString('de-DE', { month: 'long' }).toLowerCase(); // pl. "september"
  const mm = String(month).padStart(2, '0');
  const m_ = String(month);
  // csak minták — ha pontos konvenciótok van, ide drótozható
  return [
    `/${m_}. ${deName}/`,
    `/${mm}. ${deName}/`,
    `/${m_}_${deName}/`,
    `/${mm}_${deName}/`,
    `/${deName}/`,
  ];
}

// Dropbox: teljes rekurzív listázás paginációval
async function listAllEntries(dbx, path) {
  let res = await dbx.filesListFolder({ path, recursive: true });
  const out = [...res.result.entries];
  while (res.result.has_more) {
    res = await dbx.filesListFolderContinue({ cursor: res.result.cursor });
    out.push(...res.result.entries);
  }
  return out;
}

exports.handler = async (event) => {
  try {
    // 0) Tárgyhét
    const today = new Date();
    const workWeek = getWorkWeek(today);
    const weekYear = workWeek[0].year; // a hét első napjának éve

    // 1) Felhasználók a Google Sheet-ből
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const usersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME_USERS}!A:I`,
    });

    const excludedSet = new Set(EXCLUDED_USERS.map(fold));
    const userRows = (usersResponse.data.values || []).slice(1);

    const users = userRows
      .map(r => ({
        name: (r[0] || '').trim(),
        type: (r[2] || 'oralapos').toLowerCase().trim(), // C oszlop: userType
        phone: (r[5] || '').trim(),
        workSchedule: (r[8] || '1,2,3,4,5').split(',').map(s => Number(String(s).trim())).filter(n => !isNaN(n)),
      }))
      .filter(u =>
        u.name &&
        u.type === 'oralapos' &&                // csak "óralapos"
        !excludedSet.has(fold(u.name))          // nincs a kivételek között
      );

    // 2) Dropbox fájlok lekérése (év nincs beégetve)
    const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });
    const rootPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${weekYear}`;
    const allEntries = await listAllEntries(dbx, rootPath);
    const allFiles = allEntries.filter(e => e['.tag'] === 'file');

    // A hét hónapjai (ha átnyúlik, mindkettő) -> minták
    const monthPatterns = [...new Set(
      workWeek.flatMap(d => monthFolderVariants(d.year, d.month))
    )];

    // 3) Riport generálása
    const prio = { 'FEHLT': 0, 'ABGEGEBEN': 1, 'UNBEZAHLT': 2, 'URLAUB': 3, 'KRANK': 4 };
    const report = [];

    for (const user of users) {
      const userReport = {
        name: user.name,
        phone: user.phone,
        weekStatus: {}, // pl. {29:'ABGEGEBEN', 30:'FEHLT', ...}
      };

      // alapértelmezés: csak a beosztott napokra FEHLT
      const expectedDays = workWeek.filter(day => user.workSchedule.includes(day.dayOfWeek));
      expectedDays.forEach(day => { userReport.weekStatus[day.day] = 'FEHLT'; });

      // --- Felhasználó fájljainak kiválasztása ---
      const userKey = fold(user.name);
      const candidatesByMonth = allFiles.filter(file => {
        const p = fold(file.path_display || '');
        // felhasználói "mappa-szegmens" lazán
        const segs = p.split('/').filter(Boolean);
        const inUserFolder = segs.includes(userKey) || p.includes(`/${userKey}/`);
        if (!inUserFolder) return false;
        // legalább egy hónap-minta szerepeljen az útvonalban
        return monthPatterns.some(v => p.includes(fold(v)));
      });

      // ha hónap-mintával nem találtunk semmit, essünk vissza: user összes fájlja év alatt
      const userFiles = (candidatesByMonth.length ? candidatesByMonth : allFiles).filter(file => {
        const p = fold(file.path_display || '');
        const segs = p.split('/').filter(Boolean);
        return segs.includes(userKey) || p.includes(`/${userKey}/`);
      });

      // --- Lefedettség jelölése a fájlnevek alapján ---
      for (const file of userFiles) {
        const days = extractDaysFromFilename(file.name);
        if (days.size === 0) continue; // ha a fájlnévben nincs nap, nem tudjuk hova rakni
        const entryType = getEntryType(file.name); // KRANK | URLAUB | UNBEZAHLT | ABGEGEBEN
        days.forEach(d => {
          if (userReport.weekStatus[d] !== undefined) {
            const cur = userReport.weekStatus[d];
            if (prio[entryType] > prio[cur]) {
              userReport.weekStatus[d] = entryType;
            }
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
