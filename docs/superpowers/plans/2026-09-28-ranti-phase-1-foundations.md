# Ranti Phase 1 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the protected client shell, validated server configuration, incremental migrations, normalized HTTP errors, immutable audit writes, and a reliable transactional outbox required by every later Ranti module.

**Architecture:** Preserve the existing Express/PostgreSQL monolith while introducing focused shared infrastructure and module-level repositories. PostgreSQL remains the transactional authority; audit and outbox records are written through transaction-compatible functions. This plan implements only Phase 1; identity, operations, payment, delivery, and governance receive separate plans after these interfaces are stable.

**Tech Stack:** Node.js 24, Express 5, PostgreSQL 17, React 19, React Router 7, Zod 4, Vitest 5, Supertest, Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-09-28-ranti-piloto-escalable-design.md`

## Global Constraints

- Preserve all existing uncommitted corrections; never reset or overwrite unrelated work.
- Keep `server/src/db/migrations/001_init.sql` unchanged as the historical baseline.
- Add schema changes only through monotonically numbered migrations.
- The pilot must never process or claim to process real money.
- Controllers and React components must not own business state-transition rules.
- Public errors must not expose SQL, stack traces, secrets, tokens, OTP values, PAN, or CVV.
- Every task ends with its focused tests plus the mandatory existing server tests or client lint/build relevant to that task.
- Use `tools/test-postgres.ps1` only with its isolated local cluster guard.

## Review Focus

- A corrupted or hand-edited browser session must be treated as logged out; Task 1 pins this in `route-guards.test.jsx`.
- Malformed JSON and attacker-supplied correlation headers must produce a sanitized server-generated request ID; Task 3 pins this in `http-foundations.test.js`.
- Two migration runners starting together must apply each migration once, while a changed applied migration must fail by checksum; Task 4 pins both in `migrations.integration.test.js`.
- An audit insert that fails inside a business transaction must roll back the business write; Task 5 pins this in `audit.integration.test.js`.
- Duplicate outbox keys and a worker crash leaving a stale lease must not deliver the logical event twice indefinitely; Task 6 pins these in `outbox.integration.test.js`.

---

## Delivery roadmap

| Plan | Deliverable | Depends on |
|---|---|---|
| Phase 1 — this plan | Guards, configuration, errors, migrations, audit, outbox | Current corrected baseline |
| Phase 2 | Identity, roles, profiles, publication risk and moderation | Phase 1 |
| Phase 3 | Request/accept/reject/cancel/expire state machine and reservations | Phases 1–2 |
| Phase 4 | Simulated payment/guarantee adapters and webhooks | Phase 3 |
| Phase 5 | Secure OTP, delivery, return, closing and reputation | Phase 4 |
| Phase 6 | Incidents, administration, ARCO and complete notifications | Phases 2–5 |
| Phase 7 | RNF evidence, backup/restore, PWA, BPMN and pilot runbook | All prior phases |

## Planned file structure

```text
client/src/components/auth/RequireSession.jsx        route-level session/role guard
client/src/components/auth/RequireSession.test.jsx   browser guard behavior
client/src/test/setup.js                              DOM test setup

