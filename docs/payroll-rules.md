# SEYYON PEOPLE — Payroll Architecture & Statutory Rules (India)
**Product:** Seyyon People | **Company:** Pranexia Studio

---

## 1. Traceable Payroll Processing Lifecycle

Seyyon People implements a stateful, auditable 6-stage monthly payroll processing workflow:

```
[1. DRAFT] ───► [2. ATTENDANCE LOCK] ───► [3. STATUTORY COMPUTE] ───► [4. HR REVIEW] ───► [5. APPROVAL] ───► [6. FINALIZED & PAID]
```

1. **Draft Initialization:** A new `PayrollCycle` is created for `(tenantId, month, year)`.
2. **Attendance & LOP (Loss of Pay) Inputs:** The cycle automatically counts unpaid leaves and unauthorized absent days to determine `payableDays = totalDaysInMonth - lossOfPayDays`.
3. **Statutory & Net Salary Calculation:** Prorated earnings and statutory deductions are calculated using decimal-safe arithmetic.
4. **Review & Reconciliation:** Discrepancy reports flag missing bank details, negative net pay, or variance > 10% from previous month.
5. **Approval:** Authorized HR Admin or Company Admin signs off on the payroll register.
6. **Finalization & Lock:** Payslips are generated, assigned immutable `payslipNumber` (e.g., `PAY-2026-10-0012`), and locked against retroactive tampering.

---

## 2. Indian Statutory Components & Configurable Formulas

> [!IMPORTANT]
> Statutory deductions must be configured per organization policy and jurisdiction. Seyyon People supports dynamic enabling/disabling of PF, ESI, PT, and TDS per employee structure.

### 2.1 Employees' Provident Fund (EPF / PF)
- **Eligibility:** Mandatory if Basic + DA <= ₹15,000/month; optional or capped for higher earnings.
- **Employee Contribution:** 12% of `(Basic + DA)`. Standard statutory wage ceiling cap is ₹1,800/month (12% of ₹15,000) or actual.
- **Employer Contribution:** 12% total:
  - 8.33% to EPS (Employees' Pension Scheme, capped at ₹1,250/month).
  - 3.67% to EPF difference.
  - Plus 0.50% EDLI and 0.50% EPF Admin charges.

### 2.2 Employees' State Insurance (ESI)
- **Eligibility Wage Ceiling:** Gross Monthly Salary <= ₹21,000 (₹25,000 for employees with disability).
- **Employee Contribution:** 0.75% of Gross Wages.
- **Employer Contribution:** 3.25% of Gross Wages.
- **Threshold Rule:** If gross wages exceed ₹21,000 in any month during a contribution period, the employee remains covered until the end of that statutory contribution period.

### 2.3 Professional Tax (PT)
- **Jurisdictional Slabs:** Configured according to the employee's work location state (e.g., Tamil Nadu, Maharashtra, Karnataka, Telangana).
- **Example Tamil Nadu Slab (Half-yearly adjusted):**
  - Up to ₹21,000 / half-year: Nil
  - ₹21,001 - ₹30,000: ₹100 / month
  - ₹30,001 - ₹45,000: ₹235 / month
  - ₹45,001 - ₹60,000: ₹510 / month
  - ₹60,001 - ₹75,000: ₹760 / month
  - Above ₹75,000: ₹1,025 / half-year (approx ₹208 / month)
- **Example Karnataka Slab:** ₹200 / month for gross salary >= ₹25,000.

### 2.4 Tax Deducted at Source (TDS / Income Tax)
- Calculated based on the employee's selected tax regime (New Regime u/s 115BAC default vs Old Regime with declarations under 80C, 80D, HRA exemption).
- Monthly deduction = `(Projected Annual Tax Payable - TDS already deducted) / Remaining Months in FY`.

---

## 3. Decimal Precision & Rounding Rules

1. All intermediate percentage multiplications use standard half-up rounding to 2 decimal places (`Math.round(val * 100) / 100`).
2. Final net pay is rounded to the nearest integer rupee (`Math.round(netPay)`).
3. Finalized records are immutable. Corrections require an explicit supplementary adjustment cycle or authorized reversal entry with an accompanying audit reason.
