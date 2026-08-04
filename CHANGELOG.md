# Projekt Napló (Changelog)

## [2026-08-04] - Dropbox OAuth Scope & Refresh Token Frissítés
- **Dropbox OAuth Scope Fix**: Netlify `DROPBOX_REFRESH_TOKEN` frissítve az új, `r.` kezdetű le nem járó frissítési tokenre.
- **Jogosultságok (Scopes)**: Engedélyezve a `files.content.read`, `sharing.read` és `sharing.write` scope-ok, megszüntetve a `getThumbnail` és `getFileLink` Netlify funkciók `401 - missing_scope/` hibáit.
- **Részletes Hibadiagnosztika & Whitespace Trim**: Hozzáadva a részletes Dropbox OAuth hibaüzenet megjelenítés (`getAllUploads.js`), valamint az `env` változók automatikus `.trim()` tisztítása (szóközök/újsorok kiszűrésére).
- **Netlify Deploy Trigger**: Új build indítása a Netlify-on a `dev` ágról.

## [2026-08-03] - Dropbox Diagnosztika és Win98 App Szűrések
- **Dropbox SDK Diagnosztika**: Részletes hibaüzenetek és status kódok visszaadása a `getFileLink.js` és `getThumbnail.js` funkciókban.
- **Win98 Desktop App**: Dolgozói nevek feloldása Google Sheet metaadatok alapján és szűrési lehetőségek javítása.
