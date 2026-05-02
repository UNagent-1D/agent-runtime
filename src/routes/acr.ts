import { Router } from 'express';
import type { Request, Response } from 'express';
import { getProfile } from '../registry.js';
import type { ACRConfig } from '../types/acr.js';

export const acrRouter = Router();

// GET /api/v1/tenants/:tenantId/profiles/:profileId/configs/active
// Called by conversation-chat's ACRClient.GetActiveConfig()
acrRouter.get(
  '/api/v1/tenants/:tenantId/profiles/:profileId/configs/active',
  (req: Request, res: Response) => {
    const profileId = (req.params['profileId'] as string | undefined) ?? '';
    const profile = getProfile(profileId);

    // profile.modelConfig.model is already populated from OPENAI_DEFAULT_MODEL at
    // module load (see agents/hospital.ts), so the env var is the single source
    // of truth — no inline override needed here.
    const model = profile.modelConfig.model;

    const config: ACRConfig = {
      id: `cfg-${profile.id}-001`,
      version: 1,
      status: 'active',
      conversation_policy: {},
      escalation_rules: {
        triggers: [],
        operator_ttl_seconds: profile.escalation.operatorTtlSeconds,
        ttl_fallback: profile.escalation.ttlFallback,
      },
      tool_permissions: profile.tools.map((t) => ({
        tool_name: t.name,
        constraints: {},
      })),
      llm_params: {
        model,
        temperature: profile.modelConfig.temperature,
        max_tokens: profile.modelConfig.maxTokens,
        system_prompt: profile.systemPrompt,
      },
      channel_format_rules: {},
      activated_at: new Date().toISOString(),
    };

    res.json(config);
  },
);
