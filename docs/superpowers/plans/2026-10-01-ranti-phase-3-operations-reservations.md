# Ranti Phase 3 Operations and Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy direct-to-payment operation endpoint with an auditable request, owner decision, reservation, cancellation, and expiry lifecycle that prevents incompatible acceptances under concurrency.

**Architecture:** Keep `operations` as the aggregate for both the pending request and the accepted transaction: `Pendiente` has requested terms but no contractual snapshot or reservation; acceptance locks current actors, publication, operation, and reservations, then creates the immutable snapshot and reservation atomically. PostgreSQL transition rows, unique/exclusion constraints, audit, and outbox form the correctness boundary; thin HTTP and React adapters consume that domain service. Payment, OTP, delivery, incidents, and closing remain later-phase seams.

**Tech Stack:** Node.js ESM, Express, Zod, PostgreSQL 17 (`btree_gist`, exclusion constraints, row locks), Vitest/Supertest, React/Vite.

**Spec:** `docs/superpowers/specs/2026-09-28-ranti-piloto-escalable-design.md`

## Global Constraints

- Preserve `001_init.sql` and `server/src/db/baseline-contract.js` byte-for-byte; use incremental migrations after 004.
- Work on `main` only because the user explicitly selected direct-main execution; never push without a new explicit request.
- A new request is `Pendiente`, has no contractual snapshot, reservation, payment movement, or OTP, and expires after `OPERATION_REQUEST_TTL_HOURS` (default 48; accepted range 1–168).
- `publications.contract_version` starts at 1 and increments only when `title`, `description`, `category`, `condition`, `modality`, `price`, `guarantee_amount`, `available_from`, or `available_until` changes; images and other presentation-only changes do not invalidate a request.
- Only acceptance creates the immutable contract snapshot and reservation after revalidating account state, ownership, publication state, terms, and availability inside one transaction.
- Use half-open reservation intervals `[start,end)`: touching boundaries are compatible; sales use a live null-interval reservation protected by a partial unique index.
- Lock order is current participant users sorted by UUID, publication, operation rows ordered by UUID, then reservations. A batch expiry worker that already owns an operation lock may not acquire user or publication locks. Do not introduce operation-to-publication inverse locking.
- Every effective request/decision/cancel/expire/reservation mutation appends sanitized audit and a deduplicated outbox event before commit; no evidence, credentials, OTP, tokens, or free-form secret-bearing payloads.
- Same-outcome retries are idempotent; opposite or stale transitions return 409 without duplicate snapshot, reservation, audit, or outbox effects.
- Payment/guarantee, OTP/delivery, return/closing, incidents, and reputation are not implemented in this phase. Keep their routes/placeholders honest and do not generate OTP.
- Preserve Phase 1–2 behavior, especially current database authorization, publication lock ordering, public privacy projections, migration checksums, and per-suite PostgreSQL isolation.

## Review Focus

- One hundred incompatible acceptances for the same sale or overlapping interval must commit exactly one reservation; Task 4 pins database and service defenses.
- Publication pause, withdrawal, contractual edit, or account suspension racing acceptance must be observed under locks and must not create a stale snapshot or reservation; Tasks 4 and 5 pin these paths.
- Adjacent intervals `[a,b)` and `[b,c)` must both succeed while true overlaps fail; Tasks 1, 2, and 4 pin boundary semantics.
- Expiry, repeated decisions, repeated cancellation, and batch-worker retries must persist one terminal outcome and one set of effects; Tasks 4 and 5 pin idempotence.
- Legacy advanced operations/reservations must survive upgrade, while ambiguous legacy `Pendiente` rows or invalid overlaps must stop migration for operator reconciliation instead of being silently reinterpreted; Task 1 pins preflight behavior.

---

## File structure

