BEGIN;

CREATE TYPE "EmploymentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'RESIGNED', 'TERMINATED');
CREATE TYPE "EmployeeChangeKind" AS ENUM ('STATUS', 'MANAGER');

ALTER TABLE employees
  ADD COLUMN first_name VARCHAR(100),
  ADD COLUMN last_name VARCHAR(100),
  ADD COLUMN work_email VARCHAR(320),
  ADD COLUMN personal_email VARCHAR(320),
  ADD COLUMN personal_phone VARCHAR(40),
  ADD COLUMN joined_on DATE,
  ADD COLUMN employment_status "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

UPDATE employees SET employment_status = 'INACTIVE' WHERE NOT active;

ALTER TABLE employees
  ADD CONSTRAINT employees_active_matches_status CHECK (active = (employment_status = 'ACTIVE')),
  ADD CONSTRAINT employees_positive_version CHECK (version > 0);

CREATE INDEX employees_tenant_status_name_id_idx ON employees (tenant_id, employment_status, display_name, id);

CREATE TABLE employee_changes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  kind "EmployeeChangeKind" NOT NULL,
  previous_status "EmploymentStatus",
  new_status "EmploymentStatus",
  previous_manager_id UUID,
  new_manager_id UUID,
  request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_changes_tenant_id_employee_id_fkey
    FOREIGN KEY (tenant_id, employee_id) REFERENCES employees (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT employee_changes_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT employee_changes_tenant_id_previous_manager_id_fkey
    FOREIGN KEY (tenant_id, previous_manager_id) REFERENCES employees (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT employee_changes_tenant_id_new_manager_id_fkey
    FOREIGN KEY (tenant_id, new_manager_id) REFERENCES employees (tenant_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT employee_changes_kind_payload CHECK (
    (kind = 'STATUS'
      AND previous_status IS NOT NULL AND new_status IS NOT NULL AND previous_status <> new_status
      AND previous_manager_id IS NULL AND new_manager_id IS NULL)
    OR
    (kind = 'MANAGER'
      AND previous_status IS NULL AND new_status IS NULL
      AND previous_manager_id IS DISTINCT FROM new_manager_id)
  )
);

CREATE INDEX employee_changes_tenant_employee_time_idx ON employee_changes (tenant_id, employee_id, created_at, id);

ALTER TABLE employee_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employee_changes TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON employee_changes TO seyyon_app;

INSERT INTO permissions (id, key)
VALUES
  (gen_random_uuid(), 'employees.read'),
  (gen_random_uuid(), 'employees.manage'),
  (gen_random_uuid(), 'employees.reporting.manage'),
  (gen_random_uuid(), 'employees.private.read'),
  (gen_random_uuid(), 'employees.private.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT roles.tenant_id, roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'Company Admin'
  AND permissions.key IN (
    'employees.read', 'employees.manage', 'employees.reporting.manage', 'employees.private.read', 'employees.private.manage'
  )
ON CONFLICT DO NOTHING;

COMMIT;
