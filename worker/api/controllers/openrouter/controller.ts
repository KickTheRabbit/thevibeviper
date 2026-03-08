/**
 * OpenRouter Controller
 * Handles: model sync, API key save/retrieve, model selection.
 * Follows BaseController + RouteContext pattern.
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { OpenRouterService } from '../../../database/services/OpenRouterService';
import { createLogger } from '../../../logger';

export class OpenRouterController extends BaseController {
    static logger = createLogger('OpenRouterController');

    /**
     * POST /api/openrouter/save-key
     * Body: { apiKey: string }
     */
    static async saveKey(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ preview: string }>>> {
        try {
            const user = context.user!;
            const body = await request.json() as { apiKey?: string };

            if (!body.apiKey?.trim()) {
                return OpenRouterController.createErrorResponse('apiKey is required', 400);
            }

            const service = new OpenRouterService(env);
            const result = await service.saveApiKey(user.id, body.apiKey);

            return OpenRouterController.createSuccessResponse({
                ...result,
                message: 'API key saved successfully',
            });
        } catch (error) {
            OpenRouterController.logger.error('saveKey error:', error);
            return OpenRouterController.createErrorResponse('Failed to save API key', 500);
        }
    }

    /**
     * GET /api/openrouter/key-status
     */
    static async getKeyStatus(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ configured: boolean; preview: string | null; updatedAt: Date | null }>>> {
        try {
            const user = context.user!;
            const service = new OpenRouterService(env);
            const result = await service.getKeyStatus(user.id);

            return OpenRouterController.createSuccessResponse({
                ...result,
                message: 'Key status retrieved',
            });
        } catch (error) {
            OpenRouterController.logger.error('getKeyStatus error:', error);
            return OpenRouterController.createErrorResponse('Failed to get key status', 500);
        }
    }

    /**
     * POST /api/openrouter/sync-models
     */
    static async syncModels(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ total: number; added: number; updated: number }>>> {
        try {
            const user = context.user!;
            const service = new OpenRouterService(env);
            const result = await service.syncModels(user.id);

            if (result.error) {
                return OpenRouterController.createErrorResponse(result.error, 400);
            }

            return OpenRouterController.createSuccessResponse({
                total: result.total,
                added: result.added,
                updated: result.updated,
                message: `Sync complete: ${result.added} added, ${result.updated} updated`,
            });
        } catch (error) {
            OpenRouterController.logger.error('syncModels error:', error);
            return OpenRouterController.createErrorResponse('Failed to sync models', 500);
        }
    }

    /**
     * GET /api/openrouter/models
     * Query: ?selectedOnly=true
     */
    static async getModels(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ models: unknown[]; grouped: Record<string, unknown[]>; total: number }>>> {
        try {
            const url = new URL(request.url);
            const selectedOnly = url.searchParams.get('selectedOnly') === 'true';

            const service = new OpenRouterService(env);
            const result = await service.getModels(selectedOnly);

            return OpenRouterController.createSuccessResponse({
                ...result,
                message: `${result.total} models retrieved`,
            });
        } catch (error) {
            OpenRouterController.logger.error('getModels error:', error);
            return OpenRouterController.createErrorResponse('Failed to get models', 500);
        }
    }

    /**
     * GET /api/openrouter/selected-models
     * Returns only models with isSelected = true, formatted for agent config dropdowns.
     */
    static async getSelectedModels(
        _request: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ models: unknown[]; total: number }>>> {
        try {
            const service = new OpenRouterService(env);
            const { models } = await service.getModels(true); // selectedOnly = true

            return OpenRouterController.createSuccessResponse({
                models: models.map(m => ({
                    id: m.id,
                    name: m.name,
                    provider: m.provider,
                    inputPrice: m.inputPrice,
                    outputPrice: m.outputPrice,
                    contextLength: m.contextLength,
                    isFree: m.isFree,
                })),
                total: models.length,
                message: `${models.length} selected models retrieved`,
            });
        } catch (error) {
            OpenRouterController.logger.error('getSelectedModels error:', error);
            return OpenRouterController.createErrorResponse('Failed to get selected models', 500);
        }
    }

    /**
     * POST /api/openrouter/models/selection
     * Body: { selectedIds: string[] }
     */
    static async updateSelection(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<{ selectedCount: number }>>> {
        try {
            const body = await request.json() as { selectedIds?: string[] };

            if (!Array.isArray(body.selectedIds)) {
                return OpenRouterController.createErrorResponse('selectedIds must be an array', 400);
            }

            const service = new OpenRouterService(env);
            const result = await service.updateSelection(body.selectedIds);

            return OpenRouterController.createSuccessResponse({
                ...result,
                message: `${result.selectedCount} models selected`,
            });
        } catch (error) {
            OpenRouterController.logger.error('updateSelection error:', error);
            return OpenRouterController.createErrorResponse('Failed to update selection', 500);
        }
    }
}