```text
server/src/db/migrations/005_operation_status_values.sql       enum-only commit boundary
server/src/db/migrations/006_operations_reservations.sql       request metadata, transition rules, reservation constraints
server/src/modules/operations/operation.policy.js              pure validation, actor/transition and projection rules
server/src/modules/operations/operation.service.js             transactional request/read/decision/cancel/expiry use cases
server/src/controllers/operation.controller.js                 thin HTTP parsing and result mapping
server/src/routes/operation.routes.js                          authenticated participant endpoints
server/src/jobs/expire-operations.js                           one-shot scheduler seam
server/test/phase3-migration.integration.test.js               clean/upgrade/preflight schema evidence
server/test/operation-policy.test.js                           pure policy coverage
server/test/operation-lifecycle.integration.test.js            PostgreSQL/API/rollback/concurrency coverage
client/src/features/operations/Operations.jsx                  incoming/outgoing participant workflow
client/src/features/catalog/ProductDetail.jsx                  request form entry point
docs/bpmn/operation-request-and-reservation.bpmn               evidence-backed Phase 3 process
server/test/phase3-traceability.test.js                        docs/BPMN/API contract assertions
```

### Task 1: Incremental operation and reservation schema

**Files:**
- Create: `server/src/db/migrations/005_operation_status_values.sql`
- Create: `server/src/db/migrations/006_operations_reservations.sql`
- Modify: `server/src/controllers/operation.controller.js`
- Create: `server/test/phase3-migration.integration.test.js`
- Modify: `server/test/postgres.integration.test.js`
- Modify: `server/test/publication-lifecycle.integration.test.js`

**Interfaces:**
- Produces operation statuses `Rechazada`, `Expirada`, and `Cancelación en reversión` in a migration committed before they are consumed.
- Adds `publications.contract_version bigint NOT NULL DEFAULT 1` and a trigger that increments it only for the contractual-field set in Global Constraints.
- Drops `operations.contract_snapshot` to nullable and adds exact columns `requested_price`, `requested_guarantee_amount`, `requested_contract_version`, `request_expires_at`, `accepted_at`, `decided_at`, `decided_by`, `decision_reason`, `cancelled_at`, `cancelled_by`, and `cancellation_reason`, with foreign keys and state/field consistency checks.
- Produces `operation_transition_rules(from_status, to_status, actor_kind, precondition_key, effect_key)` as the allowed-edge registry with primary key `(from_status, to_status, actor_kind, precondition_key)`. Every command queries all four key fields, so explicit rejection cannot select the publication-invalidation edge. Phase 3 seeds exactly: `Pendiente→Aceptada/owner/request_available/create_reservation`, `Pendiente→Rechazada/owner/pending_request/no_reservation`, `Pendiente→Rechazada/owner/publication_invalidated/no_reservation`, `Pendiente→Cancelada/requester/pending_request/no_reservation`, `Pendiente→Expirada/system/expired_request/no_reservation`, `Aceptada→Cancelada/requester/pre_economic/release_reservation`, `Pendiente de pago/garantía→Cancelación en reversión/requester/pre_delivery/retain_reservation`, and `Lista para entrega→Cancelación en reversión/requester/pre_delivery/retain_reservation`; later phases add their own edges.
- Makes `operations.status` and `reservations.status` non-null. Each reservation has `operation_id NOT NULL UNIQUE`; a composite FK `(operation_id, publication_id)` references a unique `(operations.id, operations.publication_id)` pair. Dates are both null for sales or exactly equal the owning operation's start/end half-open interval for rental/loan. Constraint triggers defend both directions: reservation insert/update validates operation modality/publication/dates, and operation modality/date updates are rejected while a reservation exists. `released_at` and `release_reason` retain release history.
- Treats exactly `Bloqueo Provisional`, `Reservada/Bloqueada`, and `Activa/En uso` as live reservation statuses; acceptance inserts `Reservada/Bloqueada`; `Disponible` requires release time/reason and is excluded from uniqueness/exclusion predicates.

- [ ] **Step 1: Write failing clean and upgrade migration tests**

Assert clean 001–006 migration, recorded 001–004 upgrade, enum values, exact columns/defaults/checks/FKs/triggers, transition primary key/seeds, rerun idempotence, checksums, and preservation of advanced legacy operations, snapshots, reservations, audit, and outbox. A legacy `Disponible` reservation is backfilled with `released_at=created_at` and `release_reason='legacy_status_backfill'`. Direct SQL tests must reject null statuses, mismatched reservation/operation publication, modality/date/interval mismatch in either update direction, mutable accepted snapshot, wrong transition precondition lookup, and post-migration release metadata inconsistent with status. Update existing direct-insert fixtures in the two listed test files to represent valid migrated states; keep the legacy HTTP test expectation unchanged until Task 3.

- [ ] **Step 2: Write failing preflight and constraint tests**

