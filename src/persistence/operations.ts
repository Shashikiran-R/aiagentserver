import { run, get } from './db';
import crypto from 'crypto';
import { AppError, ErrorCodes } from '../utils/errors';

export interface PendingAction {
  action_id: string;
  account_id: string;
  action_type: string;
  payload: any;
  digest: string;
  status: string;
  expires_at: string;
}

export const createPendingAction = async (accountId: string, actionType: string, payload: any, expiresInMs = 10 * 60 * 1000) => {
  const actionId = `act_${crypto.randomBytes(16).toString('hex')}`;
  const payloadStr = JSON.stringify(payload);
  const digest = crypto.createHash('sha256').update(payloadStr).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();

  await run(
    `INSERT INTO pending_actions (action_id, account_id, action_type, payload, digest, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actionId, accountId, actionType, payloadStr, digest, expiresAt]
  );

  return {
    action_id: actionId,
    digest,
    expires_at: expiresAt
  };
};

export const getPendingAction = async (actionId: string): Promise<PendingAction | undefined> => {
  const row = await get<any>('SELECT * FROM pending_actions WHERE action_id = ?', [actionId]);
  if (!row) return undefined;
  return {
    ...row,
    payload: JSON.parse(row.payload)
  };
};

export const updateActionStatus = async (actionId: string, status: string) => {
  await run('UPDATE pending_actions SET status = ? WHERE action_id = ?', [status, actionId]);
};

export const createOrGetOperation = async (idempotencyKey: string, actionId: string, accountId: string) => {
  const existing = await get<any>('SELECT * FROM operations WHERE idempotency_key = ?', [idempotencyKey]);
  if (existing) {
    if (existing.action_id !== actionId || existing.account_id !== accountId) {
      throw new AppError(ErrorCodes.IDEMPOTENCY_CONFLICT, 'Idempotency key reused with different action or account.');
    }
    return { ...existing, result: existing.result ? JSON.parse(existing.result) : null, isNew: false };
  }

  await run(
    `INSERT INTO operations (idempotency_key, action_id, account_id, status) VALUES (?, ?, ?, ?)`,
    [idempotencyKey, actionId, accountId, 'executing']
  );

  return { idempotency_key: idempotencyKey, status: 'executing', isNew: true };
};

export const updateOperationResult = async (idempotencyKey: string, status: string, result?: any) => {
  await run(
    `UPDATE operations SET status = ?, result = ?, updated_at = CURRENT_TIMESTAMP WHERE idempotency_key = ?`,
    [status, result ? JSON.stringify(result) : null, idempotencyKey]
  );
};
