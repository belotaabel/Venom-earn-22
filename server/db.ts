import { neon } from "@neondatabase/serverless";

let schemaReady: Promise<void> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return neon(url);
}

export async function ensureSchema() {
  if (!schemaReady) {
    const sql = database();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          telegram_id BIGINT PRIMARY KEY,
          first_name TEXT NOT NULL,
          username TEXT,
          phone_number TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS device_id TEXT`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_device_id_idx ON users(device_id) WHERE device_id IS NOT NULL`;
      await sql`
        CREATE TABLE IF NOT EXISTS pending_referrals (
          telegram_id BIGINT PRIMARY KEY,
          referrer_telegram_id BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS referrals (
          id BIGSERIAL PRIMARY KEY,
          referrer_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
          referred_telegram_id BIGINT NOT NULL UNIQUE REFERENCES users(telegram_id),
          referred_name TEXT NOT NULL,
          reward NUMERIC(10, 2) NOT NULL DEFAULT 3.00,
          status TEXT NOT NULL DEFAULT 'completed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id BIGSERIAL PRIMARY KEY,
          telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
          phone_number TEXT NOT NULL,
          account_name TEXT NOT NULL,
          amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS withdrawal_sessions (
          telegram_id BIGINT PRIMARY KEY REFERENCES users(telegram_id),
          step TEXT NOT NULL,
          phone_number TEXT,
          account_name TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        INSERT INTO app_settings (key, value) VALUES ('minimum_withdrawal', '30')
        ON CONFLICT (key) DO NOTHING
      `;
    })();
  }
  await schemaReady;
}

export async function savePendingReferral(telegramId: number, referrerTelegramId: number) {
  await ensureSchema();
  const sql = database();
  await sql`
    INSERT INTO pending_referrals (telegram_id, referrer_telegram_id)
    VALUES (${telegramId}, ${referrerTelegramId})
    ON CONFLICT (telegram_id) DO UPDATE SET referrer_telegram_id = EXCLUDED.referrer_telegram_id
  `;
}

export async function registerUser(input: { telegramId: number; firstName: string; username?: string; phoneNumber?: string }) {
  await ensureSchema();
  const sql = database();
  const users = await sql`
    INSERT INTO users (telegram_id, first_name, username, phone_number)
    VALUES (${input.telegramId}, ${input.firstName}, ${input.username ?? null}, ${input.phoneNumber ?? null})
    ON CONFLICT (telegram_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      username = COALESCE(EXCLUDED.username, users.username),
      phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number)
    RETURNING telegram_id
  `;

  const pending = await sql`
    DELETE FROM pending_referrals WHERE telegram_id = ${input.telegramId}
    RETURNING referrer_telegram_id
  `;
  const referrerId = pending[0]?.referrer_telegram_id;
  if (referrerId && referrerId !== input.telegramId) {
    await sql`
      INSERT INTO referrals (referrer_telegram_id, referred_telegram_id, referred_name)
      SELECT ${referrerId}, ${input.telegramId}, first_name FROM users WHERE telegram_id = ${input.telegramId}
      ON CONFLICT (referred_telegram_id) DO NOTHING
    `;
  }

  return { ...users[0], referrerId: referrerId ?? null };
}

export async function bindDevice(telegramId: number, deviceId: string) {
  await ensureSchema();
  const sql = database();
  const existing = await sql`SELECT telegram_id FROM users WHERE device_id = ${deviceId} AND telegram_id <> ${telegramId}`;
  if (existing[0]) throw new Error("DEVICE_CONFLICT");
  const bound = await sql`
    UPDATE users SET device_id = ${deviceId}
    WHERE telegram_id = ${telegramId} AND (device_id IS NULL OR device_id = ${deviceId})
    RETURNING telegram_id, device_id
  `;
  if (!bound[0]) throw new Error("DEVICE_CONFLICT");

  const pending = await sql`
    DELETE FROM pending_referrals WHERE telegram_id = ${telegramId}
    RETURNING referrer_telegram_id
  `;
  const referrerId = pending[0]?.referrer_telegram_id;
  if (referrerId && referrerId !== telegramId) {
    const referrer = await sql`SELECT device_id FROM users WHERE telegram_id = ${referrerId}`;
    if (referrer[0]?.device_id !== deviceId) {
      await sql`
        INSERT INTO referrals (referrer_telegram_id, referred_telegram_id, referred_name)
        SELECT ${referrerId}, ${telegramId}, first_name FROM users WHERE telegram_id = ${telegramId}
        ON CONFLICT (referred_telegram_id) DO NOTHING
      `;
    }
  }
  return { ...bound[0], referrerId: referrerId ?? null };
}