Assert migration 006 takes explicit table locks before preflight and fails atomically on ambiguous legacy `Pendiente` rows, null statuses, null/duplicate reservation operation IDs, reservation/operation publication mismatch, modality/date/exact-interval mismatch, inconsistent release metadata, invalid date pairs, overlapping live intervals, or duplicate live sale reservations. After migration, assert `[a,b)` and `[b,c)` coexist, true overlap raises `23P01`, and only one live null-interval sale reservation exists.

- [ ] **Step 3: Run PostgreSQL tests to verify RED**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because migrations 005/006 and their constraints do not exist.

- [ ] **Step 4: Add enum-only migration 005**

Use guarded `ALTER TYPE operation_status ADD VALUE` statements only. Do not consume the new enum values in this migration because PostgreSQL requires a commit boundary.

- [ ] **Step 5: Add migration 006 with explicit legacy preflight**

Acquire explicit locks on `publications`, `operations`, and `reservations` before preflight so application writes cannot race the diagnostic. Install `btree_gist`; reject ambiguous/invalid legacy rows with actionable exceptions; preserve accepted/advanced rows and backfill `accepted_at=created_at`, `decided_at=created_at`, `decided_by=oferente_id`, requested economics from `contract_snapshot` with publication values as documented fallback, and `requested_contract_version=publications.contract_version`. Backfill legacy `Disponible` release metadata with the documented approximation before checking the new invariant. Drop `contract_snapshot NOT NULL`; add the exact metadata/invariants in Interfaces, composite FK, modality/date constraint trigger, and a snapshot trigger allowing only null→non-null once. Add the partial live-sale unique index and GiST exclusion constraint over `publication_id` plus `tstzrange(start_date,end_date,'[)')` for the exact live statuses. Seed exactly the listed Phase 3 rows and legacy cancellation/reversal seams; do not seed forward payment or delivery transitions.

Until Task 3 replaces the legacy create handler, its existing direct-to-payment insert must populate the new acceptance/decision/requested columns consistently so the Phase 2 HTTP regression remains green. This is an interim schema-compatibility edit only; Task 3 changes the HTTP behavior to pending requests.

State/field matrix enforced for new rows: `Pendiente` has requested fields/expiry and no decision, acceptance, cancellation, snapshot, or reservation; `Aceptada` has acceptance and owner decision actor/time plus snapshot, with no cancellation; `Rechazada`/`Expirada` have decision time/reason, no acceptance/snapshot/cancellation, and `decided_by` is owner for rejection or null for system expiry; pre-acceptance `Cancelada` has cancellation actor/time/reason with no acceptance/snapshot; post-acceptance `Cancelada` retains acceptance/owner-decision/snapshot and adds requester cancellation metadata; advanced/reversal states require acceptance and snapshot, with reversal also requiring requester cancellation metadata. Legacy advanced rows receive the backfill above; ambiguous legacy `Pendiente` rows stop migration.

- [ ] **Step 6: Verify migrations**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: all migration and existing PostgreSQL suites PASS; failed preflights leave migration 006 unapplied and source rows unchanged.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/migrations/005_operation_status_values.sql server/src/db/migrations/006_operations_reservations.sql server/src/controllers/operation.controller.js server/test/phase3-migration.integration.test.js server/test/postgres.integration.test.js server/test/publication-lifecycle.integration.test.js
git commit -m "feat(db): add operation request and reservation lifecycle"
```

### Task 2: Pure operation policy and safe projections

**Files:**
- Create: `server/src/modules/operations/operation.policy.js`
- Modify: `server/src/config/env.js`
- Modify: `server/test/config-and-auth.test.js`
- Create: `server/test/operation-policy.test.js`

**Interfaces:**
- Produces `parseOperationRequest(input)`, `parseDecision(input)`, and `parseCancellation(input)`.
- Produces `validateRequestedTerms(publication, request, now)` and `buildContractSnapshot(publication, operation, acceptedAt)`.
- Produces `authorizeTransition(rule, context)` and `publicOperation(row, viewerId)`; transition rows select the edge while code owns named preconditions/effects.
- Consumes `OPERATION_REQUEST_TTL_HOURS`, default 48 and bounded to integer 1–168.

- [ ] **Step 1: Write failing policy tests**

Pin UUID/input validation, mandatory rejection/cancellation reasons of 1–500 normalized characters, sale-without-dates, rental/loan start-before-end inside publication availability, Peru date-only conversion, half-open boundaries, current requested economic/contract-version terms, self-request denial, actor roles, transition allowlist, immutable snapshot fields, and projections that never expose OTP/internal worker data. In `config-and-auth.test.js`, pin TTL default 48, integers 1 and 168, and rejection of zero, 169, fractions, and non-numbers while updating the exact expected environment object.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test --prefix server -- test/operation-policy.test.js test/config-and-auth.test.js`

