import { Router } from 'express';
import type { Request, Response } from 'express';
import { hospitalProfile } from '../agents/hospital.js';
import type { TenantDetail, ProfileDetail, DataSource } from '../types/tenant.js';

export const tenantStubRouter = Router();

const HOSPITAL_MOCK_URL = process.env['HOSPITAL_MOCK_URL'] ?? 'http://hospital-mock:8080';

// GET /api/v1/tenants/:tenantId
// Called by conversation-chat's TenantClient.GetTenant()
tenantStubRouter.get('/api/v1/tenants/:tenantId', (req: Request, res: Response) => {
  const tenantId = (req.params['tenantId'] as string | undefined) ?? 'unknown';
  const tenant: TenantDetail = {
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
tenantStubRouter.get('/api/v1/tenants/:tenantId/profiles', (_req: Request, res: Response) => {
  const profiles: ProfileDetail[] = [
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
tenantStubRouter.get('/api/v1/tenants/:tenantId/data-sources', (_req: Request, res: Response) => {
  const ds: DataSource = {
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
