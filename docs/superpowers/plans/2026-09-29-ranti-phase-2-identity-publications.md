# Ranti Phase 2 Identity and Publications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the academic-pilot identity, profile, student-role review, and publication lifecycle required by RF-01 through RF-09 and RF-21 through RF-23 without coupling the domain to a future UCSM SSO or storage provider.

**Architecture:** Keep the Express/PostgreSQL modular monolith. Thin HTTP controllers call identity, user, and publication use cases; provider ports isolate simulated institutional verification; every critical mutation writes domain data, immutable audit, and outbox in one PostgreSQL transaction. Publication risk is a versioned pure policy and lifecycle changes are serialized with row locks.

**Tech Stack:** Node.js ESM, Express, PostgreSQL 17, Zod, bcryptjs, JWT, React 19, React Router, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-28-ranti-piloto-escalable-design.md`

## Global Constraints

- Work on `main`, as explicitly requested; do not modify or commit `graphify-out/`.
- `001_init.sql` remains historical and immutable. Add only numbered incremental migrations with raw-byte SHA-256 history.
- An institutional email is valid only when its normalized domain is exactly `ucsm.edu.pe` or a subdomain ending in `.ucsm.edu.pe`; `ucsm.edu.pe.other.com` is invalid.
- Every verified new account starts as `Egresado`. `Estudiante` requires a manual administrator decision over submitted academic evidence.
- Do not collect a full DNI in this pilot. Evidence is represented by an opaque HTTPS reference plus non-sensitive metadata; future private storage/SSO adapters may replace it.
- No account receives an authenticated session before verification. Suspended or non-verified accounts remain denied using current database state.
- Price/risk rules use PEN. Policy `pilot-v1` defines declared exposure as `max(price ?? 0, guaranteeAmount ?? 0)`: below S/ 500 is basic; from S/ 500 requires administrative review; from S/ 1000 also requires provenance evidence.
- Critical mutations use one local transaction and append audit/outbox records before commit. Never write passwords, verification codes, tokens, or evidence contents to audit/outbox.
- Preserve the Phase 1 interfaces and all existing corrected behavior.

## Review Focus

- Email lookalikes, uppercase domains, whitespace, and malicious suffixes must not bypass the UCSM boundary; Task 2 pins them.
- Expired, reused, over-attempted, concurrent, or provider-unavailable verification challenges must never activate an account; Task 2 pins them.
- Repeated/conflicting administrator decisions must not apply a role twice or emit duplicate audit/outbox effects; Task 3 pins them.
- Publication values at exactly S/ 500 and S/ 1000, modality changes, and missing provenance must produce deterministic risk/status; Task 4 pins them.
- Concurrent edits/lifecycle actions and operations becoming active between validation and commit must be serialized and rejected without partial effects; Task 4 pins them.

---

## File structure

```text
server/src/db/migrations/003_identity_publications.sql  Phase 2 schema and constraints
server/src/modules/identity/identity-provider.js        provider contract and normalized result types
server/src/modules/identity/simulated-identity-provider.js pilot challenge adapter
server/src/modules/identity/identity.service.js         registration/challenge verification use cases
server/src/modules/users/profile.service.js             self-profile reads and safe edits
server/src/modules/users/role-review.service.js         student requests and admin decisions
server/src/modules/publications/risk.policy.js           pure, versioned risk calculation
server/src/modules/publications/publication.service.js   create/edit/lifecycle transaction rules
server/src/controllers/*                                 thin HTTP mapping only
server/src/routes/*                                      endpoint authentication/role composition
client/src/features/auth/Register.jsx                    registration and verification flow
client/src/features/dashboard/UserProfile.jsx            real profile and role request state
client/src/features/dashboard/AdminDashboard.jsx         real pending role/publication queues
client/src/features/publications/*                       create/manage publication flows
server/test/*phase2*                                     unit/HTTP/PostgreSQL coverage
client/src/**/*.test.jsx                                 user-flow component coverage
docs/bpmn/                                               evidence-backed BPMN 2.0 artifacts
```

### Task 1: Phase 2 incremental schema

**Files:**
- Create: `server/src/db/migrations/003_identity_publications.sql`
- Create: `server/test/phase2-migration.integration.test.js`

**Interfaces:**
- Produces tables `identity_challenges` and `role_requests`.
- Produces profile fields on `users`: `display_name`, `avatar_url`, `faculty`, `terms_accepted_at`, `terms_version`, `verified_at`, `identity_provider`.
- Produces publication fields: `risk_policy_version`, `provenance_evidence_ref`, `available_from`, `available_until`, `submitted_at`, `reviewed_by`, `review_reason`, `reviewed_at`, `published_at`.
- Preserves all rows and foreign keys from migrations 001 and 002.

- [ ] **Step 1: Write failing migration tests**

Test clean migration, upgrade from recorded 001+002, preservation of users/publications, identity challenge attempt/status constraints, one pending student request per user, valid publication date windows, and foreign keys for reviewers.

- [ ] **Step 2: Run the PostgreSQL migration test to verify RED**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because migration 003 and its schema do not exist.

- [ ] **Step 3: Add migration 003**

Use UUID primary keys, `timestamptz`, explicit status checks, a partial unique index for one `pending` role request per user, and non-destructive `ALTER TABLE` statements. Challenges store only `code_hash`, have `expires_at`, `attempts`, `max_attempts`, `consumed_at`, and provider reference/status. Role requests store an opaque evidence reference/metadata and the complete decision trail.

- [ ] **Step 4: Verify migration compatibility and checksum behavior**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: all PostgreSQL suites PASS on a disposable cluster and applying migrations twice changes nothing.

- [ ] **Step 5: Commit**

```bash
git add server/src/db/migrations/003_identity_publications.sql server/test/phase2-migration.integration.test.js
git commit -m "feat(db): add identity and publication lifecycle schema"
```

### Task 2: Simulated institutional identity and verified registration

**Files:**
- Create: `server/src/modules/identity/identity-provider.js`
- Create: `server/src/modules/identity/simulated-identity-provider.js`
- Create: `server/src/modules/identity/identity.service.js`
- Modify: `server/src/config/env.js`
- Modify: `server/src/controllers/auth.controller.js`
- Modify: `server/src/routes/auth.routes.js`
- Test: `server/test/identity.service.test.js`
- Test: `server/test/identity.integration.test.js`

**Interfaces:**
- Produces `isUcsmInstitutionalEmail(email) -> boolean`.
- Produces provider methods `requestVerification(email)`, `verifyChallenge(challenge, code)`, and `resolveInstitutionalIdentity(email)`.
- Produces use cases `registerPendingAccount(db, provider, input)`, `resendVerification(db, provider, input)`, and `verifyPendingAccount(db, provider, input)`.
- HTTP: `POST /api/auth/register`, `POST /api/auth/verification/resend`, `POST /api/auth/verification/confirm`, and the existing `POST /api/auth/login`.

- [ ] **Step 1: Write failing email/provider contract tests**

Assert valid base/subdomains, normalized uppercase/whitespace, and rejection of personal domains, missing labels, and `ucsm.edu.pe.other.com`. Run the same challenge contract against the simulated adapter.

- [ ] **Step 2: Write failing registration/challenge tests**

Pin required terms acceptance/version, default `Egresado`, no JWT before verification, bcrypt password/code hashes, 10-minute expiry, five-attempt lockout, single consumption, resend invalidation, concurrent confirmation, duplicate email, and provider-unavailable pending/retry behavior. Assert responses never expose hashes; expose a clearly labeled `simulation_code` only when `IDENTITY_PROVIDER=simulated` and `IDENTITY_SIMULATOR_EXPOSE_CODE=true`.

- [ ] **Step 3: Run focused tests to verify RED**

Run: `npm test --prefix server -- test/identity.service.test.js`

Expected: FAIL because the identity module does not exist.

- [ ] **Step 4: Implement the provider boundary and use cases**

Move registration policy out of the controller. Serialize confirmation with `SELECT ... FOR UPDATE`; on success activate/verify the user, append audit, and enqueue `identity.verified` in the same transaction. A provider failure leaves the account pending and returns a retryable public result rather than bypassing verification.

- [ ] **Step 5: Adapt login and authentication responses**

Login must reject pending, rejected, or suspended accounts without revealing which credential component failed. JWT role is informational; authorization continues to use the database-refreshed user from `requireAuth`.

- [ ] **Step 6: Verify identity behavior**

Run: `npm test --prefix server -- test/identity.service.test.js`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: focused and complete PostgreSQL suites PASS, including all “what if” challenge paths.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/identity server/src/config/env.js server/src/controllers/auth.controller.js server/src/routes/auth.routes.js server/test/identity.service.test.js server/test/identity.integration.test.js
git commit -m "feat(identity): add simulated institutional verification"
```

