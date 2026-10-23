# SEYYON PEOPLE — Production Deployment & Operations Guide
**Product:** Seyyon People | **Company:** Pranexia Studio

---

## 1. Production Architecture Overview

In production, Seyyon People is deployed as containerized micro-services with high-availability PostgreSQL and Redis backing:

```
                          Internet (HTTPS: 443)
                                  │
                                  ▼
                     ┌───────────────────────────┐
                     │ Cloudflare / AWS ALB /    │
                     │  Nginx Ingress Controller │
                     └─────────────┬─────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌──────────────────────┐                  ┌──────────────────────┐
   │ Frontend Static Pods │                  │  Backend API Pods    │
   │  (Nginx / Sentry /   │                  │ (Node 20+ NestJS     │
   │   Vite Dist assets)  │                  │  Horizontal Scaling) │
   └──────────────────────┘                  └──────────┬───────────┘
                                                        │
                      ┌─────────────────────────────────┼──────────────────┐
                      ▼                                 ▼                  ▼
          ┌───────────────────────┐         ┌────────────────────┐   ┌───────────────┐
          │   AWS RDS PostgreSQL  │         │   AWS ElastiCache  │   │  AWS S3 Vault │
          │ (Multi-AZ, Read Reps) │         │ (Redis 7 Cluster)  │   │(Encrypted docs│
          └───────────────────────┘         └────────────────────┘   └───────────────┘
```

---

## 2. Docker & Container Orchestration

### 2.1 Multi-Stage Dockerfile for API
```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY . .
RUN npm run build --workspace=@seyyon/shared
RUN npm run prisma:generate --workspace=@seyyon/api
RUN npm run build --workspace=@seyyon/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
EXPOSE 4000
CMD ["node", "apps/api/dist/main"]
```

---

## 3. Database Migration & Zero-Downtime Releases

1. **Pre-Deployment:**
   Run migrations in a non-locking manner:
   ```bash
   npx prisma migrate deploy --schema=./apps/api/prisma/schema.prisma
   ```
2. **Rolling Update:**
   Deploy updated backend pods while previous pods continue draining connections.
3. **Backup Policy:**
   - Automated continuous WAL archiving with Point-In-Time-Recovery (PITR).
   - Daily encrypted database snapshots retained for 30 days.