Expected: FAIL because the operations policy module and `OPERATION_REQUEST_TTL_HOURS` environment field do not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Keep SQL and HTTP out of this module. Snapshot fields are title, description, category, condition, modality, price, guarantee, agreed dates, publication ID and `contract_version`, participants, and acceptance timestamp. Reject unsupported transition `precondition_key`/`effect_key` values rather than executing dynamic code.

- [ ] **Step 4: Verify policy and existing unit tests**

Run: `npm test --prefix server -- test/operation-policy.test.js`
Run: `npm test --prefix server`

Expected: focused policy and the normal server suite PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/operations/operation.policy.js server/src/config/env.js server/test/config-and-auth.test.js server/test/operation-policy.test.js
git commit -m "feat(operations): add request transition policy"
```

### Task 3: Pending request and participant read flows

**Files:**
- Create: `server/src/modules/operations/operation.service.js`
- Modify: `server/src/modules/publications/publication.service.js`
- Modify: `server/src/controllers/operation.controller.js`
- Modify: `server/src/routes/operation.routes.js`
- Delete: `server/src/services/operation.service.js`
- Create: `server/test/operation-lifecycle.integration.test.js`
- Modify: `server/test/publication-lifecycle.integration.test.js`
- Modify: `server/test/postgres.integration.test.js`

**Interfaces:**
- Produces `requestOperation(db, actorId, input)`, `listParticipantOperations(db, actorId, filters)`, and `getParticipantOperation(db, actorId, operationId)`.
- HTTP: `POST /api/operations`, `GET /api/operations/mine?side=requested|received&status=...&limit=20&offset=0`, and `GET /api/operations/:id`; register `/mine` before `/:id`. `limit` is integer 1–100, `offset` is integer 0–10000, ordering is `updated_at DESC, id DESC`, and list returns `{ items, limit, offset }`.
- Participant projection contains operation IDs/state/timestamps, requested terms, snapshot only after acceptance, sanitized reasons, `allowed_actions`, publication `{id,title,primary_image,contract_version}`, and counterpart `{id,display_name,reputation_score,operations_count}`; it excludes email, OTP, hashes, evidence, worker/internal fields, and unrelated users.
- A created request returns `201 { operation }` with `Pendiente`, requested terms, and expiry; it has null `contract_snapshot`/`otp_code` and no reservation.

- [ ] **Step 1: Write failing request/read integration tests**

Cover all modalities, explicit acceptance of displayed price/guarantee/`contract_version`, invalid/outer availability windows, own publication, non-active publication, missing/foreign/deleted/suspended/unverified participants, participant-only list/detail, the exact filters/pagination/ordering/response shape, public projection, audit/outbox rollback, and no open transaction after rejection.

- [ ] **Step 2: Change the legacy concurrency expectation to RED**

Replace the old assertion that competing requests create one reservation. Assert many compatible `Pendiente` requests may coexist and zero snapshots, OTPs, or reservations exist until acceptance.

- [ ] **Step 3: Run focused PostgreSQL tests to verify RED**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because the legacy controller jumps directly to payment/reservation and the new routes/service are absent.

- [ ] **Step 4: Implement the modular request service and thin adapters**

Validate before opening a transaction where possible. Perform a non-locking publication read only to discover the owner; then lock requester and current owner in sorted UUID order, lock the publication, verify its owner did not change, and revalidate both accounts and publication. Store requested price, guarantee, modality, dates, and `contract_version`; append `operation.requested` audit/outbox atomically. Remove the dead duplicate service. Expose `contract_version` in the safe public publication detail used by the request UI. Leave `POST /:id/confirm` isolated for Phase 5, but Phase 3 never creates OTP or a deliverable status.

- [ ] **Step 5: Verify focused and adjacent behavior**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`
Run: `npm test --prefix server`