### Task 3: Profiles and administrator-reviewed student role

**Files:**
- Create: `server/src/modules/users/profile.service.js`
- Create: `server/src/modules/users/role-review.service.js`
- Create: `server/src/controllers/user.controller.js`
- Create: `server/src/routes/user.routes.js`
- Modify: `server/src/app.js`
- Test: `server/test/profile-and-role-review.test.js`
- Test: `server/test/profile-and-role-review.integration.test.js`

**Interfaces:**
- Produces `getOwnProfile(db, userId)` and `updateOwnProfile(db, userId, patch)`.
- Produces `requestStudentRole(db, input)`, `listPendingRoleRequests(db, page)`, and `decideStudentRole(db, input)`.
- HTTP self endpoints: `GET/PATCH /api/users/me`, `POST/GET /api/users/me/role-requests`.
- HTTP admin endpoints: `GET /api/admin/role-requests` and `POST /api/admin/role-requests/:id/decision`.

- [ ] **Step 1: Write failing profile tests**

Assert editable `display_name`, `avatar_url`, and `faculty`; reject attempts to edit email, role, academic condition, reputation, operation count, verification, timestamps, or status. Profile output fixes university to UCSM and derives academic condition from current role.

- [ ] **Step 2: Write failing student-request/admin-decision tests**

