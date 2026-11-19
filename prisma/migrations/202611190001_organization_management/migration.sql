-- Module 3 organization schema, role grants and reference data.
BEGIN;

-- CreateEnum
CREATE TYPE "WorkLocationKind" AS ENUM ('OFFICE', 'REMOTE', 'HYBRID', 'CUSTOM');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "description" VARCHAR(1000),
    "parent_id" UUID,
    "head_id" UUID,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "department_id" UUID NOT NULL,
    "job_level" INTEGER NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_grades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "description" VARCHAR(1000),
    "rank" INTEGER NOT NULL,

    CONSTRAINT "job_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "kind" "WorkLocationKind" NOT NULL,
    "branch_id" UUID,
    "address" VARCHAR(500),

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "employee_number" VARCHAR(40) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "membership_id" UUID,
    "branch_id" UUID,
    "department_id" UUID,
    "designation_id" UUID,
    "job_grade_id" UUID,
    "employment_type_id" UUID,
    "work_location_id" UUID,
    "manager_id" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_id_key" ON "branches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "departments_tenant_id_parent_id_idx" ON "departments"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "departments_tenant_id_head_id_idx" ON "departments"("tenant_id", "head_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_id_head_id_key" ON "departments"("tenant_id", "id", "head_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_id_key" ON "departments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_code_key" ON "departments"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenant_id_department_id_id_key" ON "designations"("tenant_id", "department_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenant_id_id_key" ON "designations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenant_id_code_key" ON "designations"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "job_grades_tenant_id_rank_key" ON "job_grades"("tenant_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "job_grades_tenant_id_id_key" ON "job_grades"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "job_grades_tenant_id_code_key" ON "job_grades"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_tenant_id_id_key" ON "employment_types"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_tenant_id_code_key" ON "employment_types"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "work_locations_tenant_id_branch_id_idx" ON "work_locations"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_tenant_id_id_key" ON "work_locations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_tenant_id_code_key" ON "work_locations"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "employees_tenant_id_display_name_idx" ON "employees"("tenant_id", "display_name");

-- CreateIndex
CREATE INDEX "employees_tenant_id_branch_id_idx" ON "employees"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_manager_id_idx" ON "employees"("tenant_id", "manager_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_designation_id_idx" ON "employees"("tenant_id", "designation_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_job_grade_id_idx" ON "employees"("tenant_id", "job_grade_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_employment_type_id_idx" ON "employees"("tenant_id", "employment_type_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_work_location_id_idx" ON "employees"("tenant_id", "work_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_employee_number_key" ON "employees"("tenant_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_membership_id_key" ON "employees"("tenant_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_department_id_id_key" ON "employees"("tenant_id", "department_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_id_key" ON "employees"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_id_head_id_fkey" FOREIGN KEY ("tenant_id", "id", "head_id") REFERENCES "employees"("tenant_id", "department_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "job_grades" ADD CONSTRAINT "job_grades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employment_types" ADD CONSTRAINT "employment_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_department_id_fkey" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "departments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_department_id_designation_id_fkey" FOREIGN KEY ("tenant_id", "department_id", "designation_id") REFERENCES "designations"("tenant_id", "department_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_job_grade_id_fkey" FOREIGN KEY ("tenant_id", "job_grade_id") REFERENCES "job_grades"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_employment_type_id_fkey" FOREIGN KEY ("tenant_id", "employment_type_id") REFERENCES "employment_types"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_work_location_id_fkey" FOREIGN KEY ("tenant_id", "work_location_id") REFERENCES "work_locations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_manager_id_fkey" FOREIGN KEY ("tenant_id", "manager_id") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Additional database invariants and tenant policies not expressed in Prisma.
ALTER TABLE branches ADD CONSTRAINT branches_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');
ALTER TABLE departments ADD CONSTRAINT departments_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');
ALTER TABLE designations ADD CONSTRAINT designations_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');
ALTER TABLE job_grades ADD CONSTRAINT job_grades_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');
ALTER TABLE employment_types ADD CONSTRAINT employment_types_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');
ALTER TABLE work_locations ADD CONSTRAINT work_locations_code_format
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');

ALTER TABLE branches ADD CONSTRAINT branches_primary_active CHECK (NOT is_primary OR active);
CREATE UNIQUE INDEX branches_one_active_primary_per_tenant
  ON branches (tenant_id) WHERE active AND is_primary;
ALTER TABLE departments ADD CONSTRAINT departments_no_self_parent CHECK (parent_id <> id);
ALTER TABLE designations ADD CONSTRAINT designations_positive_job_level CHECK (job_level > 0);
ALTER TABLE job_grades ADD CONSTRAINT job_grades_positive_rank CHECK (rank > 0);
ALTER TABLE employees
  ADD CONSTRAINT employees_no_self_manager CHECK (manager_id <> id),
  ADD CONSTRAINT employees_designation_requires_department
    CHECK (designation_id IS NULL OR department_id IS NOT NULL),
  ADD CONSTRAINT employees_number_format
    CHECK (employee_number ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$');

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON branches TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON branches TO seyyon_app;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON departments TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON departments TO seyyon_app;

ALTER TABLE designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE designations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON designations TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON designations TO seyyon_app;

ALTER TABLE job_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_grades FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON job_grades TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON job_grades TO seyyon_app;

ALTER TABLE employment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_types FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employment_types TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON employment_types TO seyyon_app;

ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON work_locations TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON work_locations TO seyyon_app;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees TO seyyon_app
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON employees TO seyyon_app;

INSERT INTO permissions (id, key)
VALUES
  (gen_random_uuid(), 'organization.read'),
  (gen_random_uuid(), 'organization.manage'),
  (gen_random_uuid(), 'organization.reporting.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT roles.tenant_id, roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'Company Admin'
  AND permissions.key IN ('organization.read', 'organization.manage', 'organization.reporting.manage')
ON CONFLICT DO NOTHING;

-- Runs with caller privileges. Runtime calls must already hold the tenant context.
CREATE FUNCTION public.organization_seed_employment_types(tenant_key uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.employment_types (id, tenant_id, name, code, updated_at)
  SELECT gen_random_uuid(), tenant_key, defaults.name, defaults.code, now()
  FROM (VALUES
    ('Permanent', 'PERMANENT'),
    ('Contract', 'CONTRACT'),
    ('Temporary', 'TEMPORARY'),
    ('Intern', 'INTERN'),
    ('Part-time', 'PART_TIME'),
    ('Probation', 'PROBATION')
  ) AS defaults(name, code)
  ON CONFLICT (tenant_id, code) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.organization_seed_employment_types(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organization_seed_employment_types(uuid) TO seyyon_app;

SELECT public.organization_seed_employment_types(id) FROM tenants;

COMMIT;
