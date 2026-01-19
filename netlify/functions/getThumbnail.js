// netlify/functions/getThumbnail.js
const { Dropbox } = require('dropbox');

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        const path = event.queryStringParameters?.path;
        if (!path) {
            throw new Error('Missing path parameter');
        }

        const dbx = new Dropbox({
            refreshToken: REFRESH_TOKEN,
            clientId: APP_KEY,
            clientSecret: APP_SECRET
        });

        // Ellenőrizzük a fájl kiterjesztését
        const ext = path.toLowerCase().split('.').pop();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif'];

        if (imageExtensions.includes(ext)) {
            // Kép esetén thumbnail-t kérünk
            console.log('[getThumbnail] Requesting thumbnail for:', path);
            const response = await dbx.filesGetThumbnail({
                path: path,
                format: { '.tag': 'jpeg' },
                size: { '.tag': 'w256h256' },
                mode: { '.tag': 'bestfit' }
            });

            console.log('[getThumbnail] Response received, fileBlob type:', typeof response.result.fileBlob);

            // A thumbnail binary adatot base64-re konvertáljuk
            // A fileBlob egy Blob vagy Buffer objektum
            let base64;
            if (response.result.fileBlob) {
                // Node.js környezetben Buffer-ként jön
                if (Buffer.isBuffer(response.result.fileBlob)) {
                    base64 = response.result.fileBlob.toString('base64');
                } else {
                    // Ha Blob, akkor átalakítjuk Buffer-ré
                    base64 = Buffer.from(response.result.fileBlob).toString('base64');
                }
            } else {
                throw new Error('No fileBlob in response');
            }

            console.log('[getThumbnail] Base64 length:', base64.length);

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thumbnail: `data:image/jpeg;base64,${base64}`,
                    type: 'image'
                })
            };
        } else if (ext === 'pdf') {
            // PDF esetén PDF ikont adunk vissza
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thumbnail: null,
                    type: 'pdf'
                })
            };
        } else {
            // Egyéb fájl esetén általános ikon
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thumbnail: null,
                    type: 'file'
                })
            };
        }

    } catch (error) {
        console.error('Thumbnail error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: error.message || 'Error getting thumbnail',
                thumbnail: null,
                type: 'error'
            })
        };
    }
};
