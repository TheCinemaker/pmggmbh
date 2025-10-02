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

// --- Kivételek (case/ékezet-insensitive) ---
const EXCLUDED_USERS = ['AVAR Szilveszter', 'ADMIN Admin'];

// ---------- Helper: dátumok, normalizálás, parse ----------
function getWorkWeek(date) {
  const startOfWeek = new Date(date);
  const dayOfWeek = startOfWeek.getDay(); // 0=vasárnap
  const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // hétfő
  startOfWeek.setDate(diff);
  const week = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    week.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      dayOfWeek: i + 1, // 1..5
    });
  }
  return week;
}

// ékezet kidobása, kisbetű, trim
function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// napok kinyerése a fájlnévből (ranges + singlek)
function extractDaysFromFilename(filename) {
  const name = String(filename || '').split('.')[0];
  const days = new Set();

  // 29-30 / 29_30 / 29–30 / 29 — 30
  const rangeRe = /(^|[\s_\-\.])(\d{1,2})\s*[-–—_]\s*(\d{1,2})(?=($|[\s_\-\.]))/g;
  let m;
  while ((m = rangeRe.exec(name)) !== null) {
    const a = Number(m[2]), b = Number(m[3]);
    if (a >= 1 && a <= 31 && b >= 1 && b <= 31) {
      const s = Math.min(a, b), e = Math.max(a, b);
      for (let d = s; d <= e; d++) days.add(d);
    }
  }

  // egyedi napok: " 29 " / "_29" / ".29" / "29." / "29_"
  const singleRe = /(^|[\s_\-\.])(\d{1,2})(?=($|[\s_\-\.]))/g;
  while ((m = singleRe.exec(name)) !== null) {
    const d = Number(m[2]);
    if (d >= 1 && d <= 31) days.add(d);
  }

  return days;
}

function getEntryType(filename) {
  const up = String(filename || '').toUpperCase();
  if (up.includes('KRANK'))     return 'KRANK';
  if (up.includes('URLAUB'))    return 'URLAUB';
  if (up.includes('UNBEZAHLT')) return 'UNBEZAHLT';
  return 'ABGEGEBEN';
}

// hónap mappanév variánsok (szegmens egyezéshez)
function monthSegmentVariants(year, month) {
  const date = new Date(year, month - 1, 1);
  const de = date.toLocaleString('de-DE', { month: 'long' }).toLowerCase(); // "oktober"
  const mm = String(month).padStart(2, '0');
  const m_ = String(month);
  // szegmens-szintű egyezésre készülünk; equality vagy startsWith
  return [
    `${m_}. ${de}`,
    `${mm}. ${de}`,
    `${m_}_${de}`,
    `${mm}_${de}`,
    `${de}`,
  ].map(fold);
}

// Dropbox: rekurzív listázás paginációval
async function listAllEntries(dbx, path) {
  let res = await dbx.filesListFolder({ path, recursive: true });
  const out = [...res.result.entries];
  while (res.result.has_more) {
    res = await dbx.filesListFolderContinue({ cursor: res.result.cursor });
    out.push(...res.result.entries);
  }
  return out;
}

// detektáld, melyik hónap mappájában van a fájl (a weekMonths közül)
// segs: a könyvtár-szegmensek (foldolt), filename nélkül
function detectFileMonthFromDir(segs, weekMonthsMap) {
  // weekMonthsMap: { 9: Set(variánsok), 10: Set(variánsok), ... }
  for (const [month, variants] of weekMonthsMap.entries()) {
    for (const seg of segs) {
      // pontos egyezés vagy startsWith (ha suffix van a szegmensben)
      if ([...variants].some(v => seg === v || seg.startsWith(v))) {
        return month;
      }
    }
  }
  return null;
}

