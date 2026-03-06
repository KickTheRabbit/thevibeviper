/**
 * Routes for OpenRouter integration
 */
import { OpenRouterController } from '../controllers/openrouter/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupOpenRouterRoutes(app: Hono<AppEnv>): void {
    const router = new Hono<AppEnv>();

    // API Key management
    router.post('/save-key',        setAuthLevel(AuthConfig.authenticated), adaptController(OpenRouterController, OpenRouterController.saveKey));
    router.get('/key-status',       setAuthLevel(AuthConfig.authenticated), adaptController(OpenRouterController, OpenRouterController.getKeyStatus));

    // Model sync + retrieval
    router.post('/sync-models',     setAuthLevel(AuthConfig.authenticated), adaptController(OpenRouterController, OpenRouterController.syncModels));
    router.get('/models',           setAuthLevel(AuthConfig.authenticated), adaptController(OpenRouterController, OpenRouterController.getModels));

    // Model selection
    router.post('/models/selection',setAuthLevel(AuthConfig.authenticated), adaptController(OpenRouterController, OpenRouterController.updateSelection));

    app.route('/api/openrouter', router);
}
