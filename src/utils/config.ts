export const getBaseUrl = (): string => {
  const envBase = process.env.BASE_URL;
  if (envBase && !envBase.includes('<')) {
    return envBase.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
};

export const getRedirectUri = (): string => {
  const envRedirect = process.env.GOOGLE_REDIRECT_URI;
  if (envRedirect && !envRedirect.includes('<')) {
    return envRedirect;
  }
  return `${getBaseUrl()}/oauth2callback`;
};