Expected: request/read paths and all prior suites PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/operations server/src/modules/publications/publication.service.js server/src/controllers/operation.controller.js server/src/routes/operation.routes.js server/src/services/operation.service.js server/test/operation-lifecycle.integration.test.js server/test/publication-lifecycle.integration.test.js server/test/postgres.integration.test.js
git commit -m "feat(operations): add pending request workflow"
```

### Task 4: Owner acceptance/rejection and concurrency-safe reservations

**Files:**
- Modify: `server/src/modules/operations/operation.service.js`
- Modify: `server/src/controllers/operation.controller.js`
- Modify: `server/src/routes/operation.routes.js`
- Modify: `server/test/operation-lifecycle.integration.test.js`

**Interfaces:**
- Produces `decideOperation(db, ownerId, operationId, { decision, reason })` where decision is `accept` or `reject`.
- HTTP: `POST /api/operations/:id/accept` and `POST /api/operations/:id/reject`.
- Acceptance creates one immutable snapshot and one live reservation; rejection creates neither.

- [ ] **Step 1: Write failing decision, rollback, and idempotence tests**

Assert only the current active/verified publication owner decides; requester/other/admin-without-participation cannot. Pin exact same-outcome retry, opposite outcome 409, mandatory reject reason, mismatched `contract_version`, expired request, paused/withdrawn publication, actor state changes during lock waits, and rollback when reservation/audit/outbox fails. Time expiry must become `Expirada`; owner acceptance of an unavailable or contract-invalidated publication must become `Rechazada` with machine reason `publication_unavailable` or `contract_changed`.

- [ ] **Step 2: Write failing reservation concurrency tests**

Assert 100 incompatible sale acceptances commit one; 100 overlapping interval acceptances commit one; compatible and boundary-touching intervals both commit; losing operations remain `Pendiente` and have no snapshot/effects. Verify PostgreSQL `23P01`/owned-index `23505` map to sanitized 409 without retrying partial work.

- [ ] **Step 3: Run focused PostgreSQL tests to verify RED**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because decision routes and transactional reservation creation are absent.

- [ ] **Step 4: Implement accept/reject under the global lock order**

Use a non-locking discovery read for operation, participant, and publication IDs; then lock both users sorted by UUID, publication, all publication operations ordered by UUID, and reservations. Re-read the target and verify every discovered ID/relationship still matches before acting. Revalidate `Activa`, owner, `contract_version`/economics, expiry, modality/window, and conflicts. On accept set snapshot/acceptance metadata and `Aceptada`, then insert `Reservada/Bloqueada`; on explicit reject set decision metadata/reason and `Rechazada`. If time expired, commit one system `Expirada`; if the owner is attempting acceptance after the publication became unavailable or contract-invalidated, commit one owner `Rechazada` with the machine reason. The controller returns a stable 409 for these persisted invalidations without throwing them into rollback.

- [ ] **Step 5: Verify decision and concurrency behavior**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: all decision, 100-way concurrency, rollback, migration, and prior PostgreSQL tests PASS reproducibly with file parallelism enabled.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/operations/operation.service.js server/src/controllers/operation.controller.js server/src/routes/operation.routes.js server/test/operation-lifecycle.integration.test.js
git commit -m "feat(operations): accept requests with exclusive reservations"
```

### Task 5: Cancellation, expiry, release, and publication interaction

**Files:**
- Modify: `server/src/modules/operations/operation.service.js`
- Create: `server/src/jobs/expire-operations.js`
- Modify: `server/package.json`
- Modify: `server/src/modules/publications/publication.service.js`
- Modify: `server/src/controllers/operation.controller.js`
- Modify: `server/src/routes/operation.routes.js`
- Modify: `server/test/operation-lifecycle.integration.test.js`
- Modify: `server/test/publication-lifecycle.integration.test.js`

**Interfaces:**
- Produces `cancelOperation(db, actorId, operationId, { reason })` and `expirePendingOperations(db, { now, limit, workerId })`.
- HTTP: `POST /api/operations/:id/cancel`; job command: `npm run expire:operations --prefix server`.
- Publication mutations consume `invalidateAffectedPendingOperations(client, publicationId, cause)` while holding the publication lock; only elapsed TTL uses `Expirada`.

- [ ] **Step 1: Write failing cancellation/release tests**

