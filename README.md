# SEYYON PEOPLE — Multi-Tenant HRMS & Workforce Collaboration SaaS

<p align="center">
  <strong>People First. Work Smarter.</strong><br>
  Developed by <b>Pranexia Studio</b>
</p>

---

## 🌟 Overview

**Seyyon People** is an all-in-one, enterprise-grade, multi-tenant Human Resource Management System (HRMS) and workforce collaboration SaaS platform. Engineered for modern, high-growth organizations, it unites employee lifecycle management, smart attendance tracking, biometric integration, multi-level leave approvals, traceable statutory payroll, agile work management, encrypted document vaults, and real-time team chat into a single, cohesive experience.

---

## 🏗 Architecture & Tech Stack

- **Monorepo Structure:**
  - `apps/web`: React 18, TypeScript (Strict), Vite, Tailwind CSS, Lucide Icons, TanStack Query, React Hook Form, Zod, Recharts.
  - `apps/api`: Node.js 20+, NestJS, TypeScript, Swagger/OpenAPI, WebSockets, JWT Authentication, Class Validator.
  - `packages/shared`: Shared TypeScript domain models, enums, DTOs, and permission contracts.
  - `apps/api/prisma`: PostgreSQL 16 schema, migrations, and development seed scripts.
  - `docs`: Architecture, database design, permissions matrix, biometric integration, payroll rules, testing, and deployment guides.
  - `docker-compose.yml`: Local PostgreSQL 16, Redis 7, MinIO (S3), and Mailhog.

---

## 🚀 Quickstart & Local Installation

### Prerequisites
- **Node.js**: v20+ or v22+
- **npm**: v10+
- **Docker & Docker Compose** (for PostgreSQL, Redis, MinIO) or a local PostgreSQL instance.

### Step 1: Clone and Install Dependencies
```bash
# Navigate to project directory
cd seyyon-people

# Install all workspace dependencies
npm install
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

### Step 3: Start Supporting Services (Docker)
```bash
docker compose up -d
```
*This starts PostgreSQL on port `5432`, Redis on `6379`, MinIO on `9000/9001`, and Mailhog on `8025`.*

### Step 4: Generate Prisma Client & Run Migrations
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply database migrations
npm run prisma:migrate

# Seed development demo data
npm run prisma:seed
```

### Step 5: Start Frontend & Backend
You can start both simultaneously or independently:
```bash
# Start both apps in parallel:
npm run dev

# Or start frontend only:
npm run dev:web

# Or start backend only:
npm run dev:api
```

---

## 🌐 Application URLs

| Application / Service | URL | Notes |
| :--- | :--- | :--- |
| **Frontend Web App** | [http://localhost:5173](http://localhost:5173) | Responsive React Vite application |
| **Backend REST API** | [http://localhost:4000/api/v1](http://localhost:4000/api/v1) | Versioned RESTful API endpoints |
| **Interactive Swagger Docs**| [http://localhost:4000/api/docs](http://localhost:4000/api/docs)| Live OpenAPI documentation & tester |
| **Mailhog Web UI** | [http://localhost:8025](http://localhost:8025) | Local email preview inbox |
| **MinIO Console** | [http://localhost:9001](http://localhost:9001) | S3 document vault storage console |

---

## 🔑 Realistic Seed Demo Accounts

All demo accounts are seeded with password: `Password123!` (except Platform SuperAdmin: `SeyyonAdminSecure2026!`).

| Role | Email | Organization / Tenant |
| :--- | :--- | :--- |
| **Platform Super Admin** | `superadmin@seyyonpeople.com` | Global Platform Operator |
| **Company Admin** | `admin@acmetech.com` | Acme Technologies (`acme-tech`) |
| **HR Admin** | `hr@acmetech.com` | Acme Technologies (`acme-tech`) |
| **Team Lead / Manager** | `manager@acmetech.com` | Acme Technologies (`acme-tech`) |
| **Employee** | `employee@acmetech.com` | Acme Technologies (`acme-tech`) |
| **Tenant 2 Admin** | `admin@starlight.com` | Starlight Healthcare (`starlight-health`) |

---

## 🧪 Testing Commands

```bash
# Run all workspace test suites
npm run test

# Run backend unit & integration tests
npm run test --workspace=@seyyon/api

# Run production build validation
npm run build
```

---

## 📚 Comprehensive Documentation

- [System Architecture](docs/architecture.md)
- [Role-Based Access Control (RBAC) Matrix](docs/permissions-matrix.md)
- [Database Schema & ERD](docs/database-design.md)
- [Biometric Attendance Integration](docs/biometric-integration.md)
- [Indian Payroll & Statutory Compliance Rules](docs/payroll-rules.md)
- [Testing Strategy & Verification](docs/testing.md)
- [Production Deployment Guide](docs/deployment.md)

---
© 2026 Pranexia Studio. All rights reserved.
