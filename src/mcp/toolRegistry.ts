import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { AppError, ErrorCodes } from '../utils/errors';
import { previewEmail } from '../services/gmailService';
import { getDocumentInfo, previewAppend } from '../services/docsService';
import { createApprovalRequest, executeApprovedAction } from '../services/approvalService';
import { getTokens, getAccountByEmail, getAccountById } from '../auth/tokenStore';
import { createOrGetOperation, updateOperationResult } from '../persistence/operations';

export const setupToolRegistry = (server: Server) => {

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'google_connection_status',
          description: 'Identify current connected Google account and service permissions',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false }
        },
        {
          name: 'gmail_preview_email',
          description: 'Validate and preview an email; create approval request',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'array', items: { type: 'string' } },
              cc: { type: 'array', items: { type: 'string' } },
              bcc: { type: 'array', items: { type: 'string' } },
              subject: { type: 'string' },
              text_body: { type: 'string' },
              html_body: { type: 'string' }
            },
            required: ['to', 'subject'],
            additionalProperties: false
          }
        },
        {
          name: 'gmail_send_email',
          description: 'Send an already approved email',
          inputSchema: {
            type: 'object',
            properties: {
              action_id: { type: 'string' },
              idempotency_key: { type: 'string' }
            },
            required: ['action_id', 'idempotency_key'],
            additionalProperties: false
          }
        },
        {
          name: 'docs_get_document_info',
          description: 'Validate doc access and list its tabs',
          inputSchema: {
            type: 'object',
            properties: {
              document_url_or_id: { type: 'string' }
            },
            required: ['document_url_or_id'],
            additionalProperties: false
          }
        },
        {
          name: 'docs_preview_append',
          description: 'Validate append target/content and create approval request',
          inputSchema: {
            type: 'object',
            properties: {
              document_url_or_id: { type: 'string' },
              tab_id: { type: 'string' },
              text: { type: 'string' },
              separator: { type: 'string', enum: ['none', 'newline', 'blank_line'] }
            },
            required: ['document_url_or_id', 'text'],
            additionalProperties: false
          }
        },
        {
          name: 'docs_append_text',
          description: 'Append an already approved payload to an existing Doc',
          inputSchema: {
            type: 'object',
            properties: {
              action_id: { type: 'string' },
              idempotency_key: { type: 'string' }
            },
            required: ['action_id', 'idempotency_key'],
            additionalProperties: false
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Basic multi-tenant stub: in a real implementation we'd pull the accountId from the request context or env.
    // For MVP, we assume a single local user 'default'
    const accountId = 'default';

    try {
      let result: any;
      switch (request.params.name) {
        case 'google_connection_status': {
          const tokens = await getTokens(accountId);
          const account = await getAccountById(accountId);
          const scopeStr = tokens?.scope || '';
          const hasGmail = scopeStr.includes('gmail.send');
          const hasDocs = scopeStr.includes('documents');
          const missingScopes: string[] = [];
          if (!hasGmail) missingScopes.push('https://www.googleapis.com/auth/gmail.send');
          if (!hasDocs) missingScopes.push('https://www.googleapis.com/auth/documents');

          result = {
            connected: !!tokens,
            google_account_email: account?.email || null,
            gmail_send_enabled: hasGmail,
            docs_edit_enabled: hasDocs,
            missing_scopes: tokens ? missingScopes : ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/documents'],
            reauthorization_required: !tokens || missingScopes.length > 0
          };
          break;
        }

        case 'gmail_preview_email': {
          const previewPayload = previewEmail(request.params.arguments);
          result = await createApprovalRequest(accountId, 'gmail.send', previewPayload);
          break;
        }

        case 'gmail_send_email': {
          const { action_id, idempotency_key } = request.params.arguments as any;
          const op = await createOrGetOperation(idempotency_key, action_id, accountId);
          if (!op.isNew && op.status === 'succeeded') {
            result = op.result;
            break;
          }
          if (!op.isNew && op.status === 'executing') {
            throw new AppError(ErrorCodes.ACTION_ALREADY_EXECUTED, 'Operation is currently executing or in progress.', false);
          }
          try {
            result = await executeApprovedAction(accountId, action_id);
            await updateOperationResult(idempotency_key, 'succeeded', result);
          } catch (err) {
            await updateOperationResult(idempotency_key, 'failed', { error: (err as any).message });
            throw err;
          }
          break;
        }

        case 'docs_get_document_info': {
          const { document_url_or_id } = request.params.arguments as any;
          result = await getDocumentInfo(accountId, document_url_or_id);
          break;
        }

        case 'docs_preview_append': {
          const previewPayload = await previewAppend(accountId, request.params.arguments);
          result = await createApprovalRequest(accountId, 'docs.append', previewPayload);
          break;
        }

        case 'docs_append_text': {
          const { action_id, idempotency_key } = request.params.arguments as any;
          const op = await createOrGetOperation(idempotency_key, action_id, accountId);
          if (!op.isNew && op.status === 'succeeded') {
            result = op.result;
            break;
          }
          if (!op.isNew && op.status === 'executing') {
            throw new AppError(ErrorCodes.ACTION_ALREADY_EXECUTED, 'Operation is currently executing or in progress.', false);
          }
          try {
            result = await executeApprovedAction(accountId, action_id);
            await updateOperationResult(idempotency_key, 'succeeded', result);
          } catch (err) {
            await updateOperationResult(idempotency_key, 'failed', { error: (err as any).message });
            throw err;
          }
          break;
        }

        default:
          throw new Error(`Tool not found: ${request.params.name}`);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };

    } catch (err: any) {
      if (err instanceof AppError) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            status: 'error',
            code: err.code,
            message: err.message,
            retryable: err.retryable,
            details: err.details
          }, null, 2) }],
          isError: true
        };
      }
      return {
        content: [{ type: 'text', text: `Internal Error: ${err.message}` }],
        isError: true
      };
    }
  });
};
