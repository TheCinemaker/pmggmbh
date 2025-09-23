const { Dropbox } = require('dropbox');
const Busboy = require('busboy');

 // --- Konfiguráció ---
 const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
 const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
 // --- Konfiguráció vége ---

 const parseMultipartForm = (event) => {
     // ... (Ez a rész változatlan marad az előző kódból)
     return new Promise((resolve, reject) => {
        const fields = {};
        let fileData = null;
        const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] } });
        busboy.on('file', (fieldname, file, filename) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => { fileData = { content: Buffer.concat(chunks), filename: filename.filename }; });
        });
        busboy.on('field', (fieldname, val) => { fields[fieldname] = val; });
        busboy.on('finish', () => {
            if (!fileData) return reject(new Error('Hiányzik a fájl.'));
            resolve({ fields, file: fileData });
        });
        busboy.on('error', err => reject(err));
        const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
        busboy.end(body);
    });
 };

 exports.handler = async (event) => {
     const requestOrigin = event.headers.origin;
     if (requestOrigin !== ALLOWED_ORIGIN) {
         return { statusCode: 403, body: JSON.stringify({ message: 'Hozzáférés megtagadva.' }) };
     }
     const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
     if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

     try {
         const { fields, file } = await parseMultipartForm(event);
         const { employeeName, weekRange } = fields;

         if (!employeeName || !weekRange) { throw new Error('Hiányzó adatok: Név vagy Hét.'); }

         // Mappa- és fájlnév létrehozása a te struktúrád alapján
         const currentYear = new Date().getFullYear();
         const currentMonth = new Date().getMonth() + 1; // 0-tól indexel, ezért +1
         const monthName = new Date().toLocaleString('de-DE', { month: 'long' }); // Német hónapnév
         
         const fileExtension = file.filename.split('.').pop() || 'jpg';
         const newFileName = `${weekRange}.${fileExtension}`;
         
         // A Dropbox elérési út összeállítása
         const dropboxPath = `/Stundenzettel ${currentYear}/${employeeName}/${currentMonth}. ${monthName}/${newFileName}`;

         const dbx = new Dropbox({ accessToken: DROPBOX_TOKEN });
         
         await dbx.filesUpload({
             path: dropboxPath,
             contents: file.content,
             mode: 'overwrite', // Ha már létezik ilyen nevű fájl, felülírja
             autorename: false // Nem nevezi át automatikusan
         });

         return {
             statusCode: 200,
             headers,
             body: JSON.stringify({ message: `Sikeres feltöltés ide: ${dropboxPath}` }),
         };

     } catch (error) {
         console.error('Dropbox feltöltési hiba:', error);
         return {
             statusCode: 500,
             headers,
             body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
         };
     }
 };
