/**
 * OpenRouter Controller
 * Handles: model sync, API key save/retrieve, model selection
 */

import { Context } from 'hono';
import { AppEnv } from '../../../types/appenv';
import { eq, asc } from 'drizzle-orm';
import { orModels, userSettings } from '../../../database/schema';
import { syncOpenRouterModels } from '../../../services/openrouterSync';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../../../services/crypto';
import { createLogger } from '../../../logger';

const logger = createLogger('OpenRouterController');

export class OpenRouterController {

    /**
     * POST /api/openrouter/sync-models
     * Fetches live model list from OR and upserts into D1.
     * Requires valid OR key stored for this user.
     */
    static async syncModels(c: Context<AppEnv>) {
        try {
            const user = c.get('user');
            const db = c.get('db');

            // Get encrypted key from DB
            const settings = await db
                .select()
                .from(userSettings)
                .where(eq(userSettings.userId, user.id))
                .get();

            if (!settings?.orApiKeyEncrypted) {
                return c.json({ error: 'No OpenRouter API key configured. Please save your key first.' }, 400);
            }

            const jwtSecret = c.env.JWT_SECRET;
            const orApiKey = await decryptApiKey(settings.orApiKeyEncrypted, jwtSecret);

            const result = await syncOpenRouterModels(db, orApiKey);

            if (result.error) {
                return c.json({ error: result.error }, 502);
            }

            return c.json({
                success: true,
                total: result.total,
                added: result.added,
                updated: result.updated,
            });

        } catch (error) {
            logger.error('syncModels error:', error);
            return c.json({ error: 'Internal server error' }, 500);
        }
    }

    /**
     * POST /api/openrouter/save-key
     * Encrypts and saves OR API key for the current user.
     * Body: { apiKey: string }
     */
    static async saveKey(c: Context<AppEnv>) {
        try {
            const user = c.get('user');
            const db = c.get('db');
            const body = await c.req.json<{ apiKey: string }>();

            if (!body.apiKey?.trim()) {
                return c.json({ error: 'apiKey is required' }, 400);
            }

            const jwtSecret = c.env.JWT_SECRET;
            const encrypted = await encryptApiKey(body.apiKey.trim(), jwtSecret);
            const preview = maskApiKey(body.apiKey.trim());

            // Check if settings row exists for this user
            const existing = await db
                .select({ id: userSettings.id })
                .from(userSettings)
                .where(eq(userSettings.userId, user.id))
                .get();

            if (existing) {
                await db
                    .update(userSettings)
                    .set({
                        orApiKeyEncrypted: encrypted,
                        orApiKeyPreview: preview,
                        updatedAt: new Date(),
                    })
                    .where(eq(userSettings.userId, user.id));
            } else {
                await db.insert(userSettings).values({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    orApiKeyEncrypted: encrypted,
                    orApiKeyPreview: preview,
                });
            }

            return c.json({ success: true, preview });

        } catch (error) {
            logger.error('saveKey error:', error);
            return c.json({ error: 'Internal server error' }, 500);
        }
    }

    /**
     * GET /api/openrouter/key-status
     * Returns whether OR key is configured + masked preview.
     * Never returns the actual key.
     */
    static async getKeyStatus(c: Context<AppEnv>) {
        try {
            const user = c.get('user');
            const db = c.get('db');

            const settings = await db
                .select({
                    orApiKeyPreview: userSettings.orApiKeyPreview,
                    updatedAt: userSettings.updatedAt,
                })
                .from(userSettings)
                .where(eq(userSettings.userId, user.id))
                .get();

            return c.json({
                configured: !!settings?.orApiKeyPreview,
                preview: settings?.orApiKeyPreview ?? null,
                updatedAt: settings?.updatedAt ?? null,
            });

        } catch (error) {
            logger.error('getKeyStatus error:', error);
            return c.json({ error: 'Internal server error' }, 500);
        }
    }

    /**
     * GET /api/openrouter/models
     * Returns all models from D1, grouped by provider.
     * Query param: ?selectedOnly=true to get only selected models.
     */
    static async getModels(c: Context<AppEnv>) {
        try {
            const db = c.get('db');
            const selectedOnly = c.req.query('selectedOnly') === 'true';

            let query = db.select().from(orModels);
            if (selectedOnly) {
                query = query.where(eq(orModels.isSelected, true));
            }
            const models = await query.orderBy(asc(orModels.provider), asc(orModels.name));

            // Group by provider
            const grouped: Record<string, typeof models> = {};
            for (const model of models) {
                if (!grouped[model.provider]) {
                    grouped[model.provider] = [];
                }
                grouped[model.provider].push(model);
            }

            return c.json({
                models,
                grouped,
                total: models.length,
            });

        } catch (error) {
            logger.error('getModels error:', error);
            return c.json({ error: 'Internal server error' }, 500);
        }
    }

    /**
     * POST /api/openrouter/models/selection
     * Updates is_selected for a list of model IDs.
     * Body: { selectedIds: string[] }
     */
    static async updateSelection(c: Context<AppEnv>) {
        try {
            const db = c.get('db');
            const body = await c.req.json<{ selectedIds: string[] }>();

            if (!Array.isArray(body.selectedIds)) {
                return c.json({ error: 'selectedIds must be an array' }, 400);
            }

            // Reset all to false first
            await db.update(orModels).set({ isSelected: false });

            // Set selected ones to true
            if (body.selectedIds.length > 0) {
                for (const id of body.selectedIds) {
                    await db
                        .update(orModels)
                        .set({ isSelected: true })
                        .where(eq(orModels.id, id));
                }
            }

            return c.json({ success: true, selectedCount: body.selectedIds.length });

        } catch (error) {
            logger.error('updateSelection error:', error);
            return c.json({ error: 'Internal server error' }, 500);
        }
    }
}