Assert verified `Egresado` only, HTTPS evidence reference, safe metadata, one pending request, resubmission after rejection, admin-only queue/decision, mandatory reason, approve -> `Estudiante`, reject -> remains `Egresado`, row locking, same-decision idempotence, conflicting repeat -> 409, and suspended-user denial.

- [ ] **Step 3: Run focused tests to verify RED**

Run: `npm test --prefix server -- test/profile-and-role-review.test.js`

Expected: FAIL because the services/routes do not exist.

- [ ] **Step 4: Implement profile and role-review transactions**

Approval/rejection updates the request, conditionally updates the user, writes audit, and enqueues `identity.role-request.decided` atomically. Evidence contents never enter audit/outbox; only the request ID and outcome do.

- [ ] **Step 5: Verify authorization, idempotence, and rollback**

Run: `npm test --prefix server -- test/profile-and-role-review.test.js`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: all focused and PostgreSQL tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/users server/src/controllers/user.controller.js server/src/routes/user.routes.js server/src/app.js server/test/profile-and-role-review.test.js server/test/profile-and-role-review.integration.test.js
git commit -m "feat(users): add profiles and student role review"
```

### Task 4: Versioned publication risk and owner lifecycle

**Files:**
- Create: `server/src/modules/publications/risk.policy.js`
- Create: `server/src/modules/publications/publication.service.js`
- Modify: `server/src/controllers/publication.controller.js`
- Modify: `server/src/routes/publication.routes.js`
- Test: `server/test/publication-policy.test.js`
- Test: `server/test/publication-lifecycle.integration.test.js`

**Interfaces:**
- Produces `evaluatePublicationRisk(input) -> { policyVersion, level, requiresAdminReview, requiresProvenanceEvidence, declaredExposure }`.
- Produces `createPublication`, `updatePublication`, `submitPublication`, `pausePublication`, `reactivatePublication`, `withdrawPublication`, `listOwnPublications`, `listPendingPublicationReviews`, and `decidePublicationReview` use cases.
- HTTP owner endpoints: existing `POST /api/publications` creates a draft; `GET /api/publications/mine` lists owned records; `PATCH /api/publications/:id` edits; and `POST /api/publications/:id/{submit|pause|reactivate|withdraw}` changes lifecycle. Register `/mine` before the public `/:id` route.
- HTTP admin endpoints: `GET /api/admin/publications/reviews` and `POST /api/admin/publications/:id/review`.

- [ ] **Step 1: Write failing pure policy tests**

Pin modality validation, declared exposure, boundaries at 499.99/500/999.99/1000, evidence requirement, policy version, rental/loan availability windows, and risk recalculation after price/guarantee/modality changes.

- [ ] **Step 2: Write failing lifecycle/concurrency tests**

Assert one-to-four HTTPS images before submission; draft save may be incomplete but submit may not. Basic risk submits to `Activa`; reviewed risks submit to `Pendiente de revisión`; missing provenance at level 3 yields 422. Only owner may mutate. Pause removes catalog visibility; reactivation recalculates risk; withdrawal is terminal. Any related operation outside `Pendiente`, `Cancelada`, or `Cerrada` blocks contractual edits/pause/reactivation/withdraw with 409. Domain preconditions such as missing evidence use 422. A concurrent operation state change after validation must be caught under the publication row lock and roll back.

- [ ] **Step 3: Run focused tests to verify RED**

Run: `npm test --prefix server -- test/publication-policy.test.js`

Expected: FAIL because the policy/service do not exist.

- [ ] **Step 4: Implement policy and transaction-oriented service**

Controllers only parse/map HTTP. Every mutation locks the publication, checks ownership/current operations, recalculates risk when relevant, replaces image rows transactionally when supplied, appends audit, and enqueues a deduplicated lifecycle event before commit.

- [ ] **Step 5: Implement administrative publication review**

Approve/reject with mandatory reason and current-state guard. Approval activates only if the latest policy/evidence still passes. Rejection returns the publication to `Borrador` with the review reason so its owner can correct and resubmit; it does not invent a new enum state. Repeated same decision is idempotent; conflicting decisions fail without extra effects.

- [ ] **Step 6: Extend catalog filters safely**

Validate and parameterize combined search, category, modality, min/max price, condition, and availability filters. Public list/detail continue exposing only active publications and no owner email/evidence reference.

- [ ] **Step 7: Verify publication paths**

Run: `npm test --prefix server -- test/publication-policy.test.js`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: policy, lifecycle, catalog, rollback, and prior suites PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/publications server/src/controllers/publication.controller.js server/src/routes/publication.routes.js server/test/publication-policy.test.js server/test/publication-lifecycle.integration.test.js
git commit -m "feat(publications): add risk-based lifecycle"
```

