/**
 * OpenRouter Sync Service
 * Fetches the live model catalog from OpenRouter API and upserts into D1.
 * Called when user opens Settings. is_selected is never overwritten.
 */

import { eq } from 'drizzle-orm';
import { orModels } from '../database/schema';
import { createLogger } from '../logger';

const logger = createLogger('OpenRouterSync');

const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models';

interface ORModelRaw {
    id: string;
    name: string;
    context_length?: number;
    pricing?: {
        prompt?: string;
        completion?: string;
    };
    architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
    };
}

interface SyncResult {
    total: number;
    added: number;
    updated: number;
    error?: string;
}

function extractProvider(modelId: string): string {
    // 'anthropic/claude-sonnet-4.5' → 'anthropic'
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : 'unknown';
}

function extractCapabilities(model: ORModelRaw): string {
    const caps: string[] = [];
    const modality = model.architecture?.modality ?? '';
    const inputModalities = model.architecture?.input_modalities ?? [];
    const outputModalities = model.architecture?.output_modalities ?? [];

    // Always has chat if it has text output
    if (outputModalities.includes('text') || modality.includes('text')) {
        caps.push('chat');
    }
    // Vision if accepts image input
    if (inputModalities.includes('image') || modality.includes('image')) {
        caps.push('vision');
    }
    // Default to chat if nothing detected
    if (caps.length === 0) {
        caps.push('chat');
    }
    return JSON.stringify(caps);
}

function isFreeModel(model: ORModelRaw): boolean {
    const prompt = parseFloat(model.pricing?.prompt ?? '0');
    const completion = parseFloat(model.pricing?.completion ?? '0');
    return prompt === 0 && completion === 0;
}

export async function syncOpenRouterModels(
    db: any,
    orApiKey: string
): Promise<SyncResult> {
    try {
        logger.info('Starting OpenRouter model sync');

        const response = await fetch(OR_MODELS_URL, {
            headers: {
                'Authorization': `Bearer ${orApiKey}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const text = await response.text();
            logger.error(`OR API error ${response.status}: ${text}`);
            return { total: 0, added: 0, updated: 0, error: `OR API error: ${response.status}` };
        }

        const data = await response.json() as { data: ORModelRaw[] };
        const models = data.data ?? [];

        logger.info(`Fetched ${models.length} models from OpenRouter`);

        let added = 0;
        let updated = 0;

        for (const model of models) {
            const provider = extractProvider(model.id);
            const capabilities = extractCapabilities(model);
            const isFree = isFreeModel(model);

            // Per-token prices (OR gives per 1M tokens)
            const inputPrice = model.pricing?.prompt
                ? parseFloat(model.pricing.prompt) / 1_000_000
                : null;
            const outputPrice = model.pricing?.completion
                ? parseFloat(model.pricing.completion) / 1_000_000
                : null;

            // Check if model already exists
            const existing = await db
                .select({ id: orModels.id })
                .from(orModels)
                .where(eq(orModels.id, model.id))
                .get();

            if (existing) {
                // Update — but never touch is_selected
                await db
                    .update(orModels)
                    .set({
                        name: model.name,
                        provider,
                        contextLength: model.context_length ?? null,
                        inputPrice,
                        outputPrice,
                        capabilities,
                        isFree,
                        lastUpdated: new Date(),
                    })
                    .where(eq(orModels.id, model.id));
                updated++;
            } else {
                // Insert new model — is_selected defaults to false
                await db.insert(orModels).values({
                    id: model.id,
                    name: model.name,
                    provider,
                    contextLength: model.context_length ?? null,
                    inputPrice,
                    outputPrice,
                    capabilities,
                    isFree,
                    isSelected: false,
                    firstSeen: new Date(),
                    lastUpdated: new Date(),
                });
                added++;
            }
        }

        logger.info(`Sync complete: ${added} added, ${updated} updated`);
        return { total: models.length, added, updated };

    } catch (error) {
        logger.error('Sync failed:', error);
        return {
            total: 0,
            added: 0,
            updated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
