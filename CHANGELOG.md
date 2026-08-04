# Projekt Napló (Changelog)

## [2026-08-04] - Dropbox OAuth Scope & Refresh Token Frissítés
- **Azonnali 0.0 Másodperces Betöltés & Háttér Szinkronizálás (`localStorage`)**: A Win98 Admin felület mostantól a `localStorage`-ból azonnal (0ms) kirakja az összes dolgozót, mappát, bélyegképet és fájlt. A Dropbox frissítés és az új fájlok keresése háttérben, észrevétlenül fut (`silent sync` 60s intervallummal).
- **Jegyzet Mentés Mappába (`saveNote.js`)**: Új Netlify funkció és Win98 párbeszédablak. A jegyzetek közvetlenül az épp nyitott dolgozó/hónap Dropbox mappájába mentődnek `notes_YYYYMMDD_HHMMSS.txt` fájlként.
- **Státusz Megjelölés & Regiszter (`updateStatus.js`)**: Ellenőrzött/Feldolgozás alatt/Elutasítva státuszok tárolása és vizuális jelölése (✅ 🟡 🔴).
- **Többszörös Óralap Nyomtatás (`btnPrint`)**: Kijelölő checkboxok az óralapokhoz, "Alle ausw." gomb, valamint többszörös nyomtatási nézet (tiszta papír-formátum 1 óralap/oldal elrendezésben).
- **Win98 Intéző Stílusú Lenyitható Fa-Szerkezet**: A Win98 Admin felületen minden dolgozó neve mellett egy `[+]` / `[-]` gomb jelenik meg. Lenyitáskor láthatóvá válnak a hónapok mappái (1. Januar - 12. Dezember) a feltöltött fájlok számával.
- **Teljes Éves és 38+ Munkatársi Névsor**: A `getAllUploads.js` mostantól az összes hónap (Jan-Dec) feltöltéseit beolvassa, és mind a 38 dolgozót kilistázza.
- **Új Refresh Token Generálás**: Lekértük az új tokent a Dropbox OAuth2 API-n keresztül hiánytalan scope-okkal (`files.content.read`, `sharing.write`, `files.metadata.read`).
- **Dropbox OAuth Scope Fix**: Netlify `DROPBOX_REFRESH_TOKEN` frissítve az új le nem járó frissítési tokenre.
- **Részletes Hibadiagnosztika & Whitespace Trim**: Hozzáadva a részletes Dropbox OAuth hibaüzenet megjelenítés (`getAllUploads.js`), valamint az `env` változók automatikus `.trim()` tisztítása.
- **Netlify Deploy Trigger**: Új build indítása a Netlify-on a `dev` ágról.

## [2026-08-03] - Dropbox Diagnosztika és Win98 App Szűrések
- **Dropbox SDK Diagnosztika**: Részletes hibaüzenetek és status kódok visszaadása a `getFileLink.js` és `getThumbnail.js` funkciókban.
- **Win98 Desktop App**: Dolgozói nevek feloldása Google Sheet metaadatok alapján és szűrési lehetőségek javítása.