### Task 5: Phase 2 client flows without fictitious data

**Files:**
- Create: `client/src/features/auth/Register.jsx`
- Create: `client/src/features/auth/Register.test.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/features/auth/Login.jsx`
- Modify: `client/src/features/dashboard/UserProfile.jsx`
- Modify: `client/src/features/dashboard/AdminDashboard.jsx`
- Modify: `client/src/features/publications/CreatePublication.jsx`
- Create: `client/src/features/publications/ManagePublications.jsx`
- Test: corresponding `*.test.jsx` files.

**Interfaces:**
- Consumes the Task 2–4 HTTP contracts and existing `apiRequest`/session helpers.
- Produces UI flows for registration/challenge confirmation, profile editing, student-role request, admin decisions, draft/submit/risk feedback, and owner lifecycle actions.

- [ ] **Step 1: Write failing client flow tests**

Cover valid/invalid UCSM email feedback, required terms acceptance, pending provider retry, expired/incorrect verification code, login redirect, profile protected metrics, student evidence request, admin approve/reject reason, modality-specific publication fields, 1–4 HTTPS image URLs, risk review/provenance messages, empty/loading/error states, and pause/reactivate/withdraw confirmations.

- [ ] **Step 2: Run client tests to verify RED**

Run: `npm test --prefix client`

