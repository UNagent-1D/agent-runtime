import { Router } from 'express';
import { hospitalProfile } from '../agents/hospital.js';
export const tenantStubRouter = Router();
const HOSPITAL_MOCK_URL = process.env['HOSPITAL_MOCK_URL'] ?? 'http://hospital-mock:8080';
// GET /api/v1/tenants/:tenantId
// Called by conversation-chat's TenantClient.GetTenant()
tenantStubRouter.get('/api/v1/tenants/:tenantId', (req, res) => {
    const tenantId = req.params['tenantId'] ?? 'unknown';
    const tenant = {
        id: tenantId,
        name: 'Hospital Mock Tenant',
        slug: tenantId,
        plan: 'enterprise',
        status: 'active',
    };
    res.json(tenant);
});
// GET /api/v1/tenants/:tenantId/profiles
// Called by conversation-chat's TenantClient.GetProfile()
tenantStubRouter.get('/api/v1/tenants/:tenantId/profiles', (_req, res) => {
    const profiles = [
        {
            id: hospitalProfile.id,
            name: hospitalProfile.name,
            allowed_specialties: hospitalProfile.allowedSpecialties,
            allowed_locations: hospitalProfile.allowedLocations,
            agent_config_id: `cfg-${hospitalProfile.id}-001`,
        },
    ];
    res.json({ data: profiles });
});
// GET /api/v1/tenants/:tenantId/data-sources
// Called by conversation-chat's TenantClient.GetDataSources()
// Route configs map each tool name to a hospital-mock HTTP endpoint.
// conversation-chat's executeTool() substitutes {param} placeholders in the path and
// sends the remaining parameters as the JSON body for POST requests.
tenantStubRouter.get('/api/v1/tenants/:tenantId/data-sources', (_req, res) => {
    const ds = {
        id: 'hospital-datasource',
        name: 'Hospital Mock API',
        source_type: 'rest',
        base_url: HOSPITAL_MOCK_URL,
        route_configs: {
            list_doctors: { method: 'GET', path: '/doctors' },
            get_doctor_schedule: { method: 'GET', path: '/doctors/{doctor_id}/schedule' },
            book_appointment: { method: 'POST', path: '/appointments' },
            cancel_appointment: { method: 'POST', path: '/appointments/{appointment_id}/cancel' },
            get_patient_appointments: { method: 'GET', path: '/patients/{patient_ref}/appointments' },
        },
        is_active: true,
    };
    res.json({ data: [ds] });
});
//# sourceMappingURL=tenant-stub.js.map