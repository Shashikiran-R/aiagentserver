import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/googleOAuth';
import { AppError, ErrorCodes } from '../utils/errors';
import { logger } from '../utils/logging';

export const previewEmail = (payload: any) => {
  if (!payload.to || !Array.isArray(payload.to) || payload.to.length === 0) {
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Email must have at least one recipient in "to".');
  }
  if (!payload.subject) {
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Email must have a subject.');
  }
  if (!payload.text_body && !payload.html_body) {
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Email must have text_body or html_body.');
  }
  
  return {
    to: payload.to,
    cc: payload.cc || [],
    bcc: payload.bcc || [],
    subject: payload.subject,
    text_body: payload.text_body,
    html_body: payload.html_body
  };
};

export const sendEmail = async (accountId: string, payload: any) => {
  let authClient;
  try {
    authClient = await getAuthenticatedClient(accountId);
  } catch (err: any) {
    throw new AppError(ErrorCodes.NOT_CONNECTED, 'Google account is not connected.', false);
  }

  const gmail = google.gmail({ version: 'v1', auth: authClient });
  
  const utf8B64 = (str: string) => Buffer.from(str, 'utf-8').toString('base64');
  
  const headers = [
    `To: ${payload.to.join(', ')}`,
    `Subject: =?utf-8?B?${utf8B64(payload.subject)}?=`
  ];
  
  if (payload.cc && payload.cc.length > 0) {
    headers.push(`Cc: ${payload.cc.join(', ')}`);
  }
  if (payload.bcc && payload.bcc.length > 0) {
    headers.push(`Bcc: ${payload.bcc.join(', ')}`);
  }
  
  // Basic MIME composition (simplistic for MVP)
  let rawMessage = headers.join('\n') + '\n';
  
  if (payload.html_body && payload.text_body) {
    rawMessage += `Content-Type: multipart/alternative; boundary="boundary-string"\n\n`;
    rawMessage += `--boundary-string\nContent-Type: text/plain; charset="UTF-8"\n\n${payload.text_body}\n\n`;
    rawMessage += `--boundary-string\nContent-Type: text/html; charset="UTF-8"\n\n${payload.html_body}\n\n`;
    rawMessage += `--boundary-string--`;
  } else if (payload.html_body) {
    rawMessage += `Content-Type: text/html; charset="UTF-8"\n\n${payload.html_body}`;
  } else {
    rawMessage += `Content-Type: text/plain; charset="UTF-8"\n\n${payload.text_body}`;
  }

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return {
      provider: 'gmail',
      message_id: res.data.id,
      thread_id: res.data.threadId
    };
  } catch (err: any) {
    logger.error('Error sending email', { error: err.message, stack: err.stack });
    
    if (err.code === 403 || err.code === 401) {
      throw new AppError(ErrorCodes.INSUFFICIENT_GOOGLE_SCOPE, 'Insufficient permissions to send email. Re-authorize required.');
    }
    
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to send email: ${err.message}`, true);
  }
};
