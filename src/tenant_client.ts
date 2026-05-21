// Thin client for Tenant's internal endpoints. Lets agent-runtime read
// the canonical per-tenant agent config from Tenant (Postgres-backed)
// instead of the hardcoded hospitalProfile fallback.

const TENANT_INTERNAL_URL =
  process.env['TENANT_INTERNAL_URL'] ?? 'http://tenant:8080';
const INTERNAL_API_KEY = process.env['INTERNAL_API_KEY'] ?? '';

export interface TenantActiveAgent {
  tenant_id: string;
  tenant_slug: string;
  profile_id: string;
  profile_name: string;
  config_id: string;
  version: number;
  data_source_id?: string;
  data_source_name?: string;
  data_source_base_url?: string;
  data_source_route_configs?: Record<string, { method: string; path: string }>;
  conversation_policy: Record<string, unknown>;
  escalation_rules: {
    triggers?: string[];
    operator_ttl_seconds?: number;
    ttl_fallback?: string;
  };
  tool_permissions: Array<{ tool_name: string; constraints: Record<string, unknown> }>;
  llm_params: {
    model: string;
    temperature: number;
    max_tokens: number;
    system_prompt: string;
  };
  channel_format_rules: Record<string, unknown>;
  allowed_specialties: string[];
  allowed_locations: string[];
}

/**
 * Fetch the active agent config for a tenant. Returns null on any error
 * (network, 404, 500, missing INTERNAL_API_KEY) so callers can fall back
 * to the hardcoded hospitalProfile.
 */
export async function fetchActiveAgent(tenantIdOrSlug: string): Promise<TenantActiveAgent | null> {
  if (!INTERNAL_API_KEY) {
    // Without the shared key the internal endpoint will 401 anyway.
    return null;
  }
  try {
    const url = `${TENANT_INTERNAL_URL.replace(/\/+$/, '')}/api/v1/internal/tenants/${encodeURIComponent(tenantIdOrSlug)}/profiles/active`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'X-Internal-Key': INTERNAL_API_KEY },
      // Short timeout — if Tenant is slow, fall back to hospitalProfile rather than hold the request.
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as TenantActiveAgent;
  } catch {
    return null;
  }
}
