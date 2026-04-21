import { hospitalProfile } from './agents/hospital.js';
const profiles = new Map([
    [hospitalProfile.id, hospitalProfile],
]);
export function getProfile(_id) {
    // For now, all requests resolve to the hospital mock agent regardless of the requested id.
    // When a real ACR is wired in, replace this with profiles.get(id) lookup + fallback.
    return hospitalProfile;
}
export function listProfiles() {
    return Array.from(profiles.values());
}
//# sourceMappingURL=registry.js.map