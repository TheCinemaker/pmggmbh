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
            let tempLink = null;
            const candidates = [path, path.normalize('NFC'), path.normalize('NFD')].filter(Boolean);
            for (const candidate of candidates) {
                try {
                    const response = await dbx.filesGetTemporaryLink({ path: candidate });
                    if (response?.result?.link) {
                        tempLink = response.result.link;
                        break;
                    }
                } catch (e) {
                    // Try next candidate
                }
            }

            if (!tempLink) {
                try {
                    const ls = await dbx.sharingListSharedLinks({ path, direct_only: true });
                    let sl = ls?.result?.links?.[0]?.url || null;
                    if (!sl) {
                        const cr = await dbx.sharingCreateSharedLinkWithSettings({ path });
                        sl = cr?.result?.url || null;
                    }
                    if (sl) {
                        tempLink = sl.includes('?') ? `${sl}&raw=1` : `${sl}?raw=1`;
                    }
                } catch (eShare) {
                    console.warn('[getThumbnail] Share link fallback is elhasalt:', eShare?.message);
                }
            }

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thumbnail: tempLink,
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
        console.error('Error details:', JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: error.message || 'Error getting thumbnail',
                error: error.error?.error_summary || 'Unknown error',
                thumbnail: null,
                type: 'error'
            })
        };
    }
};