server/src/config/env.js                              validated process configuration
server/vitest.config.js                               deterministic test-only environment
server/src/shared/errors/app-error.js                 typed application error
server/src/shared/security/sensitive-data.js          recursive secret-key rejection
server/src/middlewares/request-context.middleware.js  server request correlation
server/src/middlewares/error.middleware.js            404 and final error responses
server/src/db/migrate.js                              checksummed migration runner
server/src/db/migrations/002_foundations.sql          audit/outbox foundation schema
server/src/modules/audit/audit.repository.js          transaction-compatible audit append
server/src/modules/outbox/outbox.repository.js        enqueue/claim/complete/fail operations
server/src/modules/outbox/outbox.worker.js            handler dispatch and retry orchestration
```

### Task 1: Client test harness and protected routes

**Files:**
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Modify: `client/src/App.jsx`
- Create: `client/src/components/auth/RequireSession.jsx`
- Create: `client/src/components/auth/RequireSession.test.jsx`
- Create: `client/src/test/setup.js`
- Create: `client/vitest.config.js`

**Interfaces:**
- Consumes: `getSession() -> { token: string, user: object } | null` from `client/src/lib/auth.js`.
- Produces: `RequireSession({ children, allowedRoles = null })`, where `allowedRoles` is `string[] | null`; unauthorized users render a React Router `<Navigate>`.

- [ ] **Step 1: Install the client test dependencies**

Run: `npm install --prefix client --save-dev vitest@^5.0.1 jsdom @testing-library/react @testing-library/jest-dom`

Expected: `client/package.json` contains a `test` script using `vitest run` and the lockfile records the four development dependencies.

- [ ] **Step 2: Write failing route-guard tests**

Create tests named:

- `redirects an anonymous visitor to /login and preserves the requested path`;
- `renders a protected page for a stored session`;
- `redirects a non-administrator away from an administrator route`;
- `renders an administrator route for role Administrador`;
- `treats malformed session JSON as logged out`.

Assert the redirect destination using `MemoryRouter` and a location probe. Do not mock `getSession` or React Router: populate or corrupt `localStorage`/`sessionStorage` so these tests exercise the real session parser.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test --prefix client -- src/components/auth/RequireSession.test.jsx`

Expected: FAIL because `RequireSession.jsx` does not exist.

- [ ] **Step 4: Implement `RequireSession` and apply it to routes**

Protect `/publicar`, `/checkout/:id`, `/entrega/:id`, `/perfil`, `/oferente`, `/reclamaciones` and `/privacidad` with a session requirement. Protect `/admin` with `allowedRoles={['Administrador']}`. Preserve the original location in navigation state and redirect a disallowed authenticated role to `/`.

- [ ] **Step 5: Verify the client**

Run: `npm test --prefix client && npm run lint --prefix client && npm run build --prefix client`

Expected: all guard tests PASS, lint exits 0, and Vite produces `client/dist`.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/vitest.config.js client/src/test/setup.js client/src/components/auth/RequireSession.jsx client/src/components/auth/RequireSession.test.jsx client/src/App.jsx
git commit -m "feat(client): protect authenticated routes"
```

### Task 2: Validated server configuration and role middleware

**Files:**
- Create: `server/src/config/env.js`
- Create: `server/vitest.config.js`
- Modify: `server/src/config/database.js`
- Modify: `server/server.js`
- Modify: `server/src/app.js`
- Modify: `server/src/controllers/auth.controller.js`
- Modify: `server/src/middlewares/auth.middleware.js`
- Create: `server/test/config-and-auth.test.js`

**Interfaces:**
- Produces: `loadEnv(source = process.env) -> Readonly<{ NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, FRONTEND_URL, PAYMENT_PROVIDER }>`.
- Produces: `requireRole(...allowedRoles) -> Express middleware` using only `req.user.role` populated by `requireAuth`.
- `PAYMENT_PROVIDER` accepts only `simulated`, `culqi`, or `niubiz` and defaults to `simulated`; non-simulated providers remain unusable until Phase 4 adds and validates their credentials.

- [ ] **Step 1: Write failing configuration and authorization tests**

Test these exact cases:

- valid development configuration is parsed and frozen;
- missing `DATABASE_URL` fails with a configuration error;
- `JWT_SECRET` shorter than 32 characters fails outside tests;
- unsupported `PAYMENT_PROVIDER` fails;
- `requireRole('Administrador')` calls `next` for an administrator and returns 403 for `Egresado`;
- the 403 body does not disclose the allowed role list.

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test --prefix server -- test/config-and-auth.test.js`

Expected: FAIL because `env.js` and `requireRole` do not exist.

