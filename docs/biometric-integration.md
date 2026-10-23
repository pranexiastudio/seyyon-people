# SEYYON PEOPLE — Biometric Attendance Integration Architecture
**Product:** Seyyon People | **Company:** Pranexia Studio

---

## 1. Architectural Philosophy

Seyyon People adopts a **Vendor-Agnostic Event Ingestion Model** for physical biometric devices (fingerprint scanners, RFID card readers, facial recognition terminals).
- The HRMS **never** stores biometric templates, raw fingerprints, or facial meshes in the cloud database to maintain privacy compliance.
- Biometric devices independently capture punches, verify identity on-device, and produce verified punch events.
- Seyyon People consumes these punch events through standardized adapters.

```
┌───────────────────────────┐         ┌───────────────────────────┐
│ On-Premises Hardware      │         │ Cloud Ingestion Adapters  │
│ (ZKTeco, eSSL, Matrix,    │         │ (Seyyon People Backend)   │
│  Hikvision, Suprema)      │         │                           │
│                           │         │                           │
│  [Fingerprint / RFID /    │         │  ┌─────────────────────┐  │
│       Face Terminal]      │         │  │ HTTP Webhook Gateway│  │
│             │             │         │  └──────────┬──────────┘  │
│             ▼             │         │             │             │
│   ┌───────────────────┐   │ Push    │             ▼             │
│   │ Local Push Agent  ├───┼─────────┼─►┌─────────────────────┐  │
│   │ (TCP/IP / ADMS)   │   │ HTTPS   │  │ Validation & Dupe   │  │
│   └─────────┬─────────┘   │         │  │ Deduplication Engine│  │
│             │             │         │  └──────────┬──────────┘  │
│             ▼ CSV Export  │         │             │             │
│   ┌───────────────────┐   │ Manual  │             ▼             │
│   │  Standardized CSV ├───┼─────────┼─►┌─────────────────────┐  │
│   │    File Ingestion │   │ Upload  │  │ Tenant Timesheet    │  │
│   └───────────────────┘   │         │  │ Punch Generator     │  │
└───────────────────────────┘         │  └─────────────────────┘  │
                                      └───────────────────────────┘
```

---

## 2. Ingestion Adapters

### 2.1 Standardized CSV Import Adapter (Phase 1 Implemented)
A robust CSV import adapter is implemented to support batch upload from any biometric vendor management software:
- **Expected CSV Columns:**
  - `employee_code`: Unique tenant-scoped employee identifier (e.g., `EMP-1001`).
  - `timestamp`: ISO-8601 date-time string (e.g., `2026-10-15T09:12:45+05:30`) or `YYYY-MM-DD HH:mm:ss`.
  - `punch_type`: `CHECK_IN` or `CHECK_OUT` (or `AUTO` for earliest/latest resolution).
  - `device_id`: Device identifier or terminal name (e.g., `MAIN_LOBBY_BIO_01`).
  - `device_ip`: Optional IP address for physical location verification.

### 2.2 Deduplication & Idempotency Rules
1. **Time-Window Debounce:** Two punches for the same employee within 2 minutes are treated as an accidental double-tap; only the first timestamp is kept.
2. **Earliest Check-In & Latest Check-Out:** Multiple punches throughout the day automatically compute:
   - `checkInTime`: Minimum timestamp of the date.
   - `checkOutTime`: Maximum timestamp of the date.
   - `totalWorkHours`: Difference between check-in and check-out minus lunch buffer.
3. **Grace Period & Late Detection:**
   - If `checkInTime` > `shift.startTime` + `shift.gracePeriodMinutes` (default 15 mins), the record is flagged as `LATE` with calculated `lateMinutes`.
   - If `totalWorkHours` < `shift.halfDayThresholdHours` (default 4.0 hours), marked as `HALF_DAY`.

---

## 3. Real-Time Webhook Contract (For On-Prem Push Agents)

```http
POST /api/v1/attendance/biometric/webhook
Content-Type: application/json
X-Seyyon-Tenant-Key: sec_tenant_live_xxxxxxxxxxxx
X-Seyyon-Signature: sha256=xxxxxxxxxxxxxxx

{
  "deviceId": "BIO_MUMBAI_01",
  "events": [
    {
      "employeeCode": "EMP-1001",
      "timestamp": "2026-10-15T09:04:12+05:30",
      "punchType": "CHECK_IN",
      "verificationMode": "FINGERPRINT",
      "serialNumber": "ZK892183921"
    }
  ]
}
```