export async function getMinimumWithdrawal() {
  await ensureSchema();
  const sql = database();
  const rows = await sql`SELECT value FROM app_settings WHERE key = 'minimum_withdrawal'`;
  return Math.max(30, Number(rows[0]?.value ?? 30));
}

export async function setMinimumWithdrawal(amount: number) {
  await ensureSchema();
  const sql = database();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES ('minimum_withdrawal', ${String(amount)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getAdminWithdrawals() {
  await ensureSchema();
  const sql = database();
  return sql`
    SELECT w.id, w.telegram_id AS "telegramId", u.first_name AS "firstName", u.username,
      w.phone_number AS "phoneNumber", w.account_name AS "accountName", w.amount::numeric AS amount,
      w.status, TO_CHAR(w.created_at AT TIME ZONE 'Africa/Addis_Ababa', 'YYYY-MM-DD HH24:MI') AS date
    FROM withdrawals w JOIN users u ON u.telegram_id = w.telegram_id
    ORDER BY w.created_at DESC LIMIT 100
  `;
}

export async function updateWithdrawalStatus(id: number, status: "approved" | "rejected") {
  await ensureSchema();
  const sql = database();
  const rows = await sql`UPDATE withdrawals SET status = ${status} WHERE id = ${id} RETURNING id, status`;
  return rows[0];
}

export type WithdrawalSession = { step: "phone" | "owner" | "amount"; phoneNumber: string | null; accountName: string | null };

export async function saveWithdrawalSession(telegramId: number, session: WithdrawalSession) {
  await ensureSchema();
  const sql = database();
  await sql`
    INSERT INTO withdrawal_sessions (telegram_id, step, phone_number, account_name)
    VALUES (${telegramId}, ${session.step}, ${session.phoneNumber}, ${session.accountName})
    ON CONFLICT (telegram_id) DO UPDATE SET
      step = EXCLUDED.step,
      phone_number = EXCLUDED.phone_number,
      account_name = EXCLUDED.account_name,
      updated_at = NOW()
  `;
}

export async function getWithdrawalSession(telegramId: number) {
  await ensureSchema();
  const sql = database();
  const rows = await sql`
    SELECT step, phone_number AS "phoneNumber", account_name AS "accountName"
    FROM withdrawal_sessions WHERE telegram_id = ${telegramId}
  `;
  return rows[0] as WithdrawalSession | undefined;
}

export async function clearWithdrawalSession(telegramId: number) {
  await ensureSchema();
  const sql = database();
  await sql`DELETE FROM withdrawal_sessions WHERE telegram_id = ${telegramId}`;
}

export async function createWithdrawal(input: { telegramId: number; phoneNumber: string; accountName: string; amount: number }) {
  await ensureSchema();
  const sql = database();
  const rows = await sql`
    INSERT INTO withdrawals (telegram_id, phone_number, account_name, amount)
    VALUES (${input.telegramId}, ${input.phoneNumber}, ${input.accountName}, ${input.amount})
    RETURNING id, amount::numeric AS amount, status
  `;
  return rows[0];
}

export async function getDashboard(telegramId: number) {
  await ensureSchema();
  const sql = database();
  const [users, totals, recent] = await Promise.all([
    sql`SELECT telegram_id, first_name, username, phone_number FROM users WHERE telegram_id = ${telegramId}`,
    sql`
      SELECT COUNT(*)::int AS count,
        GREATEST(
          COALESCE(SUM(reward), 0) - COALESCE((
            SELECT SUM(amount) FROM withdrawals
            WHERE telegram_id = ${telegramId} AND status IN ('pending', 'approved')
          ), 0),
          0
        )::numeric AS total
      FROM referrals WHERE referrer_telegram_id = ${telegramId}
    `,
    sql`
      SELECT referred_name AS name, reward::numeric AS reward, status,
             TO_CHAR(created_at AT TIME ZONE 'Africa/Addis_Ababa', 'YYYY-MM-DD HH24:MI') AS date
      FROM referrals WHERE referrer_telegram_id = ${telegramId}
      ORDER BY created_at DESC LIMIT 10
    `,
  ]);
  if (!users[0]) return null;
  return {
    user: users[0],
    referrals: { count: totals[0]?.count ?? 0, total: Number(totals[0]?.total ?? 0) },
    recent,
  };
}
