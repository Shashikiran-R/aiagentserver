import { google } from 'googleapis';
import { getAuthenticatedClient } from '../auth/googleOAuth';
import { AppError, ErrorCodes } from '../utils/errors';
import { logger } from '../utils/logging';

const extractDocumentId = (urlOrId: string): string => {
  if (urlOrId.startsWith('http')) {
    const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Could not extract document ID from URL.');
  }
  return urlOrId;
};

export const getDocumentInfo = async (accountId: string, urlOrId: string) => {
  let authClient;
  try {
    authClient = await getAuthenticatedClient(accountId);
  } catch (err: any) {
    throw new AppError(ErrorCodes.NOT_CONNECTED, 'Google account is not connected.', false);
  }

  const documentId = extractDocumentId(urlOrId);
  const docs = google.docs({ version: 'v1', auth: authClient });

  try {
    const res = await docs.documents.get({
      documentId,
      includeTabsContent: true
    });

    const tabs: any[] = [];
    if (res.data.tabs) {
        // Collect tab info
        for (const tab of res.data.tabs) {
            tabs.push({
                tab_id: tab.tabProperties?.tabId,
                title: tab.tabProperties?.title,
                revisionId: res.data.revisionId // Use doc-level revision
            });
        }
    } else {
        // Fallback for docs API behavior if tabs are absent
        tabs.push({
            tab_id: 'default', // Or we might not need tabId if none exist
            title: res.data.title,
            revisionId: res.data.revisionId
        });
    }

    return {
      documentId,
      title: res.data.title,
      revisionId: res.data.revisionId,
      tabs
    };
  } catch (err: any) {
    logger.error('Error fetching document info', { error: err.message });
    if (err.code === 404) {
      throw new AppError(ErrorCodes.DOCUMENT_NOT_FOUND, 'Document not found or access denied.');
    }
    if (err.code === 403) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Permission denied to read document.');
    }
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get document info: ${err.message}`, true);
  }
};

export const previewAppend = async (accountId: string, payload: any) => {
  const info = await getDocumentInfo(accountId, payload.document_url_or_id);
  
  if (!payload.text) {
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Text to append is required.');
  }

  let tabId = payload.tab_id;
  if (!tabId) {
    if (info.tabs.length > 1) {
      throw new AppError(ErrorCodes.TAB_SELECTION_REQUIRED, 'This document contains multiple tabs. Choose a tab_id before appending.', false, { tabs: info.tabs });
    }
    tabId = info.tabs.length === 1 && info.tabs[0].tab_id !== 'default' ? info.tabs[0].tab_id : undefined;
  } else {
    const tabExists = info.tabs.some(t => t.tab_id === tabId);
    if (!tabExists) {
        throw new AppError(ErrorCodes.TAB_NOT_FOUND, `Tab ID ${tabId} not found in the document.`);
    }
  }

  return {
    document_id: info.documentId,
    document_url: `https://docs.google.com/document/d/${info.documentId}/edit`,
    tab_id: tabId,
    text: payload.text,
    separator: payload.separator || 'blank_line',
    revisionId: info.revisionId
  };
};

export const appendText = async (accountId: string, payload: any) => {
  let authClient;
  try {
    authClient = await getAuthenticatedClient(accountId);
  } catch (err: any) {
    throw new AppError(ErrorCodes.NOT_CONNECTED, 'Google account is not connected.', false);
  }

  const docs = google.docs({ version: 'v1', auth: authClient });
  
  let formattedText = payload.text;
  if (payload.separator === 'newline') {
    formattedText = '\n' + formattedText;
  } else if (payload.separator === 'blank_line' || !payload.separator) {
    formattedText = '\n\n' + formattedText;
  }

  const requests: any[] = [
    {
      insertText: {
        text: formattedText,
        endOfSegmentLocation: {
          segmentId: '' // The body of the document
        }
      }
    }
  ];

  if (payload.tab_id) {
    requests[0].insertText.endOfSegmentLocation.tabId = payload.tab_id;
  }

  try {
    const res = await docs.documents.batchUpdate({
      documentId: payload.document_id,
      requestBody: {
        requests,
        writeControl: {
          requiredRevisionId: payload.revisionId
        }
      }
    });

    return {
      provider: 'google_docs',
      document_id: payload.document_id,
      document_url: payload.document_url,
      tab_id: payload.tab_id,
      characters_appended: formattedText.length
    };
  } catch (err: any) {
    logger.error('Error appending to document', { error: err.message, stack: err.stack });
    
    if (err.message && err.message.includes('revision')) {
      throw new AppError(ErrorCodes.REVISION_CHANGED, 'Document revision has changed since preview. Please preview again.');
    }
    
    if (err.code === 403 || err.code === 401) {
      throw new AppError(ErrorCodes.INSUFFICIENT_GOOGLE_SCOPE, 'Insufficient permissions to edit document. Re-authorize required.');
    }
    
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to append text: ${err.message}`, true);
  }
};
