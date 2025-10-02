const { Dropbox } = require('dropbox');
const Busboy = require('busboy');

// --- Konfiguráció és Ellenőrzés ---
const requiredEnvVars = [ 'ALLOWED_ORIGIN', 'DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN' ];

function checkEnvVars() {
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        throw new Error(`Hiányzó környezeti változók: ${missingVars.join(', ')}`);
    }
}

try {
    checkEnvVars();
} catch (error) {
    exports.handler = async () => ({
        statusCode: 500,
        body: JSON.stringify({ message: error.message }),
    });
    return;
}

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

const parseMultipartForm = (event) => {
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
    const headers = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type' };
    if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers }; }

    try {
        const { fields, file } = await parseMultipartForm(event);
        const { userId, selectedMonth, startDate, endDate } = fields;

        if (!userId || !selectedMonth || !startDate || !endDate) {
            throw new Error('Hiányzó adatok a táppénzes papír feltöltéséhez.');
        }

        // Fájlnév generálása a dátumokból
        const start = new Date(startDate);

        const end = endDate ? new Date(endDate) : start;
        const startDay = new Date(startDate).getDate();
        const endDay = new Date(endDate).getDate();
        const dateRange = (startDay === endDay) ? `${startDay}` : `${startDay}-${endDay}`;
        
        const fileExtension = file.filename.split('.').pop() || 'jpg';
        const newFileName = `KRANK_${dateRange}.${fileExtension}`;

        const currentYear = new Date(startDate).getFullYear(); // Az évszámot is a megadott dátumból vesszük!
        const dropboxPath = `/PMG Mindenes - PMG ALLES/Stundenzettel ${currentYear}/${userId}/${selectedMonth}/${newFileName}`;

        const dbx = new Dropbox({ refreshToken: REFRESH_TOKEN, clientId: APP_KEY, clientSecret: APP_SECRET });

        await dbx.filesUpload({
            path: dropboxPath,
            contents: file.content,
            mode: 'add',
            autorename: true
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Táppénzes igazolás sikeresen feltöltve!' }),
        };

    } catch (error) {
        console.error('Táppénz feltöltési hiba:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
        };
    }
};
