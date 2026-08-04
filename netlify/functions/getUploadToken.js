const { Dropbox } = require('dropbox');

const REFRESH_TOKEN = (process.env.DROPBOX_REFRESH_TOKEN || '').trim();
const APP_KEY = (process.env.DROPBOX_APP_KEY || '').trim();
const APP_SECRET = (process.env.DROPBOX_APP_SECRET || '').trim();
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || '*').trim();

exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || ALLOWED_ORIGIN;
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const dbx = new Dropbox({
      refreshToken: REFRESH_TOKEN,
      clientId: APP_KEY,
      clientSecret: APP_SECRET
    });

    await dbx.auth.checkAndRefreshAccessToken();
    const token = dbx.auth.getAccessToken();

    if (!token) {
      throw new Error('Dropbox Access Token konnte nem generiert werden.');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accessToken: token
      })
    };
  } catch (error) {
    console.error('getUploadToken hiba:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: error.message || 'Dropbox Token Hiba' })
    };
  }
};
