const { google } = require('googleapis');
const { Writable } = require('stream');
const Busboy = require('busboy');

// --- Konfiguráció ---
// A Netlify környezeti változóiból olvassuk be a titkos adatokat
const CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
// --- Konfiguráció vége ---

// Helper funkció a Busboy parser "becsomagolásához"
// Ez dolgozza fel a beérkező FormData-t (szöveges mezők + fájl)
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const fields = {};
        let fileData = null;

        const busboy = Busboy({
            headers: {
                'content-type': event.headers['content-type'] || event.headers['Content-Type'],
            },
        });

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                fileData = {
                    content: Buffer.concat(chunks),
                    filename: filename.filename,
                    mimetype: mimetype,
                };
            });
        });

        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', () => {
            if (!fileData) return reject(new Error('Hiányzik a fájl a kérésből.'));
            resolve({ fields, file: fileData });
        });

        busboy.on('error', err => reject(err));

        // Az event body-t base64-ből dekódoljuk, ha szükséges
        const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
        busboy.end(body);
    });
};

// A fő Netlify Function
exports.handler = async (event) => {
    // Biztonsági ellenőrzés: Csak a saját frontendünkről fogadunk el kéréseket
    const requestOrigin = event.headers.origin;
    if (requestOrigin !== ALLOWED_ORIGIN) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Hozzáférés megtagadva.' }),
        };
    }

    // CORS fejléc a válaszhoz
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        // 1. Adatok feldolgozása a kérésből
        const { fields, file } = await parseMultipartForm(event);
        const { employeeName, weekRange } = fields;

        if (!employeeName || !weekRange) {
            throw new Error('Hiányzó adatok: Név vagy Hét.');
        }

        // 2. Google API hitelesítés
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: CREDENTIALS.client_email,
                private_key: CREDENTIALS.private_key,
            },
            scopes: [
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/spreadsheets',
            ],
        });

        const drive = google.drive({ version: 'v3', auth });
        const sheets = google.sheets({ version: 'v4', auth });
        
        // 3. Fájl feltöltése a Google Drive-ra
        const fileExtension = file.filename.split('.').pop() || 'jpg';
        const newFileName = `${weekRange}.${fileExtension}`;

        const driveResponse = await drive.files.create({
            requestBody: {
                name: newFileName,
                parents: [DRIVE_FOLDER_ID],
            },
            media: {
                mimeType: file.mimetype,
                body: require('stream').Readable.from(file.content),
            },
            fields: 'id, webViewLink',
        });
        
        const fileLink = driveResponse.data.webViewLink;

        // 4. Adatok beírása a Google Sheets-be
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A:E`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [
                    // [ID, Beküldő email, beküldés dátuma, hét, óralap file]
                    // Az ID-t és a Beküldő email-t most nem tároljuk, de a helyét fenntartjuk
                    [
                        '', // ID (hagyjuk üresen, vagy generálhatnánk egyet)
                        employeeName, // A Név kerül a Beküldő email helyére, ahogy a logikánk diktálja
                        new Date().toISOString(),
                        weekRange,
                        fileLink
                    ]
                ],
            },
        });

        // 5. Sikeres válasz küldése a frontendnek
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'Sikeres feltöltés!', fileLink }),
        };

    } catch (error) {
        console.error('Hiba a feldolgozás során:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ message: error.message || 'Szerver oldali hiba történt.' }),
        };
    }
};
