export interface LLMParams {
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export interface ToolPermission {
  tool_name: string;
  constraints: Record<string, unknown>;
}

export interface ChannelFormat {
  max_chars: number;
  no_markdown: boolean;
}

export interface EscalationTrigger {
  condition: string;
  action: string;
}

export interface EscalationRules {
  triggers: EscalationTrigger[];
  operator_ttl_seconds: number;
  ttl_fallback: string;
}

export interface ACRConfig {
  id: string;
  version: number;
  status: string;
  conversation_policy: Record<string, unknown>;
  escalation_rules: EscalationRules;
  tool_permissions: ToolPermission[];
  llm_params: LLMParams;
  channel_format_rules: Record<string, ChannelFormat>;
  activated_at: string;
}
