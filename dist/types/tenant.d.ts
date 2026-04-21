export interface TenantDetail {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
}
export interface ProfileDetail {
    id: string;
    name: string;
    allowed_specialties: string[];
    allowed_locations: string[];
    agent_config_id: string | null;
}
export interface RouteConfigDTO {
    method: string;
    path: string;
}
export interface DataSource {
    id: string;
    name: string;
    source_type: string;
    base_url: string;
    route_configs: Record<string, RouteConfigDTO>;
    is_active: boolean;
}
//# sourceMappingURL=tenant.d.ts.map