Expected: FAIL because the real Phase 2 flows are absent.

- [ ] **Step 3: Implement registration and profile flows**

Never label an account verified before server confirmation. Clearly mark the displayed challenge as simulated test data. Remove the old statement that egresados lack institutional email and show current database-backed profile/request state.

- [ ] **Step 4: Implement publication and admin flows**

Replace disabled/fictitious dashboard counters and sample rows with API-backed loading/empty/error states. Show why a publication is active, pending review, paused, or blocked; never present simulated evidence or approval as real.

- [ ] **Step 5: Verify client quality**

Run: `npm test --prefix client`
Run: `npm run lint --prefix client`
Run: `npm run build --prefix client`

Expected: all tests PASS, lint exits 0, and Vite production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(client): add identity and publication workflows"
```

### Task 6: Phase 2 traceability, BPMN, and completion gate

**Files:**
- Modify: `README.md`
- Modify: `docs/revision-informe.md`
- Create: `docs/bpmn/identity-verification-and-role-review.bpmn`
- Create: `docs/bpmn/publication-risk-and-lifecycle.bpmn`
- Create: `docs/bpmn/README.md`
- Test: `server/test/phase2-traceability.test.js`

**Interfaces:**
- Consumes the verified behavior from Tasks 1–5.
- Produces synchronized setup/API/limitations documentation, RF traceability, and BPMN 2.0 XML for the two implemented processes.

- [ ] **Step 1: Write traceability assertions**

Assert documented route names, migration command, policy version/thresholds, simulation warning, manual student review rule, known limitations, and well-formed BPMN files containing happy paths plus mandatory alternate paths.

- [ ] **Step 2: Create evidence-backed BPMN**

Identity process includes invalid domain, provider unavailable, expired/wrong/reused challenge, student request, rejection, approval, and repeated decision. Publication process includes invalid modality/data, risk thresholds, missing evidence, admin rejection/approval, concurrent blocking operation, edit recalculation, pause/reactivate, and withdrawal.

- [ ] **Step 3: Synchronize README and report matrix**

Mark only verified RF-01 through RF-09 and RF-21 through RF-23 behavior as implemented. Explicitly preserve pending later phases, no real SSO, opaque evidence references, simulated challenge exposure rules, and no invented pilot/RNF results.

- [ ] **Step 4: Run the complete Phase 2 gate**

Run: `npm test --prefix server`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`
Run: `npm test --prefix client`
Run: `npm run lint --prefix client`
Run: `npm run build --prefix client`
Run: `git diff --check`

Expected: all server/client/PostgreSQL tests PASS, lint/build exit 0, disposable PostgreSQL is removed, and diff check is clean.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/revision-informe.md docs/bpmn server/test/phase2-traceability.test.js
git commit -m "docs: trace phase two identity and publications"
```

## Phase 2 completion gate

Phase 2 is complete only when:

- all six task boundaries are implemented and independently reviewed;
- every account is UCSM-domain verified before session issuance and starts as `Egresado`;
- only an idempotent, audited administrator decision can promote a verified account to `Estudiante`;
- profile metrics and identity/account state cannot be user-edited;
- publication creation, review, edit, pause, reactivation, withdrawal, filtering, and risk recalculation match the versioned policy;
- active operations block incompatible publication changes under concurrency;
- every critical identity/role/publication mutation writes audit and outbox atomically;
- public endpoints expose neither private evidence references nor identity secrets;
- client screens use real API state and explicitly label simulated behavior;
- README, RF matrix, BPMN, and exact test evidence match the implemented code.
