/**
 * OpenRouter Service
 * Handles OR model sync, API key encryption/storage, and model selection.
 * Follows BaseService pattern.
 */

import { eq, asc } from 'drizzle-orm';
import { BaseService } from './BaseService';
import { orModels, userSettings } from '../schema';

const OR_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const SALT = 'vibesdk-or-key-v1';
const ITERATIONS = 100_000;

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

export interface SyncResult {
    total: number;
    added: number;
    updated: number;
    error?: string;
}

export class OpenRouterService extends BaseService {
    constructor(env: Env) {
        super(env);
    }

    // ─── Crypto ────────────────────────────────────────────────────────────────

    private async deriveKey(): Promise<CryptoKey> {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            enc.encode(this.env.JWT_SECRET),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: enc.encode(SALT),
                iterations: ITERATIONS,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async encryptApiKey(plaintext: string): Promise<string> {
        const key = await this.deriveKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            enc.encode(plaintext)
        );
        const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.byteLength);
        return btoa(String.fromCharCode(...combined));
    }

    async decryptApiKey(ciphertext: string): Promise<string> {
        const key = await this.deriveKey();
        const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encrypted
        );
        return new TextDecoder().decode(decrypted);
    }

    maskApiKey(key: string): string {
        if (key.length <= 8) return '••••••••';
        return key.substring(0, 12) + '...' + key.substring(key.length - 4);
    }

    // ─── Key Storage ───────────────────────────────────────────────────────────

    async saveApiKey(userId: string, apiKey: string): Promise<{ preview: string }> {
        const encrypted = await this.encryptApiKey(apiKey.trim());
        const preview = this.maskApiKey(apiKey.trim());

        const existing = await this.database
            .select({ id: userSettings.id })
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .get();

        if (existing) {
            await this.database
                .update(userSettings)
                .set({
                    orApiKeyEncrypted: encrypted,
                    orApiKeyPreview: preview,
                    updatedAt: new Date(),
                })
                .where(eq(userSettings.userId, userId));
        } else {
            await this.database.insert(userSettings).values({
                id: crypto.randomUUID(),
                userId,
                orApiKeyEncrypted: encrypted,
                orApiKeyPreview: preview,
            });
        }
        return { preview };
    }

    async getKeyStatus(userId: string): Promise<{ configured: boolean; preview: string | null; updatedAt: Date | null }> {
        const settings = await this.database
            .select({
                orApiKeyPreview: userSettings.orApiKeyPreview,
                updatedAt: userSettings.updatedAt,
            })
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .get();

        return {
            configured: !!settings?.orApiKeyPreview,
            preview: settings?.orApiKeyPreview ?? null,
            updatedAt: settings?.updatedAt ?? null,
        };
    }

    async getDecryptedApiKey(userId: string): Promise<string | null> {
        const settings = await this.database
            .select({ orApiKeyEncrypted: userSettings.orApiKeyEncrypted })
            .from(userSettings)
            .where(eq(userSettings.userId, userId))
            .get();

        if (!settings?.orApiKeyEncrypted) return null;
        return this.decryptApiKey(settings.orApiKeyEncrypted);
    }

    // ─── Model Sync ────────────────────────────────────────────────────────────

    private extractProvider(modelId: string): string {
        const parts = modelId.split('/');
        return parts.length > 1 ? parts[0] : 'unknown';
    }

    private extractCapabilities(model: ORModelRaw): string {
        const caps: string[] = [];
        const inputModalities = model.architecture?.input_modalities ?? [];
        const outputModalities = model.architecture?.output_modalities ?? [];
        const modality = model.architecture?.modality ?? '';

        if (outputModalities.includes('text') || modality.includes('text')) {
            caps.push('chat');
        }
        if (inputModalities.includes('image') || modality.includes('image')) {
            caps.push('vision');
        }
        if (caps.length === 0) caps.push('chat');
        return JSON.stringify(caps);
    }

    private isFreeModel(model: ORModelRaw): boolean {
        const prompt = parseFloat(model.pricing?.prompt ?? '0');
        const completion = parseFloat(model.pricing?.completion ?? '0');
        return prompt === 0 && completion === 0;
    }

    async syncModels(userId: string): Promise<SyncResult> {
        try {
            const orApiKey = await this.getDecryptedApiKey(userId);
            if (!orApiKey) {
                return { total: 0, added: 0, updated: 0, error: 'No OpenRouter API key configured' };
            }

            const response = await fetch(OR_MODELS_URL, {
                headers: { 'Authorization': `Bearer ${orApiKey}` },
            });

            if (!response.ok) {
                return { total: 0, added: 0, updated: 0, error: `OR API error: ${response.status}` };
            }

            const data = await response.json() as { data: ORModelRaw[] };
            const models = data.data ?? [];

            let added = 0;
            let updated = 0;

            for (const model of models) {
                const provider = this.extractProvider(model.id);
                const capabilities = this.extractCapabilities(model);
                const isFree = this.isFreeModel(model);
                const inputPrice = model.pricing?.prompt
                    ? parseFloat(model.pricing.prompt) / 1_000_000
                    : null;
                const outputPrice = model.pricing?.completion
                    ? parseFloat(model.pricing.completion) / 1_000_000
                    : null;

                const existing = await this.database
                    .select({ id: orModels.id })
                    .from(orModels)
                    .where(eq(orModels.id, model.id))
                    .get();

                if (existing) {
                    await this.database
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
                    await this.database.insert(orModels).values({
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

            this.logger.info(`OR sync complete: ${added} added, ${updated} updated`);
            return { total: models.length, added, updated };

        } catch (error) {
            this.logger.error('OR sync failed:', error);
            return {
                total: 0, added: 0, updated: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // ─── Model Selection ───────────────────────────────────────────────────────

    async getModels(selectedOnly = false) {
        let query = this.database.select().from(orModels);
        if (selectedOnly) {
            query = query.where(eq(orModels.isSelected, true)) as typeof query;
        }
        const models = await query.orderBy(asc(orModels.provider), asc(orModels.name));

        // Group by provider
        const grouped: Record<string, typeof models> = {};
        for (const model of models) {
            if (!grouped[model.provider]) grouped[model.provider] = [];
            grouped[model.provider].push(model);
        }
        return { models, grouped, total: models.length };
    }

    async updateSelection(selectedIds: string[]): Promise<{ selectedCount: number }> {
        // Reset all
        await this.database.update(orModels).set({ isSelected: false });

        // Set selected
        for (const id of selectedIds) {
            await this.database
                .update(orModels)
                .set({ isSelected: true })
                .where(eq(orModels.id, id));
        }
        return { selectedCount: selectedIds.length };
    }
}
