import React, { useState } from 'react';
import {
  Smartphone,
  Trash2,
  Key,
  Lock,
  Settings,
  Copy,
  Check,
  Eye,
  EyeOff,
  Link,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
} from 'lucide-react';
import { ModelConfigTabs } from '@/components/model-config-tabs';
import type {
  ModelConfigsData,
  ModelConfigUpdate,
  ActiveSessionsData,
  ApiKeysData,
} from '@/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';

// ─── Types for OpenRouter ──────────────────────────────────────────────────

interface OrModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
  input_price: number;
  output_price: number;
  capabilities: string;
  is_selected: boolean;
  is_free: boolean;
}

// ─── OpenRouter Section Component ─────────────────────────────────────────

function OpenRouterSection() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [keyStatus, setKeyStatus] = useState<'unknown' | 'saved' | 'missing'>('unknown');
  const [savingKey, setSavingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [modelSelectionOpen, setModelSelectionOpen] = useState(false);
  const [models, setModels] = useState<OrModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [syncingModels, setSyncingModels] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [localSelection, setLocalSelection] = useState<Record<string, boolean>>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  // Load key status on mount
  React.useEffect(() => {
    apiClient.getOpenRouterKeyStatus()
      .then((res) => {
        if (res.success && res.data) {
          setKeyStatus(res.data.hasKey ? 'saved' : 'missing');
          if (res.data.keyPreview) setApiKeyMasked(res.data.keyPreview);
        }
      })
      .catch(() => setKeyStatus('missing'));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim() || savingKey) return;
    setSavingKey(true);
    try {
      const res = await apiClient.saveOpenRouterKey(apiKey.trim());
      if (res.success) {
        toast.success('OpenRouter API key saved');
        setKeyStatus('saved');
        setApiKeyMasked(apiKey.trim().slice(0, 8) + '••••••••••••••••');
        setApiKey('');
      }
    } catch {
      toast.error('Failed to save API key');
    } finally {
      setSavingKey(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const res = await apiClient.getOpenRouterModels();
      if (res.success && res.data?.models) {
        const modelList = res.data.models;
        setModels(modelList);
        const sel: Record<string, boolean> = {};
        modelList.forEach((m: OrModel) => { sel[m.id] = m.is_selected; });
        setLocalSelection(sel);
        // Auto-expand all providers
        const providers = [...new Set(modelList.map((m: OrModel) => m.provider))];
        const exp: Record<string, boolean> = {};
        providers.forEach((p) => { exp[p as string] = true; });
        setExpandedProviders(exp);
      }
    } catch {
      toast.error('Failed to load models');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleOpenModelSelection = () => {
    setModelSelectionOpen(true);
    loadModels();
  };

  const handleSyncModels = async () => {
    setSyncingModels(true);
    try {
      const res = await apiClient.syncOpenRouterModels();
      if (res.success) {
        toast.success(`Synced ${res.data?.count ?? '?'} models from OpenRouter`);
        await loadModels();
      }
    } catch {
      toast.error('Failed to sync models. Is your API key saved?');
    } finally {
      setSyncingModels(false);
    }
  };

  const handleSaveSelection = async () => {
    setSavingSelection(true);
    try {
      const selectedIds = Object.entries(localSelection)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const res = await apiClient.saveOpenRouterSelection(selectedIds);
      if (res.success) {
        toast.success(`${selectedIds.length} models activated`);
        setModelSelectionOpen(false);
      }
    } catch {
      toast.error('Failed to save selection');
    } finally {
      setSavingSelection(false);
    }
  };

  const toggleModel = (id: string) => {
    setLocalSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const selectAllInProvider = (provider: string, select: boolean) => {
    const updates: Record<string, boolean> = {};
    models.filter((m) => m.provider === provider).forEach((m) => {
      updates[m.id] = select;
    });
    setLocalSelection((prev) => ({ ...prev, ...updates }));
  };

  // Group models by provider
  const groupedModels = React.useMemo(() => {
    const groups: Record<string, OrModel[]> = {};
    models.forEach((m) => {
      if (!groups[m.provider]) groups[m.provider] = [];
      groups[m.provider].push(m);
    });
    return groups;
  }, [models]);

  const selectedCount = Object.values(localSelection).filter(Boolean).length;

  const formatPrice = (pricePerToken: number) => {
    const per1M = pricePerToken * 1_000_000;
    return per1M === 0 ? 'free' : `$${per1M.toFixed(2)}/1M`;
  };

  return (
    <>
      <Card id="openrouter-config">
        <CardHeader variant="minimal">
          <div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
            <Link className="h-5 w-5" />
            <div>
              <CardTitle>OpenRouter Configuration</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 mt-4 px-6">

          {/* API Key */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">OpenRouter API Key</h4>
                <p className="text-sm text-text-tertiary">
                  Stored encrypted. Never visible in plain text after saving.
                </p>
              </div>
              {keyStatus === 'saved' && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                  Key saved
                </Badge>
              )}
            </div>

            {keyStatus === 'saved' ? (
              <div className="flex items-center gap-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={showKey ? apiKey || apiKeyMasked : apiKeyMasked}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter new key to replace..."
                  className="font-mono text-sm"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveKey}
                  disabled={!apiKey.trim() || savingKey}
                >
                  {savingKey ? <Settings className="h-4 w-4 animate-spin" /> : 'Replace'}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="font-mono text-sm"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveKey}
                  disabled={!apiKey.trim() || savingKey}
                  className="gap-2 shrink-0"
                >
                  {savingKey ? <Settings className="h-4 w-4 animate-spin" /> : <><Key className="h-4 w-4" /> Save</>}
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Model Selection */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-sm">Model Selection</h4>
              <p className="text-sm text-text-tertiary">
                Choose which OpenRouter models appear in agent dropdowns.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenModelSelection}
              className="gap-2 shrink-0"
            >
              <Settings className="h-4 w-4" />
              Select Models
            </Button>
          </div>

        </CardContent>
      </Card>

      {/* Model Selection Dialog */}
      <Dialog open={modelSelectionOpen} onOpenChange={setModelSelectionOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>OpenRouter Model Selection</DialogTitle>
            <DialogDescription>
              Check the models you want available in agent dropdowns.
              {selectedCount > 0 && (
                <span className="ml-2 font-medium text-text-primary">
                  {selectedCount} selected
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2 border-b">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncModels}
              disabled={syncingModels}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncingModels ? 'animate-spin' : ''}`} />
              {syncingModels ? 'Syncing...' : 'Sync from OpenRouter'}
            </Button>
            <span className="text-xs text-text-tertiary">
              {models.length > 0 ? `${models.length} models loaded` : 'No models yet — sync first'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {loadingModels ? (
              <div className="flex items-center justify-center py-12 gap-3 text-text-tertiary">
                <Settings className="h-5 w-5 animate-spin" />
                <span>Loading models...</span>
              </div>
            ) : models.length === 0 ? (
              <div className="text-center py-12 text-text-tertiary text-sm">
                No models found. Click "Sync from OpenRouter" to fetch the latest list.
              </div>
            ) : (
              Object.entries(groupedModels).sort(([a], [b]) => a.localeCompare(b)).map(([provider, providerModels]) => {
                const allSelected = providerModels.every((m) => localSelection[m.id]);
                const someSelected = providerModels.some((m) => localSelection[m.id]);
                const isExpanded = expandedProviders[provider] ?? true;
                const selectedInGroup = providerModels.filter((m) => localSelection[m.id]).length;

                return (
                  <div key={provider} className="border rounded-lg overflow-hidden">
                    {/* Provider Header */}
                    <div
                      className="flex items-center justify-between px-4 py-2.5 bg-bg-2 cursor-pointer hover:bg-bg-3 transition-colors"
                      onClick={() => toggleProvider(provider)}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectAllInProvider(provider, !allSelected);
                          }}
                        >
                          {allSelected ? (
                            <CheckSquare className="h-4 w-4 text-text-primary" />
                          ) : someSelected ? (
                            <CheckSquare className="h-4 w-4 text-text-tertiary" />
                          ) : (
                            <Square className="h-4 w-4 text-text-tertiary" />
                          )}
                        </button>
                        <span className="font-medium text-sm capitalize">{provider}</span>
                        <Badge variant="secondary" className="text-xs">
                          {selectedInGroup}/{providerModels.length}
                        </Badge>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-text-tertiary" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-tertiary" />
                      )}
                    </div>

                    {/* Models */}
                    {isExpanded && (
                      <div className="divide-y">
                        {providerModels.map((model) => (
                          <div
                            key={model.id}
                            className="flex items-center justify-between px-4 py-2 hover:bg-bg-2/50 cursor-pointer transition-colors"
                            onClick={() => toggleModel(model.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0">
                                {localSelection[model.id] ? (
                                  <CheckSquare className="h-4 w-4 text-text-primary" />
                                ) : (
                                  <Square className="h-4 w-4 text-text-tertiary" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{model.name}</p>
                                <p className="text-xs text-text-tertiary font-mono truncate">{model.id}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-4 text-xs text-text-tertiary">
                              {model.is_free ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 text-xs">free</Badge>
                              ) : (
                                <>
                                  <span title="Input price">{formatPrice(model.input_price)} in</span>
                                  <span title="Output price">{formatPrice(model.output_price)} out</span>
                                </>
                              )}
                              {model.context_length > 0 && (
                                <span>{(model.context_length / 1000).toFixed(0)}k ctx</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setModelSelectionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSelection}
              disabled={savingSelection || models.length === 0}
              className="gap-2"
            >
              {savingSelection ? (
                <Settings className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save Selection ({selectedCount} models)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();

  // Active sessions state
  const [activeSessions, setActiveSessions] = useState<
    ActiveSessionsData & { loading: boolean }
  >({ sessions: [], loading: true });

  // SDK API keys state
  const [apiKeys, setApiKeys] = useState<ApiKeysData & { loading: boolean }>({
    keys: [],
    loading: true,
  });
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    keyPreview: string;
    name: string;
  } | null>(null);
  const [showCreatedKey, setShowCreatedKey] = useState(true);
  const [keyToRevoke, setKeyToRevoke] = useState<
    ApiKeysData['keys'][number] | null
  >(null);
  const [revokingKey, setRevokingKey] = useState(false);
  const {
    copied: copiedCreatedKey,
    copy: copyCreatedKey,
    reset: resetCreatedKeyCopy,
  } = useCopyToClipboard();

  // Model configurations state
  const [agentConfigs, setAgentConfigs] = useState<
    Array<{ key: string; name: string; description: string }>
  >([]);
  const [modelConfigs, setModelConfigs] = useState<
    ModelConfigsData['configs']
  >({} as ModelConfigsData['configs']);
  const [defaultConfigs, setDefaultConfigs] = useState<
    ModelConfigsData['defaults']
  >({} as ModelConfigsData['defaults']);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [testingConfig, setTestingConfig] = useState<string | null>(null);

  const formatAgentConfigName = React.useCallback((key: string) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }, []);

  const getAgentConfigDescription = React.useCallback(
    (key: string) => {
      const descriptions: Record<string, string> = {
        templateSelection: 'Quick template selection - Needs to be extremely fast with low latency. Intelligence level is less important than speed for rapid project bootstrapping.',
        blueprint: 'Project architecture & UI design - Requires strong design thinking, UI/UX understanding, and architectural planning skills. Speed is important but coding ability is not critical.',
        projectSetup: 'Technical scaffolding setup - Must excel at following technical instructions precisely and setting up proper project structure. Reliability and instruction-following are key.',
        phaseGeneration: 'Development phase planning - Needs rapid planning abilities with large context windows for understanding project scope. Quick thinking is essential, coding skills are not required.',
        firstPhaseImplementation: 'Initial development phase - Requires large context windows and excellent coding skills for implementing the foundation. Deep thinking is less critical than execution.',
        phaseImplementation: 'Subsequent development phases - Needs large context windows and superior coding abilities for complex feature implementation. Focus is on execution rather than reasoning.',
        realtimeCodeFixer: 'Real-time bug detection - Must be extremely fast at identifying and fixing code issues with strong debugging skills. Large context windows are not needed, speed is crucial.',
        fastCodeFixer: 'Ultra-fast code fixes - Optimized for maximum speed with decent coding ability. No deep thinking or large context required, pure speed and basic bug fixing.',
        conversationalResponse: 'User chat interactions - Handles natural conversation flow and user communication. Balanced capabilities for engaging dialogue and helpful responses.',
        userSuggestionProcessor: 'User feedback processing - Analyzes and implements user suggestions and feedback. Requires understanding user intent and translating to actionable changes.',
        codeReview: 'Code quality analysis - Needs large context windows, strong analytical thinking, and good speed for thorough code review. Must identify issues and suggest improvements.',
        fileRegeneration: 'File recreation - Focused on pure coding ability to regenerate or rewrite files. No context window or deep thinking required, just excellent code generation.',
        screenshotAnalysis: 'UI/design analysis - Analyzes visual designs and screenshots to understand UI requirements. Requires visual understanding and design interpretation skills.',
      };
      return descriptions[key] || `AI model configuration for ${formatAgentConfigName(key)}`;
    },
    [formatAgentConfigName],
  );

  const loadModelConfigs = async () => {
    try {
      setLoadingConfigs(true);
      const response = await apiClient.getModelConfigs();
      if (response.success && response.data) {
        setModelConfigs(response.data.configs || {});
        setDefaultConfigs(response.data.defaults || {});
      } else {
        throw new Error(response.error?.message || 'Failed to load model configurations');
      }
    } catch (error) {
      console.error('Error loading model configurations:', error);
      toast.error('Failed to load model configurations');
    } finally {
      setLoadingConfigs(false);
    }
  };

  const saveModelConfig = async (agentAction: string, config: ModelConfigUpdate) => {
    try {
      const response = await apiClient.updateModelConfig(agentAction, config);
      if (response.success) {
        toast.success('Configuration saved successfully');
        await loadModelConfigs();
      }
    } catch (error) {
      console.error('Error saving model configuration:', error);
      toast.error('Failed to save configuration');
    }
  };

  const testModelConfig = async (agentAction: string, tempConfig?: ModelConfigUpdate) => {
    try {
      setTestingConfig(agentAction);
      const response = await apiClient.testModelConfig(agentAction, tempConfig);
      if (response.success && response.data) {
        const result = response.data.testResult;
        if (result.success) {
          toast.success(`Test successful! Model: ${result.modelUsed}, Response time: ${result.latencyMs}ms`);
        } else {
          toast.error(`Test failed: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error testing configuration:', error);
      toast.error('Failed to test configuration');
    } finally {
      setTestingConfig(null);
    }
  };

  const resetConfigToDefault = async (agentAction: string) => {
    try {
      await apiClient.resetModelConfig(agentAction);
      toast.success('Configuration reset to default');
      await loadModelConfigs();
    } catch (error) {
      console.error('Error resetting configuration:', error);
      toast.error('Failed to reset configuration');
    }
  };

  const resetAllConfigs = async () => {
    try {
      setSavingConfigs(true);
      const response = await apiClient.resetAllModelConfigs();
      toast.success(`${response.data?.resetCount} configurations reset to defaults`);
      await loadModelConfigs();
    } catch (error) {
      console.error('Error resetting all configurations:', error);
      toast.error('Failed to reset all configurations');
    } finally {
      setSavingConfigs(false);
    }
  };

  const handleDeleteAccount = async () => {
    toast.error('Account deletion is not yet implemented');
  };

  const loadActiveSessions = async () => {
    try {
      const response = await apiClient.getActiveSessions();
      setActiveSessions({
        sessions: response.data?.sessions || [
          {
            id: 'current',
            userAgent: navigator.userAgent,
            ipAddress: 'Current location',
            lastActivity: new Date(),
            createdAt: new Date(),
            isCurrent: true,
          },
        ],
        loading: false,
      });
    } catch (error) {
      console.error('Error loading active sessions:', error);
      setActiveSessions({
        sessions: [
          {
            id: 'current',
            userAgent: navigator.userAgent,
            ipAddress: 'Current location',
            lastActivity: new Date(),
            createdAt: new Date(),
            isCurrent: true,
          },
        ],
        loading: false,
      });
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.revokeSession(sessionId);
      toast.success('Session revoked successfully');
      loadActiveSessions();
    } catch (error) {
      console.error('Error revoking session:', error);
      toast.error('Failed to revoke session');
    }
  };

  const loadApiKeys = async () => {
    try {
      setApiKeys((prev) => ({ ...prev, loading: true }));
      const response = await apiClient.getApiKeys();
      setApiKeys({ keys: response.data?.keys ?? [], loading: false });
    } catch (error) {
      console.error('Error loading API keys:', error);
      setApiKeys({ keys: [], loading: false });
      toast.error('Failed to load API keys');
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim() || creatingKey) return;
    try {
      setCreatingKey(true);
      const response = await apiClient.createApiKey({ name: newKeyName.trim() });
      if (response.success && response.data) {
        setCreatedKey({
          key: response.data.key,
          keyPreview: response.data.keyPreview,
          name: response.data.name,
        });
        setShowCreatedKey(true);
        resetCreatedKeyCopy();
        toast.success('API key created');
        await loadApiKeys();
        setNewKeyName('');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!keyToRevoke || revokingKey) return;
    try {
      setRevokingKey(true);
      await apiClient.revokeApiKey(keyToRevoke.id);
      toast.success('API key revoked');
      setKeyToRevoke(null);
      await loadApiKeys();
    } catch (error) {
      console.error('Error revoking API key:', error);
      toast.error('Failed to revoke API key');
    } finally {
      setRevokingKey(false);
    }
  };

  React.useEffect(() => {
    apiClient
      .getModelDefaults()
      .then((response) => {
        if (response.success && response.data?.defaults) {
          const configs = Object.keys(response.data.defaults).map((key) => ({
            key,
            name: formatAgentConfigName(key),
            description: getAgentConfigDescription(key),
          }));
          setAgentConfigs(configs);
        }
      })
      .catch((error) => {
        console.error('Failed to load agent configurations:', error);
      });
  }, [formatAgentConfigName, getAgentConfigDescription]);

  React.useEffect(() => {
    if (user) {
      loadActiveSessions();
      loadModelConfigs();
      loadApiKeys();
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-bg-3 relative">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-8">
          {/* Page Header */}
          <div>
            <h1 className="text-4xl font-bold font-[departureMono] text-red-500">
              SETTINGS
            </h1>
            <p className="text-text-tertiary mt-2">
              Manage your account settings and preferences
            </p>
          </div>

          {/* Model Configuration Section */}
          <Card id="model-configs">
            <CardHeader variant="minimal">
              <div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
                {' '}
                <Settings className="h-5 w-5" />
                <div>
                  <CardTitle>AI Model Configurations</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 px-6">
              <div className="space-y-2 mt-6">
                <h4 className="font-medium">Provider API Keys</h4>
                <p className="text-sm text-text-tertiary">
                  AI provider API keys are managed in the "API Keys & Secrets" section below.
                  Configure your OpenAI, Anthropic, Google AI, and OpenRouter keys there.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const secretsSection = document.getElementById('api-keys');
                    if (secretsSection) {
                      secretsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                  className="gap-2 shrink-0"
                >
                  <Key className="h-4 w-4" />
                  API Keys
                </Button>
              </div>
              <Separator />
              <ModelConfigTabs
                agentConfigs={agentConfigs}
                modelConfigs={modelConfigs}
                defaultConfigs={defaultConfigs}
                loadingConfigs={loadingConfigs}
                onSaveConfig={saveModelConfig}
                onTestConfig={testModelConfig}
                onResetConfig={resetConfigToDefault}
                onResetAllConfigs={resetAllConfigs}
                testingConfig={testingConfig}
                savingConfigs={savingConfigs}
              />
            </CardContent>
          </Card>

          {/* ─── OpenRouter Configuration ─── */}
          <OpenRouterSection />

          {/* API Keys Section */}
          <Card id="api-keys">
            <CardHeader variant="minimal">
              <div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
                <Key className="h-5 w-5" />
                <div>
                  <CardTitle>API Keys</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 mt-4 px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-medium text-sm">VibeSDK API Keys</h4>
                  <p className="text-sm text-text-secondary">
                    Use these keys to authenticate external SDK clients. The full key is shown only once when created.
                  </p>
                </div>
                <Dialog
                  open={createKeyOpen}
                  onOpenChange={(open) => {
                    setCreateKeyOpen(open);
                    if (!open) {
                      setNewKeyName('');
                      setCreatedKey(null);
                      setShowCreatedKey(true);
                      resetCreatedKeyCopy();
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Key className="h-4 w-4" />
                      Create API Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {createdKey ? 'Your new API key' : 'Create API key'}
                      </DialogTitle>
                      <DialogDescription>
                        {createdKey
                          ? 'Copy this key now. You will not be able to see it again.'
                          : 'Give your key a memorable name. You can revoke it anytime.'}
                      </DialogDescription>
                    </DialogHeader>
                    {!createdKey ? (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Key name</p>
                          <Input
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="e.g. My production SDK"
                            autoFocus
                          />
                        </div>
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            <strong>Important:</strong> Treat this like a password. Anyone with this key can act as your VibeSDK account.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">API key</p>
                          <div className="relative">
                            <Input
                              type={showCreatedKey ? 'text' : 'password'}
                              value={createdKey.key}
                              readOnly
                              className="font-mono text-sm pr-20"
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setShowCreatedKey(!showCreatedKey)}
                              >
                                {showCreatedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => copyCreatedKey(createdKey.key)}
                              >
                                {copiedCreatedKey ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">SDK usage</p>
                          <code className="text-xs text-slate-600 dark:text-slate-400 block font-mono">
                            VIBESDK_API_KEY={createdKey.keyPreview}
                          </code>
                        </div>
                      </div>
                    )}
                    <DialogFooter>
                      {!createdKey ? (
                        <Button
                          onClick={handleCreateApiKey}
                          disabled={!newKeyName.trim() || creatingKey}
                          className="gap-2"
                        >
                          {creatingKey ? (
                            <>
                              <Settings className="h-4 w-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            'Create'
                          )}
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => setCreateKeyOpen(false)}>
                          Done
                        </Button>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {apiKeys.loading ? (
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 animate-spin text-text-tertiary" />
                  <span className="text-sm text-text-tertiary">Loading API keys...</span>
                </div>
              ) : apiKeys.keys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-bg-4 bg-bg-2/50 p-6">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-bg-3 flex items-center justify-center">
                      <Key className="h-5 w-5 text-text-tertiary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">No API keys yet</p>
                      <p className="text-sm text-text-tertiary">
                        Create an API key to use the VibeSDK SDK from your own apps.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <Table>
                    <TableCaption>Active keys for SDK usage</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Preview</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last used</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.keys.map((k) => (
                        <TableRow key={k.id}>
                          <TableCell className="font-medium">{k.name}</TableCell>
                          <TableCell className="font-mono text-xs text-text-secondary">{k.keyPreview}</TableCell>
                          <TableCell className="text-text-secondary">
                            {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell className="text-text-secondary">
                            {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            {k.isActive ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Revoked</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!k.isActive}
                              onClick={() => setKeyToRevoke(k)}
                              className="gap-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <AlertDialog open={!!keyToRevoke} onOpenChange={(open) => !open && setKeyToRevoke(null)}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will immediately disable the key{' '}
                          <span className="font-mono">{keyToRevoke?.keyPreview}</span>. Any SDK clients using it will stop working.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokingKey}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleRevokeApiKey}
                          disabled={revokingKey}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {revokingKey ? 'Revoking…' : 'Revoke key'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card id="security">
            <CardHeader variant="minimal">
              <div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
                <Lock className="h-5 w-5" />
                <div>
                  <CardTitle className="text-lg">Security</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 mt-2 px-6">
              <div className="space-y-2">
                <h4 className="font-medium">Connected Accounts</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full bg-bg-3 flex items-center justify-center">
                      {user?.provider === 'google' ? '🇬' : '🐙'}
                    </div>
                    <div>
                      <p className="text-sm font-medium capitalize">{user?.provider}</p>
                      <p className="text-sm text-text-tertiary">{user?.email}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Connected</Badge>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <h4 className="font-medium">Active Sessions</h4>
                {activeSessions.loading ? (
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 animate-spin text-text-tertiary" />
                    <span className="text-sm text-text-tertiary">Loading active sessions...</span>
                  </div>
                ) : (
                  activeSessions.sessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-text-tertiary" />
                        <div>
                          <p className="font-medium text-sm">
                            {session.isCurrent ? 'Current Session' : 'Other Session'}
                          </p>
                          <p className="text-sm text-text-tertiary">
                            {session.ipAddress} •{' '}
                            {new Date(session.lastActivity).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.isCurrent ? (
                          <div className="bg-green-400 size-3 rounded-full ring-green-200 ring-2 animate-pulse"></div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeSession(session.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4 p-3">
            <h4 className="font-medium text-destructive">Danger Zone</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">Delete Account</p>
                <p className="text-sm text-text-tertiary">
                  Permanently delete your account and all data
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
