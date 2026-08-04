# Projekt Napló (Changelog)

## [2026-08-04] - Dropbox OAuth Scope & Refresh Token Frissítés
- **Nyomtatási Konténer Képernyő Elrejtése & Tisztítása**: A nyomtatásra előkészített képek konténere mostantól kényszerítve rejtve van a sima képernyős nézetben (`#printContainer { display: none; }`), és **kizárólag a nyomtatási párbeszédablakban** jelenik meg. A nyomtatás végeztével a kód automatikusan kitörli a háttérből a képeket, így sosem jelenik meg nagy kép a weblap mögött!
- **Szigorú `Ausgeschieden` Kizárás a Főoldali Fájlrácsból**: Teljesen letiltva az inaktív `Ausgeschieden` mappák és fájlok bekerülése a főoldali fájlrácsba (`renderFileGrid`).
- **`Ausgeschieden` Mappa Kiszűrése & Dolgozói Névsorrend (A-Z)**: Az inaktív/kilépett dolgozók (`Ausgeschieden`) mappái és fájljai többé nem jelennek meg a felületen. A dolgozók mind a bal oldali fa-struktúrában, mind a jobb oldali főoldalon **ABC névsorrendben (A-Z)** rendezve jelennek meg!
- **Robust Win98 Kalender**: Javított naptár megnyitási és index-alapú képnézegető logika, így a `Kalender` gombra kattintva a naptár azonnal és hibátlanul megnyílik.
- **Természetes Számsorrendi Rendezés (Natural Sort)**: A főoldalon és minden mappa alatt a fájlok **természetes számsorrendben** jelennek meg a fájlneveik alapján.
- **Kártya Checkbox Pozicionálás Javítás**: Hozzáadva a `position: relative` szabály a `.win98-file-card`-ra, így **minden egyes képkártya bal felső sarkában** ott van a saját kijelölő checkboxa!
- **Tömeges Kijelölés Nyomtatás**: A felületen tetszőlegesen kijelölt N darab képkártya (pl. 20 óralap) a `Drucken` gombra kattintva pontosan és hiánytalanul kinyomtatásra kerül.
- **Egyes Kép Nyomtatása Lightboxból**: A kép megnyitásakor (Vorschau nézet) a felugró ablakban helyet kapott a `🖨️ Drucken` gomb, amellyel az adott 1 kép azonnal nyomtatható.
- **Fájl Átnevezése Dropboxban (`renameFile.js`)**: Új Netlify funkció és `✏️ Umbenennen` gomb a Lightbox ablakban. Egy kattintással, élőben átnevezhető bármelyik fájl a Dropboxban!
- **Szigorú Utolsó 2 Havi Szűrés a Főoldalon**: A főoldal mostantól **kizárólag az ehavi és az előző havi** dokumentumokat listázza.
- **Lusta Betöltés (Lazy Loading - `IntersectionObserver`)**: A bélyegképek **csak akkor töltődnek le, amikor odagörgetsz hozzájuk**. Emiatt a felület lassú interneten és gyengébb gépen is azonnal megnyílik, nulla felesleges adatforgalommal!
- **Kétszintű Beágyazott Csoportosítás (Dolgozó + Hónap)**: A jobb oldali fájllistában a dokumentumok **először Munkatárs Neve szerint** (`👤 BARACSKAI Istvan`), **másodszor pedig Hónapok szerint** (`📅 8. August 2026`) látványos kék fejlécekkel vannak elválasztva. Garantáltan nem folyik össze semmi!
- **Cache Invalidation & Hard Refresh**: Kényszerített böngésző cache-busting (`v=20260804_v4`) és a Win98 `Aktualisieren` gomb felvértezése teljes `localStorage` és `sessionStorage` ürítéssel.
- **Hónap Szerinti Vizuális Csoportosítás**: A Win98 fájllistában a dokumentumok tisztán szétválasztva, látványos hónap fejlécek alatt (pl. `📅 8. August 2026`, `📅 7. Juli 2026`) jelennek meg, hogy ne folyjon egybe a nézet.
- **Dolgozói Havi Naptár Nézet (`Kalender`)**: Új Win98 naptár ablak (`#win98CalendarModal`), amely naptári rácsban (Hé-Va) jeleníti meg az adott dolgozó feltöltéseit: 🟢 zölddel a feltöltött óralapokat, 🟡 sárgával a betegszabadság igazolásokat. Bármelyikre rákattintva azonnal megnyílik a kép!
- **Kétlépcsős Gyorstöltés (`fast=1`)**: A `getAllUploads.js` a legfrissebb hónapokat tölti le legelőször, megelőzve a felesleges várakozást.
- **Azonnali 0.0 Másodperces Betöltés & Háttér Szinkronizálás (`localStorage`)**: A Win98 Admin felület mostantól a `localStorage`-ból azonnal (0ms) kirakja az összes dolgozót, mappát, bélyegképet és fájlt.
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
