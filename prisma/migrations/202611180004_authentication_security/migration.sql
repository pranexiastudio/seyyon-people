CREATE UNIQUE INDEX users_email_normalized_key ON users (lower(email));
CREATE UNIQUE INDEX users_employee_login_normalized_key ON users (lower(employee_login_id)) WHERE employee_login_id IS NOT NULL;
ALTER TABLE users ADD CONSTRAINT employee_login_format CHECK (employee_login_id IS NULL OR (employee_login_id <> '' AND employee_login_id NOT LIKE '%@%'));
ALTER TABLE auth_sessions ADD CONSTRAINT session_context_valid CHECK ((platform AND tenant_id IS NULL) OR (NOT platform AND tenant_id IS NOT NULL));
GRANT UPDATE (password_hash, disabled, login_failures, locked_until) ON users TO seyyon_app;
GRANT SELECT, INSERT, UPDATE ON auth_sessions, refresh_tokens, password_resets TO seyyon_app;
GRANT INSERT ON auth_events TO seyyon_app;

CREATE FUNCTION public.auth_memberships(actor uuid)
RETURNS TABLE(membership_id uuid, tenant_id uuid, company_name varchar)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT membership.id, membership.tenant_id, tenant.name
  FROM public.memberships AS membership
  JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
  JOIN public.users AS account ON account.id = membership.user_id
  WHERE membership.user_id = actor AND membership.status = 'ACTIVE'
    AND tenant.status = 'ACTIVE' AND NOT account.disabled
  ORDER BY tenant.name, membership.id
$function$;
REVOKE ALL ON FUNCTION public.auth_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_memberships(uuid) TO seyyon_app;

