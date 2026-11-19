ALTER TABLE tenants
  ADD COLUMN legal_name varchar(200),
  ADD COLUMN company_email varchar(320),
  ADD COLUMN contact_number varchar(40),
  ADD COLUMN industry varchar(120),
  ADD COLUMN company_size varchar(20),
  ADD COLUMN website varchar(2048),
  ADD COLUMN address varchar(500),
  ADD COLUMN country varchar(120),
  ADD COLUMN state varchar(120),
  ADD COLUMN city varchar(120),
  ADD COLUMN postal_code varchar(24),
  ADD COLUMN logo text,
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}',
  ADD CONSTRAINT tenant_name_present CHECK (btrim(name) <> ''),
  ADD CONSTRAINT tenant_email_normalized CHECK (company_email = lower(btrim(company_email)) AND company_email LIKE '%_@_%'),
  ADD CONSTRAINT tenant_size_valid CHECK (company_size IN ('1-10', '11-50', '51-200', '201-500', '501-1000', '1001+')),
  ADD CONSTRAINT tenant_settings_object CHECK (jsonb_typeof(settings) = 'object'),
  ADD CONSTRAINT tenant_logo_type CHECK (logo ~ '^data:image/(png|jpeg|webp);base64,' AND length(logo) <= 700000);
CREATE UNIQUE INDEX tenants_company_email_key ON tenants (company_email);

-- The runtime role still cannot read the registry without its tenant policy.
-- These entry points independently validate an active platform session.
CREATE FUNCTION public.module2_platform_session(session_key uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_sessions s
    JOIN public.platform_admins p ON p.user_id = s.user_id
    JOIN public.users u ON u.id = s.user_id
    WHERE s.id = session_key AND s.platform AND s.revoked_at IS NULL
      AND s.expires_at > now() AND NOT u.disabled
  )
$$;

CREATE FUNCTION public.module2_registry(session_key uuid)
RETURNS TABLE(id uuid, name varchar, slug varchar, company_email varchar, status public."TenantStatus", created_at timestamptz, member_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  RETURN QUERY SELECT t.id, t.name, t.slug, t.company_email, t.status, t.created_at,
    (SELECT count(*) FROM public.memberships m WHERE m.tenant_id = t.id)
    FROM public.tenants t;
END
$$;

CREATE FUNCTION public.module2_create_tenant(session_key uuid, tenant_key uuid, company_name text, company_slug text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.tenants (id, name, slug, updated_at) VALUES (tenant_key, company_name, company_slug, now());
END
$$;

CREATE FUNCTION public.module2_set_tenant_status(session_key uuid, tenant_key uuid, next_status public."TenantStatus")
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  UPDATE public.tenants SET status = next_status, updated_at = now() WHERE id = tenant_key;
END
$$;

CREATE FUNCTION public.module2_create_account(session_key uuid, account_key uuid, account_email text, initial_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.users (id, email, password_hash) VALUES (account_key, account_email, initial_hash);
END
$$;

CREATE FUNCTION public.module2_can_edit_tenant(tenant_key uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.module2_platform_session(NULLIF(current_setting('app.admin_session_id', true), '')::uuid)
    OR EXISTS (
      SELECT 1 FROM public.auth_sessions s
      JOIN public.users u ON u.id = s.user_id
      JOIN public.tenants t ON t.id = s.tenant_id
      JOIN public.memberships m ON m.tenant_id = t.id AND m.user_id = u.id
      JOIN public.membership_roles mr ON mr.tenant_id = m.tenant_id AND mr.membership_id = m.id
      JOIN public.roles r ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
      WHERE s.id = NULLIF(current_setting('app.admin_session_id', true), '')::uuid
        AND s.tenant_id = tenant_key AND NOT s.platform AND s.revoked_at IS NULL
        AND s.expires_at > now() AND NOT u.disabled AND t.status = 'ACTIVE'
        AND m.status = 'ACTIVE' AND r.name = 'Company Admin'
    )
$$;

REVOKE ALL ON FUNCTION public.module2_platform_session(uuid), public.module2_registry(uuid),
  public.module2_create_tenant(uuid, uuid, text, text), public.module2_set_tenant_status(uuid, uuid, public."TenantStatus"),
  public.module2_create_account(uuid, uuid, text, text), public.module2_can_edit_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.module2_registry(uuid), public.module2_create_tenant(uuid, uuid, text, text),
  public.module2_set_tenant_status(uuid, uuid, public."TenantStatus"),
  public.module2_create_account(uuid, uuid, text, text), public.module2_can_edit_tenant(uuid) TO seyyon_app;

GRANT UPDATE (name, legal_name, company_email, contact_number, industry, company_size, website, address,
  country, state, city, postal_code, logo, settings, updated_at) ON tenants TO seyyon_app;
CREATE POLICY tenant_profile_update ON tenants FOR UPDATE TO seyyon_app
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND public.module2_can_edit_tenant(id))
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND public.module2_can_edit_tenant(id));

CREATE INDEX platform_audit_target_timeline_idx ON platform_audit_logs (target_id, created_at DESC);

