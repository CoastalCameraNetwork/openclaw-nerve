/**
 * Model Routing Service
 *
 * Dynamic model routing based on task complexity, model availability, and cost.
 */

export interface ModelStatus {
  model: string;
  available: boolean;
  queueDepth: number;
  costPerToken: number;
  avgLatencyMs: number;
  lastUpdated: number;
}

export interface RoutingDecision {
  selectedModel: string;
  reason: 'cost' | 'availability' | 'complexity' | 'manual';
  alternatives: Array<{ model: string; cost: number; available: boolean }>;
}

// Model configurations
export const MODEL_CONFIGS: Record<string, { costPerToken: number; maxContext: number }> = {
  'glm-4.5': { costPerToken: 0.00011, maxContext: 256000 }, // $0.11/1M input
  'qwen3.5-plus': { costPerToken: 0.00035, maxContext: 256000 }, // $0.35/1M input
  'kimi-k2': { costPerToken: 0.00015, maxContext: 131072 }, // $0.15/1M input
};

const modelStatusCache = new Map<string, ModelStatus>();
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Get status for all models.
 */
export async function getAllModelStatuses(): Promise<ModelStatus[]> {
  const now = Date.now();

  // Return cached if still valid
  if (now - lastFetchTime < CACHE_TTL_MS && modelStatusCache.size > 0) {
    return Array.from(modelStatusCache.values());
  }

  try {
    // In production, this would call the gateway to check model availability
    // For now, we'll assume all configured models are available
    const statuses: ModelStatus[] = Object.entries(MODEL_CONFIGS).map(([model, config]) => ({
      model,
      available: true,
      queueDepth: 0,
      costPerToken: config.costPerToken,
      avgLatencyMs: 0,
      lastUpdated: now,
    }));

    // Update cache
    statuses.forEach((s) => modelStatusCache.set(s.model, s));
    lastFetchTime = now;

    return statuses;
  } catch (err) {
    console.error('[model-routing] Failed to fetch model status:', err);

    // Return cached status with unavailable flag
    const cachedStatuses: ModelStatus[] = Array.from(modelStatusCache.values()).map((s) => ({
      ...s,
      available: false,
    }));

    return cachedStatuses;
  }
}

/**
 * Analyze task complexity and return recommended complexity tier.
 */
export function analyzeComplexity(description: string): 'low' | 'medium' | 'high' {
  const text = description.toLowerCase();

  // High complexity indicators
  const highComplexityKeywords = [
    'architecture', 'design', 'refactor', 'migration', 'security',
    'optimize', 'performance', 'concurrent', 'distributed',
    'implement', 'create', 'build', 'develop',
  ];

  // Medium complexity indicators
  const mediumComplexityKeywords = [
    'update', 'modify', 'change', 'fix', 'debug',
    'add feature', 'enhance', 'improve',
  ];

  // Count matches
  const highCount = highComplexityKeywords.filter((k) => text.includes(k)).length;
  const mediumCount = mediumComplexityKeywords.filter((k) => text.includes(k)).length;

  if (highCount >= 2 || text.includes('security') || text.includes('architecture')) {
    return 'high';
  }
  if (mediumCount >= 2 || highCount >= 1) {
    return 'medium';
  }
  return 'low';
}

/**
 * Route a task to the best model based on complexity and availability.
 */
export async function routeTask(
  description: string,
  complexityOverride?: 'low' | 'medium' | 'high',
  manualModel?: string,
): Promise<RoutingDecision> {
  // Manual override takes precedence
  if (manualModel && MODEL_CONFIGS[manualModel]) {
    const statuses = await getAllModelStatuses();
    const available = statuses.find((s) => s.model === manualModel)?.available ?? false;

    return {
      selectedModel: manualModel,
      reason: 'manual',
      alternatives: statuses.map((s) => ({
        model: s.model,
        cost: s.costPerToken,
        available: s.available,
      })),
    };
  }

  const complexity = complexityOverride ?? analyzeComplexity(description);
  const statuses = await getAllModelStatuses();
  const availableModels = statuses.filter((s) => s.available);

  // Fallback if no models available
  if (availableModels.length === 0) {
    return {
      selectedModel: 'glm-4.5',
      reason: 'availability',
      alternatives: [],
    };
  }

  // Select model based on complexity
  let selectedModel: string;
  let reason: 'cost' | 'availability' | 'complexity' = 'complexity';

  switch (complexity) {
    case 'high':
      // High complexity: use most capable model (Qwen 3.5 Plus)
      if (availableModels.find((s) => s.model === 'qwen3.5-plus')) {
        selectedModel = 'qwen3.5-plus';
        reason = 'complexity';
      } else if (availableModels.find((s) => s.model === 'kimi-k2')) {
        selectedModel = 'kimi-k2';
        reason = 'availability';
      } else {
        selectedModel = 'glm-4.5';
        reason = 'availability';
      }
      break;
    case 'medium':
      // Medium complexity: balance cost and capability
      if (availableModels.find((s) => s.model === 'kimi-k2')) {
        selectedModel = 'kimi-k2';
        reason = 'cost';
      } else if (availableModels.find((s) => s.model === 'qwen3.5-plus')) {
        selectedModel = 'qwen3.5-plus';
        reason = 'availability';
      } else {
        selectedModel = 'glm-4.5';
        reason = 'availability';
      }
      break;
    case 'low':
      // Low complexity: use cheapest available model
      selectedModel = availableModels.reduce((cheapest, current) =>
        current.costPerToken < cheapest.costPerToken ? current : cheapest
      ).model;
      reason = 'cost';
      break;
  }

  return {
    selectedModel,
    reason,
    alternatives: statuses.map((s) => ({
      model: s.model,
      cost: s.costPerToken,
      available: s.available,
    })),
  };
}

/**
 * Clear the model status cache.
 */
export function clearModelStatusCache(): void {
  modelStatusCache.clear();
  lastFetchTime = 0;
}
