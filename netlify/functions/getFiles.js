
const { Dropbox } = require('dropbox');
 const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
 const APP_KEY = process.env.DROPBOX_APP_KEY;
 const APP_SECRET = process.env.DROPBOX_APP_SECRET;
 const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

 exports.handler = async (event) => {
     const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
     if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

     try {
         const userId = event.queryStringParameters.userId;
         const selectedMonth = event.queryStringParameters.selectedMonth;
         if (!userId || !selectedMonth) { throw new Error('Hiányzó felhasználó vagy hónap.'); }

         const currentYear = new Date().getFullYear();
         const folderPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}/${selectedMonth}`;

         const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

         // Fájlok listázása
         const listResponse = await dbx.filesListFolder({ path: folderPath });
         const files = listResponse.result.entries.filter(entry => entry['.tag'] === 'file');

         // Ha nincsenek fájlok, üres listát küldünk vissza
         if (files.length === 0) {
             return { statusCode: 200, headers, body: JSON.stringify([]) };
         }

         // Ideiglenes linkek generálása minden fájlhoz
         const linkPromises = files.map(file => 
             dbx.filesGetTemporaryLink({ path: file.path_lower })
         );
         const linkResults = await Promise.all(linkPromises);
         
         // A végső lista összeállítása
         const fileData = linkResults.map(result => ({
             name: result.result.metadata.name,
             link: result.result.link,
         }));

         return {
             statusCode: 200,
             headers,
             body: JSON.stringify(fileData),
         };
     } catch (error) {
         if (error.status === 409 && error.error && error.error.error_summary.startsWith('path/not_found/')) {
             return { statusCode: 200, headers, body: JSON.stringify([]) };
         }
         console.error('Dropbox fájllista hiba:', error);
         return { statusCode: 500, headers, body: JSON.stringify({ message: 'Hiba a fájlok lekérésekor.' }) };
     }
 };
