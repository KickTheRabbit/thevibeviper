/**
 * Auto-Migration: OpenRouter Tables
 * Runs on first request if tables don't exist yet.
 * Safe to run multiple times (IF NOT EXISTS).
 */

let migrationDone = false;

export async function ensureOpenRouterTables(env: Env): Promise<void> {
    if (migrationDone) return;

    try {
        await env.DB.batch([
            env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS or_models (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    context_length INTEGER,
                    input_price REAL,
                    output_price REAL,
                    capabilities TEXT DEFAULT '[]',
                    is_selected INTEGER DEFAULT 0,
                    is_free INTEGER DEFAULT 0,
                    model_created_at INTEGER,
                    first_seen INTEGER DEFAULT (unixepoch()),
                    last_updated INTEGER DEFAULT (unixepoch())
                )
            `),
            env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS user_settings (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    or_api_key_encrypted TEXT,
                    or_api_key_preview TEXT,
                    created_at INTEGER DEFAULT (unixepoch()),
                    updated_at INTEGER DEFAULT (unixepoch())
                )
            `),
            env.DB.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_idx
                ON user_settings(user_id)
            `),
            // Add model_created_at column if upgrading from earlier version
            env.DB.prepare(`
                ALTER TABLE or_models ADD COLUMN model_created_at INTEGER
            `).catch(() => { /* column already exists, ignore */ }),
        ]);

        migrationDone = true;
    } catch (error) {
        // Log but don't crash — tables may already exist
        console.error('Auto-migration warning:', error);
        migrationDone = true;
    }
}