exports.handler = async (event) => {
  try {
    // 0) Tárgyhét
    const today = new Date();
    const workWeek = getWorkWeek(today);
    const weekYear = workWeek[0].year;

    // 1) Felhasználók
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
        type: (r[2] || 'oralapos').toLowerCase().trim(),
        phone: (r[5] || '').trim(),
        workSchedule: (r[8] || '1,2,3,4,5').split(',').map(s => Number(String(s).trim())).filter(n => !isNaN(n)),
      }))
      .filter(u =>
        u.name &&
        u.type === 'oralapos' &&
        !excludedSet.has(fold(u.name))
      );

    // 2) Dropbox
    const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });
    const rootPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${weekYear}`;
    const allEntries = await listAllEntries(dbx, rootPath);
    const allFiles = allEntries.filter(e => e['.tag'] === 'file');

    // A hét napjai → set (gyors lookup) és day->month map a héten
    const weekDaysSet = new Set(workWeek.map(d => d.day));
    const dayToMonth = new Map(workWeek.map(d => [d.day, d.month]));

    // A hét hónapjai és azok elfogadott könyvtár-szegmens variánsai
    const uniqueMonths = [...new Set(workWeek.map(d => d.month))];
    const weekMonthsMap = new Map(uniqueMonths.map(m => [m, new Set(monthSegmentVariants(weekYear, m))]));

    // 3) Riport
    const prio = { 'FEHLT': 0, 'ABGEGEBEN': 1, 'UNBEZAHLT': 2, 'URLAUB': 3, 'KRANK': 4 };
    const report = [];

    for (const user of users) {
      const userReport = { name: user.name, phone: user.phone, weekStatus: {} };

      // csak a beosztott napokra (workSchedule) inicializálunk FEHLT-re
      const expectedDays = workWeek.filter(d => user.workSchedule.includes(d.dayOfWeek));
      expectedDays.forEach(d => { userReport.weekStatus[d.day] = 'FEHLT'; });

      const userKey = fold(user.name);

      // csak azokat a fájlokat vesszük figyelembe, amelyek:
      // - a user mappáján belül vannak (szegmens-egyezés),
      // - és a KÖNYVTÁR szegmensei között szerepel a hét valamelyik hónapja,
      // - a fájlnév napjai csak az adott hónaphoz írnak (29-30 -> szepti mappában, 1-3 -> októberi mappában)
      const userFiles = allFiles.filter(file => {
        const full = fold(file.path_display || '');
        const parts = full.split('/').filter(Boolean);
        if (parts.length === 0) return false;

        const filename = parts[parts.length - 1];      // pl. "KRANK_29-30.pdf"
        const dirSegs  = parts.slice(0, -1);           // csak könyvtárszegmensek

        // user szegmens kötelező
        const hasUserSeg = dirSegs.includes(userKey);
        if (!hasUserSeg) return false;

        // melyik hónap-mintát tartalmazza a könyvtár?
        const fileMonth = detectFileMonthFromDir(dirSegs, weekMonthsMap);
        if (!fileMonth) return false; // ha nem a héthez tartozó hónap mappában van, ne számítson

        // itt még nem szűrünk napra — azt a lenti feldolgozásnál tesszük, fileMonth alapján
        return true;
      });

      // napok beállítása a fájlok alapján
      for (const file of userFiles) {
        const full = fold(file.path_display || '');
        const parts = full.split('/').filter(Boolean);
        const dirSegs = parts.slice(0, -1);
        const fileMonth = detectFileMonthFromDir(dirSegs, weekMonthsMap);
        if (!fileMonth) continue;

        const days = extractDaysFromFilename(file.name);
        if (days.size === 0) continue;

        const entryType = getEntryType(file.name);

        days.forEach(d => {
          // csak a tárgyhét napjai érdekesek
          if (!weekDaysSet.has(d)) return;
          // és csak akkor, ha az adott nap hónapja megegyezik a fájl mappa-hónapjával
          if (dayToMonth.get(d) !== fileMonth) return;
          // csak a beosztott napokra írunk (ahol már FEHLT volt)
          if (userReport.weekStatus[d] === undefined) return;

          const cur = userReport.weekStatus[d];
          if (prio[entryType] > prio[cur]) {
            userReport.weekStatus[d] = entryType;
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