- [ ] **Step 3: Implement configuration parsing and replace direct environment reads**

Use one Zod schema in `env.js`. Export `loadEnv` for tests and `env` for runtime. Make `database.js`, `server.js`, JWT signing/verifying, and CORS consume `env`; do not log secret values. Configure deterministic non-secret test values in `server/vitest.config.js` so unit tests never depend on a developer's `.env`; PostgreSQL integration tests continue overriding `DATABASE_URL` before dynamically importing the app.

- [ ] **Step 4: Implement `requireRole(...allowedRoles)`**

Return 401 when no authenticated user is present, 403 for a disallowed current role, and call `next()` otherwise.

- [ ] **Step 5: Verify server behavior**

Run: `npm test --prefix server`

Expected: the new tests and the existing 10 unit tests PASS; PostgreSQL-only tests remain skipped in this command.

- [ ] **Step 6: Commit**

```bash
git add server/vitest.config.js server/src/config/env.js server/src/config/database.js server/src/app.js server/server.js server/src/controllers/auth.controller.js server/src/middlewares/auth.middleware.js server/test/config-and-auth.test.js
git commit -m "feat(server): validate configuration and roles"
```

### Task 3: Request context and normalized HTTP errors

**Files:**
- Create: `server/src/shared/errors/app-error.js`
- Create: `server/src/middlewares/request-context.middleware.js`
- Create: `server/src/middlewares/error.middleware.js`
- Modify: `server/src/app.js`
- Create: `server/test/http-foundations.test.js`

**Interfaces:**
- Produces: `class AppError extends Error` constructed with `{ status, code, message, details? }`.
- Produces: `requestContext(req, res, next)` assigning a server-generated UUID to `req.requestId` and `X-Request-Id`.
- Produces: `notFound(req, res, next)` and `errorHandler(error, req, res, next)`.

- [ ] **Step 1: Write failing HTTP foundation tests**

Assert:

- every `/health` response includes a valid UUID `X-Request-Id`;
- an attacker-provided `X-Request-Id` is not reflected;
- an unknown API route returns `{ error: { code: 'NOT_FOUND', message, request_id } }` with 404;
- malformed JSON returns code `INVALID_JSON` with 400 and no parser stack;
- an `AppError` preserves its public code/status while an ordinary thrown error becomes `INTERNAL_ERROR`/500.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test --prefix server -- test/http-foundations.test.js`

Expected: FAIL because responses are not normalized and request IDs are absent.

- [ ] **Step 3: Implement the error and context middleware**

Install context before parsers and routes. Install 404 and final error middleware after all routes. Preserve existing controller response bodies in Phase 1; only middleware-generated errors use the normalized envelope until later modules migrate.

- [ ] **Step 4: Verify unit and HTTP tests**

Run: `npm test --prefix server`

Expected: all unit/HTTP tests PASS without changing existing endpoint success contracts.

- [ ] **Step 5: Commit**

```bash
git add server/src/shared/errors/app-error.js server/src/middlewares/request-context.middleware.js server/src/middlewares/error.middleware.js server/src/app.js server/test/http-foundations.test.js
git commit -m "feat(server): normalize request errors"
```

### Task 4: Checksummed incremental migration runner

**Files:**
- Create: `server/src/db/migrate.js`
- Create: `server/src/db/migrations/002_foundations.sql`
- Modify: `server/package.json`
- Modify: `server/test/postgres.integration.test.js`
- Create: `server/test/migrations.integration.test.js`
- Modify: `tools/test-postgres.ps1`
- Modify: `README.md`

**Interfaces:**
- Produces: `runMigrations(db = pool, { directory } = {}) -> Promise<{ applied: string[], skipped: string[] }>`.
- Migration history table: `schema_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())`.
- `002_foundations.sql` produces audit metadata/immutability and `outbox_events` with a unique `deduplication_key`, lease fields, retry fields, status check, timestamps, and indexes for claimable events.

- [ ] **Step 1: Write failing migration integration tests**

Under `RANTI_EPHEMERAL_DB=1`, test:

- a blank database applies `001_init.sql` then `002_foundations.sql`;
- a second run skips both migrations;
- two concurrent calls record each migration exactly once using a PostgreSQL session advisory lock;
- changing the content of an already applied temporary migration throws `MIGRATION_CHECKSUM_MISMATCH`;
- a failed temporary migration rolls back its schema changes and is not recorded.

- [ ] **Step 2: Run the isolated integration tests to verify failure**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because `runMigrations` and migration `002` do not exist.

- [ ] **Step 3: Implement `runMigrations`**

Sort files by zero-padded numeric prefix, calculate SHA-256 over raw bytes, acquire one fixed session advisory lock on a dedicated client for the complete run, create `schema_migrations`, and apply each unseen migration plus its history row in its own transaction. Release the advisory lock and client in `finally`. Reject checksum drift before applying new files.

- [ ] **Step 4: Add migration `002_foundations.sql`**

Add `request_id uuid` and `metadata jsonb not null default '{}'` to `audit_logs`; add a trigger that raises on update/delete. Create the outbox schema defined in the Interfaces block. Use idempotent DDL only where retrying a failed migration requires it; history remains the normal idempotence mechanism.

- [ ] **Step 5: Route all test setup through the runner**

Replace direct reading of `001_init.sql` in `postgres.integration.test.js`. Update the PowerShell script to run the complete server suite with integration tests enabled and let the tests call the runner. Keep its existing guarantees: loopback-only disposable cluster, unique temporary path, stop and remove in `finally`.

- [ ] **Step 6: Verify migrations and existing integrations**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: migration tests and all 31 existing PostgreSQL integration tests PASS, and the temporary cluster is stopped and removed.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/migrate.js server/src/db/migrations/002_foundations.sql server/package.json server/test/migrations.integration.test.js server/test/postgres.integration.test.js tools/test-postgres.ps1 README.md
git commit -m "feat(db): add incremental migration runner"
```

### Task 5: Immutable audit repository

**Files:**
- Create: `server/src/modules/audit/audit.repository.js`
- Create: `server/src/shared/security/sensitive-data.js`
- Create: `server/test/audit.repository.test.js`
- Create: `server/test/audit.integration.test.js`

**Interfaces:**
- Produces: `assertNoSensitiveKeys(value, sourceLabel) -> void`, rejecting forbidden keys recursively and case-insensitively.
- Produces: `appendAudit(db, event) -> Promise<auditRow>`.
- `event` is `{ actorId, action, entityType, entityId, oldValues?, newValues?, requestId?, metadata? }`.
- `db` is any object exposing `query(sql, params)`, allowing a pool or transaction client.

- [ ] **Step 1: Write failing audit tests**

Unit-test parameter order, null defaults, and that secrets supplied under forbidden metadata keys (`password`, `token`, `otp`, `pan`, `cvv`) are rejected with code `AUDIT_SENSITIVE_DATA`. Integration-test insert/read, database refusal of update/delete, and rollback of a sample business insert when `appendAudit` fails inside the same transaction.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test --prefix server -- test/audit.repository.test.js`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement `appendAudit(db, event)`**

Validate the event with Zod, call `assertNoSensitiveKeys` over `oldValues`, `newValues`, and `metadata`, insert explicit columns, and return the stored row. Do not stringify JSON manually; pass objects to `pg`.

- [ ] **Step 4: Verify unit and PostgreSQL behavior**

Run: `npm test --prefix server -- test/audit.repository.test.js`  
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: audit unit/integration tests and prior suites PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/shared/security/sensitive-data.js server/src/modules/audit/audit.repository.js server/test/audit.repository.test.js server/test/audit.integration.test.js
git commit -m "feat(audit): add immutable audit writer"
```

