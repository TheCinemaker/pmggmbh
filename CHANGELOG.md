# Projekt Napló (Changelog)

## [2026-08-04] - Dropbox OAuth Scope & Refresh Token Frissítés
- **Új Refresh Token Generálás**: Lekértük az új tokent a Dropbox OAuth2 API-n keresztül hiánytalan scope-okkal (`files.content.read`, `sharing.write`, `files.metadata.read`).
- **Dropbox OAuth Scope Fix**: Netlify `DROPBOX_REFRESH_TOKEN` frissítve az új le nem járó frissítési tokenre.
- **Részletes Hibadiagnosztika & Whitespace Trim**: Hozzáadva a részletes Dropbox OAuth hibaüzenet megjelenítés (`getAllUploads.js`), valamint az `env` változók automatikus `.trim()` tisztítása.
- **Netlify Deploy Trigger**: Új build indítása a Netlify-on a `dev` ágról.

## [2026-08-03] - Dropbox Diagnosztika és Win98 App Szűrések
- **Dropbox SDK Diagnosztika**: Részletes hibaüzenetek és status kódok visszaadása a `getFileLink.js` és `getThumbnail.js` funkciókban.
- **Win98 Desktop App**: Dolgozói nevek feloldása Google Sheet metaadatok alapján és szűrési lehetőségek javítása.
