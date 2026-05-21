import { Router } from 'express';
import type { Request, Response } from 'express';
import { hospitalProfile } from '../agents/hospital.js';
import type { TenantDetail, ProfileDetail, DataSource } from '../types/tenant.js';
import { fetchActiveAgent } from '../tenant_client.js';

export const tenantStubRouter = Router();

const HOSPITAL_MOCK_URL = process.env['HOSPITAL_MOCK_URL'] ?? 'http://hospital-mock:8080';
const EMAIL_SEND_URL = process.env['EMAIL_SEND_URL'] ?? 'http://email-send:8080';

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
//
// Tries to resolve per-tenant data sources live from Tenant's ACR endpoint
// (which now carries the active data_source's base_url + route_configs).
// Falls back to the hardcoded hospital + email stubs when Tenant is
// unreachable or the tenant has no provisioned data source — same behaviour
// as before the live lookup landed.
tenantStubRouter.get('/api/v1/tenants/:tenantId/data-sources', async (req: Request, res: Response) => {
  const tenantId = (req.params['tenantId'] as string | undefined) ?? '';

  const emailDs: DataSource = {
    id: 'email-datasource',
    name: 'UN-AGENT Email Service',
    source_type: 'rest',
    base_url: EMAIL_SEND_URL,
    route_configs: {
      send_confirmation_email: { method: 'POST', path: '/api/v1/emails' },
    },
    is_active: true,
  };

  if (tenantId) {
    const live = await fetchActiveAgent(tenantId);
    if (live && live.data_source_id && live.data_source_base_url && live.data_source_route_configs) {
      const liveDs: DataSource = {
        id: live.data_source_id,
        name: live.data_source_name ?? 'Hospital Mock API',
        source_type: 'rest',
        base_url: live.data_source_base_url,
        route_configs: live.data_source_route_configs,
        is_active: true,
      };
      res.json({ data: [liveDs, emailDs] });
      return;
    }
  }

  // Fallback: hardcoded route_configs. Mirrors the live row's contents so
  // conversation-chat's executeTool sees the same six operations whether or
  // not Tenant is reachable.
  const hospitalDs: DataSource = {
    id: 'hospital-datasource',
    name: 'Hospital Mock API',
    source_type: 'rest',
    base_url: HOSPITAL_MOCK_URL,
    route_configs: {
      list_doctors: { method: 'GET', path: '/doctors' },
      get_doctor_schedule: { method: 'GET', path: '/doctors/{doctor_id}/schedule' },
      book_appointment: { method: 'POST', path: '/appointments' },
      cancel_appointment: { method: 'POST', path: '/appointments/{appointment_id}/cancel' },
      reschedule_appointment: { method: 'POST', path: '/appointments/{appointment_id}/reschedule' },
      get_patient_appointments: { method: 'GET', path: '/patients/{patient_ref}/appointments' },
    },
    is_active: true,
  };

  res.json({ data: [hospitalDs, emailDs] });
});
