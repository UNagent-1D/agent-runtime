import type { AgentProfile } from './types/agent.js';
import { hospitalProfile } from './agents/hospital.js';

const profiles = new Map<string, AgentProfile>([
  [hospitalProfile.id, hospitalProfile],
]);

export function getProfile(_id: string): AgentProfile {
  // For now, all requests resolve to the hospital mock agent regardless of the requested id.
  // When a real ACR is wired in, replace this with profiles.get(id) lookup + fallback.
  return hospitalProfile;
}

export function listProfiles(): AgentProfile[] {
  return Array.from(profiles.values());
}
