export type ToolParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ToolParamProperty {
  type: ToolParamType;
  description: string;
  enum?: string[];
  items?: { type: ToolParamType };
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParamProperty>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ModelConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface EscalationConfig {
  enabled: boolean;
  operatorTtlSeconds: number;
  ttlFallback: 'bot_resume' | 'close';
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  locale: string;
  systemPrompt: string;
  modelConfig: ModelConfig;
  tools: ToolDefinition[];
  escalation: EscalationConfig;
  allowedSpecialties: string[];
  allowedLocations: string[];
}