Pin requester cancellation of `Pendiente` (no reservation) and `Aceptada` (reservation retained as `Disponible` with release cause/time), same retry idempotence, owner/foreign actor denial, accepted-state race, and audit/outbox rollback. For legacy/later states `Pendiente de pago/garantía` or `Lista para entrega`, requester cancellation becomes `Cancelación en reversión` and keeps the reservation; `Entregada/Activa` and later reject direct cancellation with 409.

- [ ] **Step 2: Write failing expiry/job tests**

Use an injected clock. Assert lazy expiry during accept/reject/cancel, batch `FOR UPDATE SKIP LOCKED`, bounded limit, competing workers with disjoint rows, one effect set, safe retry, and unavailable scheduler leaving acceptance protected by lazy expiry. The worker may lock and mutate only expired `Pendiente` operation rows plus their audit/outbox effects; it must not acquire user, publication, or reservation locks.

- [ ] **Step 3: Write failing publication interaction tests**

Assert pause/withdraw rejects pending requests in the same transaction with `publication_unavailable`; changes to the contractual-field set increment `contract_version` and reject pending requests with `contract_changed`; image-only and no-op edits do neither. A concurrent acceptance must serialize after the publication mutation and observe the final state/version. Failure in any request effect rolls back the publication mutation and every request transition.

- [ ] **Step 4: Run focused tests to verify RED**

Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: FAIL because cancellation, expiry, release, job seam, and publication integration are absent.

- [ ] **Step 5: Implement cancellation and expiry transactions**

Resolve transitions through the seeded rule table and an allowlisted effect handler. Participant cancellation first performs a non-locking discovery read, then locks both users sorted by UUID, publication, all publication operations ordered by UUID, and reservations; it revalidates every discovered ID/relationship before acting. Keep terminal reservation rows for traceability by setting `Disponible`, `released_at`, and sanitized `release_reason`; never delete them. Worker and lazy paths share a primitive that receives an already locked operation and never acquires broader locks; lazy participant paths acquire the same global order. Add a bounded `lock_timeout` worker-versus-pause/edit/accept test that proves completion without deadlock or leaked transactions.

- [ ] **Step 6: Integrate publication lifecycle without reversing lock order**

Reuse the publication transaction/client already holding its row, lock operations by UUID, reject/invalidate pending requests through the `publication_invalidated` edge with the owner actor and exact machine reason, and append per-request deduplicated effects before committing the publication change.

- [ ] **Step 7: Verify full server behavior**

Run: `npm test --prefix server`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`

Expected: normal and PostgreSQL suites PASS, including cancellation/reversal seam, worker concurrency, publication races, and prior Phase 1–2 checks.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/operations/operation.service.js server/src/jobs/expire-operations.js server/package.json server/src/modules/publications/publication.service.js server/src/controllers/operation.controller.js server/src/routes/operation.routes.js server/test/operation-lifecycle.integration.test.js server/test/publication-lifecycle.integration.test.js
git commit -m "feat(operations): add cancellation and request expiry"
```

### Task 6: Participant client workflow

**Files:**
- Create: `client/src/features/operations/Operations.jsx`
- Create: `client/src/features/operations/Operations.test.jsx`
- Modify: `client/src/features/catalog/ProductDetail.jsx`
- Modify: `client/src/features/catalog/ProductDetail.test.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/layout/Header.jsx`

**Interfaces:**
- Consumes the Phase 3 request/list/detail/accept/reject/cancel endpoints.
- Produces `/operaciones` with incoming/outgoing views and participant actions; product detail creates requests.
- Keeps `/checkout/:id` and `/entrega/:id` as truthful later-phase placeholders.

- [ ] **Step 1: Write failing React flow tests**

Cover request confirmation with displayed price/guarantee/version, modality-specific dates, own/non-active denial, server conflict, pending/accepted/rejected/cancelled/expired labels, incoming/outgoing empty/loading/error states, mandatory reason, accept/reject/cancel confirmations, repeated response refresh, permissions, and simulated/later-phase messaging.

- [ ] **Step 2: Run client tests to verify RED**

Run: `npm test --prefix client`

Expected: FAIL because the participant operation workflow does not exist.

- [ ] **Step 3: Implement request entry and participant dashboard**

Use existing session/API helpers and workflow styles. Do not optimistically claim acceptance, reservation, payment, OTP, or delivery; render only the server-confirmed operation state and actionable errors.

