import { createPendingAction, getPendingAction, updateActionStatus } from '../persistence/operations';
import { AppError, ErrorCodes } from '../utils/errors';
import { sendEmail } from './gmailService';
import { appendText } from './docsService';
import { getBaseUrl } from '../utils/config';

export const createApprovalRequest = async (accountId: string, actionType: string, previewPayload: any) => {
  const pending = await createPendingAction(accountId, actionType, previewPayload);
  const baseUrl = getBaseUrl();
  
  return {
    status: 'pending_approval',
    action_id: pending.action_id,
    action_type: actionType,
    preview: previewPayload,
    approval_url: `${baseUrl}/approve/${pending.action_id}`,
    expires_at: pending.expires_at
  };
};

export const executeApprovedAction = async (accountId: string, actionId: string) => {
  const pending = await getPendingAction(actionId);
  
  if (!pending) {
    throw new AppError(ErrorCodes.INVALID_ARGUMENT, 'Invalid action ID.');
  }
  
  if (pending.account_id !== accountId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'This action belongs to a different account.');
  }

  const now = new Date().toISOString();
  if (pending.expires_at < now) {
    if (pending.status === 'pending_approval') {
      await updateActionStatus(actionId, 'expired');
    }
    throw new AppError(ErrorCodes.APPROVAL_EXPIRED, 'The approval window has expired. Please preview again.', false);
  }

  if (pending.status === 'rejected') {
    throw new AppError(ErrorCodes.APPROVAL_REJECTED, 'The user rejected this action.', false);
  }
  
  if (pending.status === 'pending_approval') {
    throw new AppError(ErrorCodes.APPROVAL_REQUIRED, 'Human approval is required before execution.', false);
  }

  if (pending.status !== 'approved') {
    throw new AppError(ErrorCodes.ACTION_ALREADY_EXECUTED, 'Action is already in a terminal state.', false);
  }

  // Execute the underlying action
  let result;
  if (pending.action_type === 'gmail.send') {
    result = await sendEmail(accountId, pending.payload);
  } else if (pending.action_type === 'docs.append') {
    result = await appendText(accountId, pending.payload);
  } else {
    throw new AppError(ErrorCodes.INTERNAL_ERROR, `Unknown action type ${pending.action_type}`);
  }

  await updateActionStatus(actionId, 'executed');
  return result;
};
