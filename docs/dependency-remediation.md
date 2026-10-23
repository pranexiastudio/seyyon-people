# Dependency vulnerability remediation — 23 October 2026

The complete audit output was inspected before selecting changes. Only bcrypt 6
and Vite 6 major upgrades were explicitly approved in this session. React 18,
NestJS 10, Prisma 5, PostgreSQL, Swagger 7, and Tailwind 3 remain in place.
No database connection, schema changes, migration application, seeds, resets,
real SMTP sends, commits, or pushes were performed in this task.

## Verified audit results

| Scope | Total before → after | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- | --- |
| All dependencies | 36 → 14 | 1 → 0 | 11 → 0 | 20 → 14 | 4 → 0 |
| `--omit=dev` | 17 → 9 | 1 → 0 | 6 → 0 | 9 → 9 | 1 → 0 |

These are npm package findings, including propagation through dependent packages,
not counts of distinct vulnerabilities or proven exploitable application paths.
Production-only npm scope also includes frontend packages; it does not itself
prove a vulnerable path is reachable in a deployed application.

Complete reports:

- [Before: all](dependency-audit/before-all.json)
- [Before: production](dependency-audit/before-production.json)
- [After: all](dependency-audit/after-all.json)
- [After: production](dependency-audit/after-production.json)
- [Resolved tree and preservation checks](dependency-audit/resolved-tree-summary.json)

## Changes and dependency paths

| Package/path | Previous vulnerable version | Final version/action |
| --- | --- | --- |
| `bcrypt` | 5.1.1 | 6.0.0; explicitly approved major upgrade |
| `bcrypt → @mapbox/node-pre-gyp → tar` | node-pre-gyp 1.0.11, tar 6.2.1 | Entire installer chain removed; no tar or node-pre-gyp remains in the resolved lockfile |
| `@nestjs/platform-express → multer` | 2.0.2 | Scoped override to 2.5.0 |
| `@nestjs/platform-express → body-parser` | 1.20.4 | Scoped override to 1.20.9 |
| Other body-parser copy via Express 5 | 2.3.0 | 2.4.0 through the targeted body-parser update |
| `@nestjs/swagger → lodash` | 4.17.21 | Scoped override to 4.18.1; removes duplicate vulnerable copy |
| js-yaml 4.x, including Swagger | 4.1.0 | Same-major override to 4.3.2; leaves the separate 3.15.2 line intact |
| qs 6.x | 6.14.2 | Same-major override to 6.16.1 |
| Vite | 5.4.21 | 6.4.5; explicitly approved major upgrade |
| esbuild via Vite | 0.21.5 | 0.25.12, using Vite 6's supported dependency range |
| ajv 8.x | 8.12.0 | 8.20.0; leaves ajv 6.x intact |
| Angular devkit picomatch | 4.0.1 | Scoped override to 4.0.7 |
| Nest CLI glob | 10.4.5 | Scoped override to 10.5.0 |
| Nest CLI webpack | 5.97.1 | Scoped override to 5.104.1; deduplicates the existing separate 5.x copy |
| Nest CLI inquirer | 8.2.6 | Scoped override to 8.2.7 |
| Angular schematics CLI inquirer | 9.2.15 | Scoped override to 9.3.8 |
| Legacy external-editor/tmp chain | external-editor 3.1.0 / tmp 0.0.33 | Removed by supported same-major inquirer releases, which use @inquirer/external-editor |

