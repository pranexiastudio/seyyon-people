# SEYYON PEOPLE — Testing Strategy & Verification Guide
**Product:** Seyyon People | **Company:** Pranexia Studio

---

## 1. Testing Philosophy

Seyyon People employs a multi-layered testing pyramid to guarantee tenant isolation, role authorization, and data integrity:

```
          /  Critical E2E Workflows (Playwright) \
         /----------------------------------------\
        /  API & Multi-Tenant Integration (Supertest) \
       /-----------------------------------------------\
      /   Unit Tests: Services, Reducers, Calculators     \
     /-----------------------------------------------------\
    /   Compile-Time Checks: TypeScript Strict + Zod Schemas \
```

---

## 2. Multi-Tenant Isolation Testing Suite

The primary vulnerability in multi-tenant SaaS platforms is cross-tenant data leakage (IDOR).
Seyyon People incorporates dedicated automated tenant boundary tests verifying:
1. **Employee Isolation:** Tenant B cannot fetch, search, or mutate employees belonging to Tenant A.
2. **Attendance Punch Leakage:** Biometric records submitted for Tenant A are rejected or quarantined if presented by Tenant B.
3. **Payroll & Salary Confidentiality:** Tenant B's Admin or HR cannot query Tenant A's salary registers or payslip files under any circumstance.
4. **Chat & Real-Time Isolation:** WebSocket message emissions in Tenant A's department channel are never broadcast to Tenant B's sockets.
5. **Report Exports:** Export filters automatically enforce `tenantId` containment.

---

## 3. Test Execution Commands

```bash
# Run all workspace unit and integration tests
npm run test

# Run backend tests only
npm run test --workspace=@seyyon/api

# Run backend tests with coverage report
npm run test:cov --workspace=@seyyon/api

# Run frontend type checks and tests
npm run build --workspace=@seyyon/web
```
