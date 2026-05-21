import { Router } from 'express';
import type { Request, Response } from 'express';
import { getProfile } from '../registry.js';
import type { ACRConfig } from '../types/acr.js';
import { fetchActiveAgent } from '../tenant_client.js';

export const acrRouter = Router();

// GET /api/v1/tenants/:tenantId/profiles/:profileId/configs/active
// Called by conversation-chat's ACRClient.GetActiveConfig()
//
// First tries Tenant's `/internal/tenants/:id/profiles/active` (real
// Postgres-backed config). Falls back to the hardcoded hospitalProfile
// if Tenant is unreachable or the tenant has no active config.
acrRouter.get(
  '/api/v1/tenants/:tenantId/profiles/:profileId/configs/active',
  async (req: Request, res: Response) => {
    const tenantId = (req.params['tenantId'] as string | undefined) ?? '';
    const profileId = (req.params['profileId'] as string | undefined) ?? '';

    const live = await fetchActiveAgent(tenantId);
    if (live) {
      const triggers = Array.isArray(live.escalation_rules.triggers)
        ? live.escalation_rules.triggers.map((cond) => ({ condition: cond, action: 'escalate' }))
        : [];
      const config: ACRConfig = {
        id: live.config_id,
        version: live.version,
        status: 'active',
        ...(live.data_source_id ? { data_source_id: live.data_source_id } : {}),
        conversation_policy: live.conversation_policy ?? {},
        escalation_rules: {
          triggers,
          operator_ttl_seconds: live.escalation_rules.operator_ttl_seconds ?? 900,
          ttl_fallback: live.escalation_rules.ttl_fallback ?? 'queue',
        },
        tool_permissions: live.tool_permissions ?? [],
        llm_params: live.llm_params,
        channel_format_rules: (live.channel_format_rules ?? {}) as Record<string, never>,
        activated_at: new Date().toISOString(),
      };
      res.json(config);
      return;
    }

    // Fallback: hardcoded profile (legacy behaviour) when Tenant lookup fails.
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
