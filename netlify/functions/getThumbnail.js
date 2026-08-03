// netlify/functions/getThumbnail.js
const { Dropbox } = require('dropbox');

const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN;
const APP_KEY = process.env.DROPBOX_APP_KEY;
const APP_SECRET = process.env.DROPBOX_APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;

// A Dropbox SDK a nem-JSON hibatestet (pl. a hiányzó scope 400-as, sima szöveges
// válaszát) az e.error mezőben adja vissza, az e.message viszont csak annyi:
// "Response failed with a 400 code". Ezért mindkettőt ki kell olvasni.
function describeDbxError(e) {
  const body = typeof e?.error === 'string' ? e.error : e?.error?.error_summary;
  return [e?.status, body || e?.message || 'Unknown error'].filter(Boolean).join(' - ');
}

exports.handler = async (event) => {
    const origin = event?.headers?.origin || event?.headers?.Origin || process.env.ALLOWED_ORIGIN || '*';
    const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        const path = event.queryStringParameters?.path;
        const fileId = event.queryStringParameters?.fileId;
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
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'];

        if (imageExtensions.includes(ext)) {
            let tempLink = null;
            const problems = [];
            // A fileId ("id:...") a legmegbízhatóbb azonosító: nem érzékeny a
            // kis/nagybetűre és az ékezetek unicode-normalizálására.
            const candidates = [fileId, path, path.normalize('NFC'), path.normalize('NFD')].filter(Boolean);
            for (const candidate of candidates) {
                try {
                    const response = await dbx.filesGetTemporaryLink({ path: candidate });
                    if (response?.result?.link) {
                        tempLink = response.result.link;
                        break;
                    }
                } catch (e) {
                    problems.push(`temp_link(${candidate}): ${describeDbxError(e)}`);
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
                    problems.push(`share_link: ${describeDbxError(eShare)}`);
                }
            }

            if (!tempLink) {
                console.error('[getThumbnail] Nem sikerült linket szerezni:', path, problems);
            }

            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thumbnail: tempLink,
                    type: 'image',
                    // Ha nincs link, a kliens konzoljában is látszódjon a valódi ok
                    // (pl. hiányzó Dropbox scope), ne csak egy néma null.
                    error: tempLink ? undefined : (problems.join(' | ') || 'Nem sikerült linket generálni')
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