### Task 6: Transactional outbox repository and worker

**Files:**
- Create: `server/src/modules/outbox/outbox.repository.js`
- Create: `server/src/modules/outbox/outbox.worker.js`
- Create: `server/test/outbox.repository.test.js`
- Create: `server/test/outbox.integration.test.js`
- Modify: `server/src/controllers/notification.controller.js`

**Interfaces:**
- Produces: `enqueueOutboxEvent(db, event) -> Promise<outboxRow>` with `{ aggregateType, aggregateId, eventType, payload, deduplicationKey, availableAt? }`.
- Produces: `claimOutboxBatch(db, { workerId, limit = 20, leaseSeconds = 60 }) -> Promise<outboxRow[]>` using `FOR UPDATE SKIP LOCKED`.
- Produces: `completeOutboxEvent(db, { id, workerId })` and `failOutboxEvent(db, { id, workerId, error, retryAt })`.
- Produces: `processOutboxBatch({ db, handlers, workerId, now = () => new Date() }) -> Promise<{ processed, failed }>`; `handlers` maps exact event-type strings to async functions.

- [ ] **Step 1: Write failing repository and worker tests**

Test:

- duplicate `deduplicationKey` returns the original logical event without a second row;
- two workers cannot claim the same active lease;
- an expired lease becomes claimable by another worker;
- success marks one event processed;
- handler failure records a sanitized error, increments attempts, and schedules exponential retry capped at one hour;
- an unknown event type follows the failure path instead of being discarded;
- payload keys forbidden by `assertNoSensitiveKeys` are rejected before persistence.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test --prefix server -- test/outbox.repository.test.js`

Expected: FAIL because the outbox files do not exist.

- [ ] **Step 3: Implement outbox enqueue and lease operations**

Use a short transaction for claiming. Reclaim only `processing` rows whose `locked_at` is older than the lease. Require matching `workerId` for completion/failure so a stale worker cannot overwrite a newer lease.

- [ ] **Step 4: Implement `processOutboxBatch`**

Do not hold a database transaction while invoking a handler. Sanitize stored failure text to at most 500 characters. Compute retry delay as `min(2^attempts * 30 seconds, 1 hour)`.

- [ ] **Step 5: Adapt notification creation to the new boundary**

Keep existing notification read endpoints. Replace the generic exported utility with a handler-compatible function `createInAppNotification(db, payload)`; later phases enqueue events instead of directly coupling business modules to notification SQL.

- [ ] **Step 6: Verify the complete Phase 1 suite**

Run: `npm test --prefix server`  
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`  
Run: `npm test --prefix client && npm run lint --prefix client && npm run build --prefix client`  
Run: `git diff --check`

Expected: all unit/client/PostgreSQL tests PASS, client lint/build exit 0, temporary PostgreSQL is removed, and diff check reports no errors.

- [ ] **Step 7: Update traceability documentation**

Update `docs/revision-informe.md` and `README.md` with only verified Phase 1 behavior, exact test counts, migration commands, and the statement that later RF modules remain pending.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/outbox server/src/controllers/notification.controller.js server/test/outbox.repository.test.js server/test/outbox.integration.test.js docs/revision-informe.md README.md
git commit -m "feat(outbox): add reliable event delivery foundation"
```

## Phase 1 completion gate

Phase 1 is complete only when:

- all six task commits exist or equivalent reviewed commits preserve the same boundaries;
- route guards deny anonymous and disallowed-role navigation;
- startup rejects invalid configuration without exposing secrets;
- all HTTP middleware errors include a server UUID and sanitized envelope;
- blank and existing databases migrate incrementally with checksum protection;
- audit rows cannot be modified or deleted through normal SQL;
- outbox delivery is deduplicated, leased, retryable, and crash-recoverable;
- existing corrected behavior remains covered by the 31+ PostgreSQL integration tests;
- README and `docs/revision-informe.md` match the verified implementation.
