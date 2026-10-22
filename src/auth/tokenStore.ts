import { run, get } from '../persistence/db';

export const saveTokens = async (accountId: string, tokens: any) => {
  await run(
    `INSERT INTO oauth_credentials (account_id, tokens) VALUES (?, ?)
     ON CONFLICT(account_id) DO UPDATE SET tokens = excluded.tokens, updated_at = CURRENT_TIMESTAMP`,
    [accountId, JSON.stringify(tokens)]
  );
};

export const getTokens = async (accountId: string): Promise<any | undefined> => {
  const row = await get<any>('SELECT tokens FROM oauth_credentials WHERE account_id = ?', [accountId]);
  if (!row) return undefined;
  return JSON.parse(row.tokens);
};

export const getAccountByEmail = async (email: string) => {
  return await get<any>('SELECT * FROM google_accounts WHERE email = ?', [email]);
};

export const getAccountById = async (id: string) => {
  return await get<any>('SELECT * FROM google_accounts WHERE id = ?', [id]);
};

export const createAccount = async (id: string, email: string) => {
  await run(
    `INSERT INTO google_accounts (id, email) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email`,
    [id, email]
  );
};