- [ ] **Step 4: Verify client quality**

Run: `npm test --prefix client`
Run: `npm run lint --prefix client`
Run: `npm run build --prefix client`

Expected: all tests PASS, lint exits 0, and Vite production build exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/operations client/src/features/catalog/ProductDetail.jsx client/src/features/catalog/ProductDetail.test.jsx client/src/App.jsx client/src/components/layout/Header.jsx
git commit -m "feat(client): add operation request and decision flows"
```

### Task 7: Phase 3 traceability, BPMN, and completion gate

**Files:**
- Modify: `README.md`
- Modify: `docs/revision-informe.md`
- Create: `docs/bpmn/operation-request-and-reservation.bpmn`
- Create: `docs/bpmn/operation-request-and-reservation.svg`
- Modify: `docs/bpmn/README.md`
- Create: `server/test/phase3-traceability.test.js`

**Interfaces:**
- Consumes verified Tasks 1–6 behavior.
- Produces synchronized API/migration/limits documentation, RF evidence, and BPMN 2.0 for request, decision, reservation, cancellation, release, and expiry.

- [ ] **Step 1: Write failing traceability assertions**

Assert migration names, endpoint names and list shape, 48-hour configurable expiry, `contract_version`, half-open interval semantics, exact live reservation statuses, no snapshot/reservation/OTP at request time, acceptance-only snapshot/reservation, cancellation/reversal seam, scheduler command/lazy fallback, `btree_gist` prerequisite, simulation/later-phase limits, and well-formed BPMN with happy and mandatory alternate paths.

- [ ] **Step 2: Create evidence-backed BPMN and SVG**

Include self-request, invalid dates, suspended account, paused/edited publication, stale/expired request, rejection, compatible/incompatible concurrent acceptance, database constraint conflict, cancellation before/after acceptance, reversal-required seam, release, duplicate action, audit/outbox rollback, and unavailable scheduler with lazy expiry.

- [ ] **Step 3: Synchronize README and RF/RNF matrix**

Mark RF-10, RF-11, RF-12, RF-24, RF-26, and pre-delivery RF-25/RF-28 behavior only to the verified extent. Update RNF-02 with the verified 100-way acceptance result while keeping broader load/operational acceptance pending. Keep RF-13–RF-20, later RF-28/RF-29, full RF-30, and all other unmeasured RNFs explicitly pending. Document that delivery confirmation remains legacy/later-phase and Phase 3 creates no OTP. Document one-shot scheduling plus lazy expiry, required `btree_gist` installation privilege, migration table-lock/quiescence behavior, and operator reconciliation for rejected legacy data.

- [ ] **Step 4: Validate BPMN and run the complete Phase 3 gate**

Run: `node "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\validate-bpmn.mjs" docs/bpmn/operation-request-and-reservation.bpmn`
Run: `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\render-bpmn.ps1" -InputPath docs/bpmn/operation-request-and-reservation.bpmn -OutputPath docs/bpmn/operation-request-and-reservation.svg`
Run: `npm test --prefix server`
Run: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1`
Run: `npm test --prefix client`
Run: `npm run lint --prefix client`
Run: `npm run build --prefix client`
Run: `git diff --check`

Expected: BPMN validates/renders; every server/client/PostgreSQL test passes; lint/build exit 0; temporary PostgreSQL is removed; documentation matches verified behavior.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/revision-informe.md docs/bpmn server/test/phase3-traceability.test.js
git commit -m "docs: trace phase three operations and reservations"
```

## Phase 3 completion gate

Phase 3 is complete only when:

- a request remains `Pendiente` without snapshot, reservation, payment, or OTP;
- only the current verified owner can accept/reject, and acceptance freezes current terms atomically;
- database constraints plus locks prevent incompatible sale or interval acceptances, including 100-way concurrency;
- compatible and boundary-touching intervals remain usable;
- participant reads/actions are private and use current database account state;
- cancellation and expiry are idempotent, audited, outboxed, and release only eligible reservations;
- publication pause/withdraw/contractual edit cannot race into a stale acceptance;
- later payment/reversal/OTP/delivery capabilities remain explicit seams, not simulated successes;
- client, README, RF matrix, BPMN, migrations, and fresh verification evidence agree with the implementation.
