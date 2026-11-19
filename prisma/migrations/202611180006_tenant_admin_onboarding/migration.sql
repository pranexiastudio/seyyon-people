-- Existing accounts already have credentials. Only newly invited accounts
-- start without a configured password.
ALTER TABLE users ADD COLUMN password_configured boolean NOT NULL DEFAULT true;
GRANT UPDATE (password_configured) ON users TO seyyon_app;

DROP FUNCTION public.module2_create_tenant(uuid, uuid, text, text);
CREATE FUNCTION public.module2_create_tenant(session_key uuid, tenant_key uuid, company_name text, company_slug text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.tenants (id, name, slug, updated_at)
    VALUES (tenant_key, company_name, company_slug, now()) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END
$$;

DROP FUNCTION public.module2_create_account(uuid, uuid, text, text);
CREATE FUNCTION public.module2_create_account(session_key uuid, account_key uuid, account_email text, initial_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.module2_platform_session(session_key) THEN RAISE insufficient_privilege; END IF;
  INSERT INTO public.users (id, email, password_hash, password_configured)
    VALUES (account_key, account_email, initial_hash, false) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END
$$;

REVOKE ALL ON FUNCTION public.module2_create_tenant(uuid, uuid, text, text),
  public.module2_create_account(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.module2_create_tenant(uuid, uuid, text, text),
  public.module2_create_account(uuid, uuid, text, text), public.module2_platform_session(uuid) TO seyyon_app;

-- Some legacy tenants share display names and have no company profile email.
CREATE UNIQUE INDEX tenants_registered_name_key ON tenants (lower(btrim(name))) WHERE company_email IS NOT NULL;

