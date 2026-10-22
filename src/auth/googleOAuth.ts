import { google } from 'googleapis';
import { getTokens, saveTokens } from './tokenStore';
import { logger } from '../utils/logging';

export const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth configuration is missing in environment variables');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

export const getAuthUrl = (accountId?: string) => {
  const oauth2Client = getOAuthClient();
  const scopes = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/documents'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: accountId,
    prompt: 'consent'
  });
};

export const getAuthenticatedClient = async (accountId: string) => {
  const tokens = await getTokens(accountId);
  if (!tokens) {
    throw new Error('NOT_CONNECTED');
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);

  // Automatically save tokens if they are refreshed
  oauth2Client.on('tokens', async (newTokens) => {
    // If we only get a new access token, merge it with existing refresh token
    if (!newTokens.refresh_token && tokens.refresh_token) {
        newTokens.refresh_token = tokens.refresh_token;
    }
    await saveTokens(accountId, newTokens);
    logger.debug('Refreshed tokens saved', { accountId });
  });

  return oauth2Client;
};

export const getUserInfo = async (authClient: any) => {
  const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
  const res = await oauth2.userinfo.get();
  return res.data;
};