The critical tar issue was in bcrypt's native-addon installer dependency path;
no application archive-extraction endpoint was identified. Bcrypt 6 uses a
different prebuilt-addon mechanism, rather than forcing tar 7 underneath a
consumer expecting tar 6. Its Node >=18 requirement is compatible with the
repository's documented Node 20+ baseline and the local Node 22 runtime.
See the [bcrypt 6 release](https://github.com/kelektiv/node.bcrypt.js/releases/tag/v6.0.0).

Nest 10.4.22 and Swagger 7.4.2 were already the latest versions within their
existing majors when checked against npm registry metadata. Their exact pins
prevent ordinary semver updates of several vulnerable children. Overrides are
therefore scoped by parent/version or child major, rather than replacing the
framework. They exceed some upstream exact child pins and must be re-reviewed
when updating those parents.

Vite 5 had no patched release for the reported server findings. The existing
@vitejs/plugin-react 4.7.0 explicitly supports Vite 6, so no React/plugin upgrade
was needed. Vite/esbuild server findings affect development/build infrastructure;
they are not automatically vulnerabilities in the generated static browser bundle.
Keep development and preview servers private and serve production static output
through production hosting. Restart existing development processes to load the
new dependencies; they are not replaced in an already-running process.

## Compatibility handling and verification

Patched Multer changed some error messages and introduced additional codes.
Nest 10's adapter matches messages and consequently turned an unexpected upload
field into HTTP 500 in the compatibility probe. The existing global exception
filter now maps recognized Multer error codes to safe HTTP 400/413 responses,
without echoing supplied field names or filenames. This is the only production
TypeScript behavior change made by this dependency task.

The regression test preserves the 400 expectation, exercises configured array
index limits, and checks successful multipart upload and 413 size rejection.
New Multer field-nesting/index limits are opt-in: future production upload routes
must explicitly configure appropriate resource limits. No production upload route
was added here.

Final verification:

- `npm ls --all --json`: successful, no missing/invalid dependency problems.
- All audit-targeted critical/high packages are absent or at fixed versions;
  their findings are absent from the final full and production audits.
- Backend: **20 suites, 154 tests passed**. Includes existing activation/security
  tests and new dependency compatibility tests.
- A synthetic hash generated with bcrypt 5.1.1 before upgrading verifies under
  bcrypt 6. Tests also cover `$2a$`/`$2b$`, wrong passwords, and new-hash verification.
  No actual account hashes or credentials were read or changed.
- Swagger generation runs against the existing application modules with Prisma
  and SMTP mocked, including the activation DTOs and employee routes.
- Real Nest HTTP parsing checks cover JSON, form bodies, and multipart handling.
- Backend production build passed.
- Frontend production build passed using Vite 6.4.5 with build escalation because
  the default filesystem sandbox prevents Vite configuration loading.
- Existing ts-jest transform and Vite bundle-size warnings remain.

Native prebuilt bcrypt operation was verified on this Windows/Node environment;
target deployment platforms still need their normal CI checks. Interactive Nest
generators, browser/HMR behavior, real PostgreSQL, and real SMTP were not exercised.

Npm initially retained stale nested installations despite overrides. Those
specific dependency directories were preserved in task-specific temporary
locations and re-resolved without discarding the lockfile or application work.
An intermediate tree was missing Multer; verification caught it and the parent
dependency was re-resolved. The final audit result is paired with a valid installed
tree, not merely manifest edits or missing-package audit results.

## Unresolved findings — approval needed for broader changes

All remaining findings are moderate:

1. Nest core injection advisory and its propagated flags across core, platform,
   WebSocket, Swagger, and testing packages. No patched Nest 10 release was
   available in the registry check. A coordinated framework upgrade needs separate
   approval and migration testing.
2. `file-type` 20.x via @nestjs/common. The audited fixes require a newer major
   (21.3.2 or later for the reported ranges); it was not forced beneath Nest 10.
3. React Router 6.30.6 / react-router-dom 6.30.6. The reported fixes require Router
   7.18+; this is not approved. This app uses BrowserRouter, not SSR, but the
   separate open-redirect finding remains and is not claimed fixed.
4. PostCSS selector parser through Tailwind 3/postcss-nested, propagated to
   tailwindcss-animate. Fixed parser range starts at 7.1.6; existing consumers
   expect major 6. No unapproved parser/Tailwind major override was applied.

These paths and advisory URLs are preserved in the after-audit JSON files.
Zero critical/high findings is not a clean audit or a complete public-exposure
security sign-off. No audit findings were suppressed.

## Files changed by this task

- `package.json`: scoped same-major overrides.
- `apps/api/package.json`: approved bcrypt 6 dependency; activation SMTP dependencies preserved.
- `apps/web/package.json`: approved Vite 6 dependency.
- `package-lock.json`: targeted resolution and dependency-chain removals.
- `apps/api/src/common/filters/http-exception.filter.ts`: Multer error-code compatibility.
- `apps/api/src/common/config/dependency-compatibility.spec.ts`: compatibility regression tests.
- `docs/dependency-remediation.md`: this report.
- `docs/dependency-audit/`: before/after full audits and resolved-tree summary.

Checksums confirmed **21 pre-existing uncommitted activation source, schema,
migration, test, and documentation files unchanged**. Package manifests and the
lockfile were intentionally edited while preserving activation dependencies.
The activation migration remains unapplied. No existing working changes were
discarded, committed, or pushed.
