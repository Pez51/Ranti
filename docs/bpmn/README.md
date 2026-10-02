# BPMN de Fases 2–3 — evidencia del código actual

Base revisada: `6ab28a5` más la corrección final de privacidad, 2026-09-30. No se usa el grafo obsoleto como prueba. Los modelos describen peticiones implementadas, no procesos ejecutables ni aprobación institucional real.

- [Identidad y revisión de rol](identity-verification-and-role-review.bpmn) · [SVG](identity-verification-and-role-review.svg)
- [Riesgo y ciclo de publicaciones](publication-risk-and-lifecycle.bpmn) · [SVG](publication-risk-and-lifecycle.svg)
- [Solicitud, decisión, reserva, cancelación y expiración](operation-request-and-reservation.bpmn) · [SVG](operation-request-and-reservation.svg)

## Operaciones: alcance, actores y cadena verificada

El nuevo modelo reúne cuatro procesos de petición independientes sobre la misma operación: solicitud del demandante, decisión del oferente, cancelación del demandante y expiración del proceso automático. Sus lanes separan `Demandante`, `Oferente`, `Sistema` y `Proceso automático`; no interviene un proveedor externo. `POST /api/operations`, `GET /api/operations/mine`, `GET /api/operations/:id` y los POST `/:id/accept`, `/:id/reject`, `/:id/cancel` pasan por `operation.routes.js`, `auth.middleware.js`, `operation.controller.js`, `operation.service.js`, `operation.policy.js`, PostgreSQL, `appendAudit` y `enqueueOutboxEvent`. `expire-operations.js` ejecuta un lote manual/programable; no existe scheduler permanente. La vista `ProductDetail.jsx` solicita y `Operations.jsx` muestra/decide; el servidor vuelve a validar todo.

El mapa Graphify existente indica esta cadena pero fue construido sobre `92094444`; cada afirmación siguiente se contrastó con fuente actual hasta `fb7b047` y las pruebas de `operation-lifecycle.integration.test.js`, `phase3-migration.integration.test.js`, `operation-policy.test.js` y `decision-privacy.test.js`. `006_operations_reservations.sql` contiene la autoridad de estado y reservas. Cada tarea de escritura en el diagrama es tentativa hasta COMMIT; fallo de auditoría/outbox o constraint implica rollback. Los flujos de lectura privada no se dibujan como mutaciones de estado.

| Elemento BPMN | Tipo / hecho | Evidencia actual | Confianza |
|---|---|---|---|
| `Req_Start`, `Req_Input` | Inicio y userTask: solicitar términos | `operation.routes.js::POST /`; `ProductDetail.jsx::request` | Confirmada |
| `Req_Auth`, `Req_Denied` | Gateway/end: JWT, cuenta suspendida/no verificada | `auth.middleware.js::requireAuth/requireVerifiedAccount`; `operation.service.js::requestOperation` | Confirmada |
| `Req_Lock` | serviceTask: usuarios ordenados, publicación | `operation.service.js::requestOperation` | Confirmada |
| `Req_Self`, `Req_SelfEnd` | Gateway/end: self-request 400 | `operation.service.js::requestOperation` | Confirmada |
| `Req_Terms`, `Req_Invalid` | businessRule/end: invalid dates, versión, precio/garantía, estado | `operation.policy.js::parseOperationRequest/validateRequestedTerms`; `operation.service.js::requestOperation` | Confirmada |
| `Req_Save`, `Req_Effects`, `Req_Commit`, `Req_Rollback`, `Req_Pending` | serviceTask/gateway/ends: `Pendiente`, no snapshot/reservation/OTP; audit/outbox o rollback | `operation.service.js::transaction/requestOperation`; `006_operations_reservations.sql::operations_state_fields_check`; `operation-lifecycle.integration.test.js` | Confirmada |
| `Dec_Start`, `Dec_Input` | Inicio/userTask: aceptar o rechazar | `operation.routes.js::/:id/accept,/:id/reject`; `Operations.jsx::decide` | Confirmada |
| `Dec_Auth`, `Dec_Denied`, `Dec_Lock` | Gateway/ends/serviceTask: suspended actor, propietario vigente, locks ordenados | `auth.middleware.js`; `operation.service.js::decideOperation` | Confirmada |
| `Dec_Duplicate`, `Dec_Same`, `Dec_Stale` | Gateway/ends: duplicate same outcome sin efectos; opuesta/stale 409 | `operation.service.js::decideOperation`; `operation-lifecycle.integration.test.js` | Confirmada |
| `Dec_Expired`, `Dec_Expire`, `Dec_ExpiredEnd` | Gateway/serviceTask/end: expiración perezosa `Pendiente→Expirada` y 409 tras COMMIT | `operation.service.js::decideOperation/expireLockedOperation` | Confirmada |
| `Dec_Choice`, `Dec_Reject` | Gateway/serviceTask: rechazo con motivo `Pendiente→Rechazada`, sin reserva | `operation.policy.js::parseDecision/authorizeTransition`; `operation.service.js::decideOperation` | Confirmada |
| `Dec_Current`, `Dec_Invalidated` | Gateway/serviceTask: paused/edited publication → `Rechazada`, 409 tras commit | `operation.service.js::changedContract/decideOperation`; `publication.service.js::invalidateAffectedPendingOperations` | Confirmada |
| `Dec_Available`, `Dec_Conflict` | Gateway/end: concurrent incompatible acceptance 409, compatible continúa | `operation.service.js::hasReservationConflict/decideOperation`; `operation-lifecycle.integration.test.js` (100 Venta y 100 Alquiler, adyacentes) | Confirmada |
| `Dec_Accept`, `Dec_Constraint` | serviceTask/end: snapshot inmutable + reserva; DB unique/exclusion conflict 409 | `operation.service.js::decideOperation/reservationConstraint`; `006_operations_reservations.sql` | Confirmada |
| `Dec_Effects`, `Dec_Commit`, `Dec_Rollback`, `Dec_Accepted`, `Dec_Rejected` | serviceTask/gateway/ends: auditoría/outbox y COMMIT o rollback | `operation.service.js::transaction/decisionEffects`; `operation-lifecycle.integration.test.js` | Confirmada |
| `Can_Start`, `Can_Input`, `Can_Auth`, `Can_Denied`, `Can_Lock` | Inicio/userTask/gateway/end/serviceTask: cancelación del demandante vigente | `operation.routes.js::/:id/cancel`; `operation.service.js::cancelOperation` | Confirmada |
| `Can_Duplicate`, `Can_Same`, `Can_Stale`, `Can_Expired`, `Can_Expire`, `Can_ExpiredEnd` | Gateways/ends/serviceTask: repetición sin efectos, estado incompatible, expiración perezosa | `operation.service.js::cancelOperation/expireLockedOperation` | Confirmada |
| `Can_Stage`, `Can_Pending`, `Can_Release`, `Can_Reversal` | Gateway/serviceTasks: pending sin reserva; accepted sin economía → `Disponible`; estados avanzados → `Cancelación en reversión` y reserva retenida | `operation.policy.js::edges/authorizeTransition`; `operation.service.js::cancelOperation`; `006_operations_reservations.sql` | Confirmada |
| `Can_Effects`, `Can_Commit`, `Can_Rollback`, `Can_Cancelled`, `Can_ReversalEnd` | serviceTask/gateway/ends: efectos atómicos y estado final o seam | `operation.service.js::transaction/cancellationEffects/cancelOperation` | Confirmada |
| `Exp_Start`, `Exp_Claim`, `Exp_Found`, `Exp_Apply`, `Exp_Effects`, `Exp_Commit`, `Exp_Done`, `Exp_Empty`, `Exp_Rollback` | Proceso automático: one-shot batch, SKIP LOCKED, sin duplicación | `expire-operations.js`; `operation.service.js::expirePendingOperations/expireLockedOperation` | Confirmada |

Alternativas probadas: self-request, invalid dates y términos, suspended actor, paused/edited publication (`contract_changed`), stale/expired request, rejection, compatible/incompatible concurrent acceptance, DB constraint conflict, pre/post acceptance cancellation, reversal seam, duplicate action, audit/outbox rollback y missing scheduler/lazy expiry. El esquema usa intervalos `[inicio, fin)` y considera vivos únicamente `Bloqueo Provisional`, `Reservada/Bloqueada`, `Activa/En uso`. Por confirmar: programación operativa del comando, entrega real de eventos outbox y solución de reversión. La ruta heredada `/:id/confirm` sigue registrada pero ninguna solicitud de Fase 3 emite OTP ni llega a `Lista para entrega`; la entrega segura pertenece a otra fase.

Cada pool es un proceso independiente de petición dentro de Ranti; sus lanes distinguen actor y Sistema. No hay intercambio externo real: el simulador corre dentro de Sistema, sin pool externo ni message flow. Las distintas peticiones se relacionan mediante el estado persistido, no mediante sequence flows entre procesos. Una terminación pendiente exige otra petición para continuar. Las tareas de escritura son tentativas hasta el COMMIT indicado; errores de persistencia usan rollback. Las flechas representan orden de decisiones de negocio, no cada sentencia SQL o catch.

## Cadena verificada y actores

| Frontera | Fuente | Confianza |
|---|---|---|
| Prefijos HTTP | `server/src/app.js`: /api/auth, /api/users, /api/admin, /api/publications | Confirmada |
| Usuario: registro/confirmación | `server/src/routes/auth.routes.js` → `controllers/auth.controller.js::register/resend/confirm/login` → `modules/identity/identity.service.js`; `client/src/features/auth/Register.jsx`, `Login.jsx` | Confirmada |
| Sesión vigente | `server/src/middlewares/auth.middleware.js::requireAuth/requireVerifiedAccount/requireRole`: JWT, consulta users, Activa/Verificado y rol actual | Confirmada |
| Egresado: solicitud y perfil | `routes/user.routes.js` → `controllers/user.controller.js` → `modules/users/profile.service.js`, `role-review.service.js`; `client/src/features/dashboard/UserProfile.jsx` | Confirmada |
| Administrador: colas/decisión | `routes/user.routes.js::adminRoutes`, `routes/publication.routes.js::publicationAdminRoutes`; servicios revalidan rol; `client/src/features/dashboard/AdminDashboard.jsx::Review` | Confirmada |
| Usuario propietario: publicación | `routes/publication.routes.js` → `controllers/publication.controller.js` → `modules/publications/publication.service.js` → `risk.policy.js`; `client/src/features/publications/{CreatePublication,ManagePublications,PublicationForm}.jsx` | Confirmada |
| Sistema: PostgreSQL y efectos | `server/src/db/migrations/003_identity_publications.sql`, `004_publication_image_positions.sql`; `modules/audit/audit.repository.js::appendAudit`, `modules/outbox/outbox.repository.js::enqueueOutboxEvent` | Confirmada |
| Lectura pública | `publication.service.js::listPublications/getPublicPublication` → `client/src/features/catalog/{Home,ProductDetail}.jsx`: solo Activa, proyección segura | Confirmada |

Las rutas indicadas sin prefijo de carpeta en esta tabla están bajo `server/src/`. La cuenta nueva tiene rol Egresado; Estudiante requiere revisión manual. Administrador no es autoasignable. No hay recogida de DNI.

## Alternativas y límites comprobados

- Registro inválido por dominio/términos: 400; correo duplicado: 409. Cuenta pendiente se guarda antes del proveedor; indisponibilidad conserva la cuenta. Reenvío invalida desafíos previos.
- `IDENTITY_INVALID_CHALLENGE`: incorrecto, expirado, agotado, consumido/reutilizado o incongruente. Incorrecto/expirado confirman contabilidad y luego rechazan; caída durante confirmación hace rollback sin consumir intento. Verificación válida activa Egresado; fallo audit/outbox revierte estado y consumo.
- Evidencia de rol: HTTPS opaco con metadatos allowlist, no archivo binario. `ROLE_REQUEST_PENDING` protege duplicado pendiente. Cola privada requiere admin vigente y auditoría antes de revelar; titular ve su historial.
- Decisión de rol repetida con mismo outcome devuelve decisión existente, aunque motivo/admin difieran. Opuesta: 409. Tanto la respuesta inicial como la repetida excluyen `evidence_ref` y `evidence_metadata` mediante `publicDecision`; no duplican efectos. Aprobación cambia a Estudiante, rechazo conserva Egresado; fallo audit/outbox revierte ambos.
- Publicación nace Borrador; `draft-modality-unset` evita convertir el centinela Venta en elección del usuario. Solo Activa es pública. Envío valida modalidad/economía/fechas/textos y 1–4 imágenes HTTPS; migración 004 fija posición.
- `pilot-v1`: max(precio, garantía), centavos exactos. 499.99 → nivel 1; 500 y 999.99 → nivel 2; 1000 → nivel 3. S/500 exige revisión; S/1000 exige procedencia HTTPS. Falta de procedencia rechaza con 422 antes de publicar.
- Edición Activa y reactivación recalculan; editando Pausada se valida pero permanece Pausada; Borrador admite incompletitud. Edición idéntica no reinicia revisión.
- `PUBLICATION_CONFLICT`: operación fuera de Pendiente/Cancelada/Cerrada, estado imposible, decisión conflictiva o `submittedAt` obsoleto. Filas se bloquean y estado se reevalúa después de espera. Retirada terminal; repetir retiro retorna sin efectos.
- Revisión de publicación idéntica exige mismo administrador, motivo normalizado, resultado y envío; otro administrador recibe 409. Aprobación revalida requisitos; rechazo devuelve Borrador. `publicReviewDecision` excluye `provenance_evidence_ref` y otros campos privados tanto en respuesta inicial como repetida. En ambas familias, solo las colas administrativas revelan evidencia y auditan cada lectura antes de responder; el titular conserva acceso propio. Lectura de procedencia escribe auditoría sin outbox; fallo revierte accesos y oculta toda la cola.
- Todos los cambios efectivos de publicación confirman datos/imágenes/auditoría/outbox conjuntamente. En dibujos, gateway de COMMIT resume fallo de cualquiera de esos pasos; no implica que un error SQL pueda continuar dentro de una transacción abortada.

Por confirmar: alta operativa de administradores, gobierno de términos/proveedores, retención de evidencia, control de acceso del servidor remoto de referencias y despliegue del worker. No se modelan como capacidades disponibles. Sin proveedor real/SSO, correo, carga binaria, almacén privado de objetos o browser E2E. Hay productores outbox de identidad/decisión de rol/publicación; no scheduler/daemon ni productores para los flujos posteriores/notificaciones completas. Fases posteriores y RNF de aceptación pendientes.

## Ledger por elemento

Confianza **Confirmada** significa rama observada en código, contrastada con la suite de la familia. Las condiciones específicas y límites están en la documentación XML de cada nodo. Cada sequence flow hereda la evidencia del nodo de origen y documenta su condición; no hay atributos de trazabilidad personalizados. Datos sin asociación dibujada son inventario del proceso, no mensajes.



### identity-verification-and-role-review

#### Registration: Registro o reenvío de desafío

Prueba de familia: [server/test/identity.integration.test.js](../../server/test/identity.integration.test.js). Registro y reenvío terminan pendientes; confirmación empieza en otra petición. Errores SQL internos en issueChallenge revierten esa transacción, no el INSERT previo de cuenta.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `Registration_start` | startEvent: Petición register / resend | `server/src/modules/identity/identity.service.js::registerPendingAccount`; `server/src/modules/identity/identity.service.js::resendVerification` | Confirmada |
| `Registration_input` | userTask: Correo institucional y consentimiento | `server/src/modules/identity/identity.service.js::registrationInput`; `client/src/features/auth/Register.jsx::request` | Confirmada |
| `Registration_valid` | exclusiveGateway: ¿Entrada válida? | `server/src/modules/identity/identity.service.js::parse`; `server/src/modules/identity/identity.service.js::registrationInput` — Dominio UCSM/subdominio válido; términos true, versión y contraseña válida en registro. | Confirmada |
| `Registration_bad` | endEvent: Rechazo 400: dominio / términos / datos | `server/src/modules/identity/identity.service.js::parse` | Confirmada |
| `Registration_kind` | exclusiveGateway: ¿Registro o reenvío? | `server/src/modules/identity/identity.service.js::registerPendingAccount`; `server/src/modules/identity/identity.service.js::resendVerification` | Confirmada |
| `Registration_insert` | serviceTask: Guardar Egresado pendiente (autocommit) | `server/src/modules/identity/identity.service.js::registerPendingAccount` — La cuenta queda confirmada antes de solicitar desafío; duplicado 23505 => 409 IDENTITY_CONFLICT. | Confirmada |
| `Registration_insertResult` | exclusiveGateway: ¿Cuenta guardada? | `server/src/modules/identity/identity.service.js::registerPendingAccount` | Confirmada |
| `Registration_dup` | endEvent: Rechazo 409: correo duplicado | `server/src/modules/identity/identity.service.js::registerPendingAccount` | Confirmada |
| `Registration_dbError` | endEvent: Error 500 de persistencia | `server/src/modules/identity/identity.service.js::safeError`; `server/src/modules/identity/identity.service.js::transaction` | Confirmada |
| `Registration_issue` | serviceTask: BEGIN; bloquear cuenta e invalidar desafíos | `server/src/modules/identity/identity.service.js::issueChallenge`; `server/src/modules/identity/identity.service.js::canVerify` | Confirmada |
| `Registration_eligible` | exclusiveGateway: ¿Cuenta pendiente elegible? | `server/src/modules/identity/identity.service.js::canVerify`; `server/src/modules/identity/identity.service.js::issueChallenge` | Confirmada |
| `Registration_invalid` | endEvent: Rechazo 400; rollback desafío | `server/src/modules/identity/identity.service.js::issueChallenge`; `server/src/modules/identity/identity.service.js::invalidChallenge` | Confirmada |
| `Registration_provider` | serviceTask: Solicitar desafío simulado | `server/src/modules/identity/identity.service.js::issueChallenge`; `server/src/modules/identity/simulated-identity-provider.js::requestVerification` — Adaptador local: no intercambio de mensajes externo, SSO ni correo. | Confirmada |
| `Registration_available` | exclusiveGateway: ¿Proveedor disponible? | `server/src/modules/identity/identity.service.js::issueChallenge` | Confirmada |
| `Registration_unavailable` | endEvent: Pendiente 202: reenviar después | `server/src/modules/identity/identity.service.js::issueChallenge` — COMMIT de invalidación previa; cuenta pendiente conservada; verification_unavailable, retryable. Nuevo resend es otra petición. | Confirmada |
| `Registration_save` | serviceTask: Guardar hash, vencimiento e intentos; COMMIT | `server/src/modules/identity/identity.service.js::issueChallenge` | Confirmada |
| `Registration_saved` | exclusiveGateway: ¿Transacción confirmada? | `server/src/modules/identity/identity.service.js::transaction` | Confirmada |
| `Registration_pending` | endEvent: Pendiente: verification_pending | `server/src/modules/identity/identity.service.js::issueChallenge` — 201 registro / 200 reenvío; sin JWT. simulation_code solo si configuración explícita. | Confirmada |
| `Registration_error` | endEvent: Error 500: rollback del desafío | `server/src/modules/identity/identity.service.js::transaction` — La cuenta registrada antes sigue pendiente. | Confirmada |
| `Registration_data` | dataObjectReference: users / identity_challenges | `server/src/db/migrations/003_identity_publications.sql` — Hash; expiración diez minutos; máximo cinco intentos; consentimiento en users. | Confirmada |
#### Confirmation: Confirmación de identidad

Prueba de familia: [server/test/identity.integration.test.js](../../server/test/identity.integration.test.js). Las expiraciones y fallos de código son rechazos con contabilidad confirmada, no rollback de intentos.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `Confirmation_start` | startEvent: POST verification/confirm | `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
| `Confirmation_code` | userTask: Ingresar challengeId y seis dígitos | `server/src/modules/identity/identity.service.js::confirmationInput`; `client/src/features/auth/Register.jsx::request` | Confirmada |
| `Confirmation_checks` | exclusiveGateway: ¿Cuenta/desafío utilizables? | `server/src/modules/identity/identity.service.js::verifyPendingAccount` — Validación input; bloquear usuario antes de desafío; sent, registration, proveedor/email, intentos < máximo. | Confirmada |
| `Confirmation_invalid` | endEvent: Rechazo: reutilizado / agotado / inválido | `server/src/modules/identity/identity.service.js::verifyPendingAccount`; `server/src/modules/identity/identity.service.js::invalidChallenge` — 400 IDENTITY_INVALID_CHALLENGE; rollback sin activación. | Confirmada |
| `Confirmation_expiry` | exclusiveGateway: ¿Expirado antes de verificar? | `server/src/modules/identity/identity.service.js::verifyPendingAccount::expired` | Confirmada |
| `Confirmation_expire` | serviceTask: Persistir expired; COMMIT | `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
| `Confirmation_rejected` | endEvent: Rechazo 400: desafío expirado | `server/src/modules/identity/identity.service.js::verifyPendingAccount` — Rechazo fuera de transaction para conservar expiración. | Confirmada |
| `Confirmation_verify` | serviceTask: Verificar hash y resolver identidad simulada | `server/src/modules/identity/identity.service.js::verifyPendingAccount`; `server/src/modules/identity/simulated-identity-provider.js::verifyChallenge/resolveInstitutionalIdentity` | Confirmada |
| `Confirmation_result` | exclusiveGateway: ¿Resultado del proveedor? | `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
| `Confirmation_outage` | endEvent: Error 503: rollback; reintento permitido | `server/src/modules/identity/identity.service.js::unavailable`; `server/src/modules/identity/identity.service.js::transaction` — IDENTITY_UNAVAILABLE; no consume intentos. Reintentar confirmación o reenviar en otra petición. | Confirmada |
| `Confirmation_attempt` | serviceTask: Incrementar intento; quinto => failed; COMMIT | `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
| `Confirmation_wrong` | endEvent: Rechazo 400: código incorrecto | `server/src/modules/identity/identity.service.js::verifyPendingAccount` — Contador persiste; después del quinto incluso código correcto se rechaza. | Confirmada |
| `Confirmation_again` | exclusiveGateway: ¿Vencido tras resolver? | `server/src/modules/identity/identity.service.js::verifyPendingAccount::expired` | Confirmada |
| `Confirmation_activate` | serviceTask: Activa / Verificado; consumir; audit + outbox | `server/src/modules/identity/identity.service.js::verifyPendingAccount` — Dentro de una transacción; rol Egresado no cambia; identity.verified sin secretos. | Confirmada |
| `Confirmation_commit` | exclusiveGateway: ¿COMMIT y efectos correctos? | `server/src/modules/identity/identity.service.js::transaction`; `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
| `Confirmation_error` | endEvent: Error 500: rollback estado/audit/outbox | `server/src/modules/identity/identity.service.js::transaction` — Desafío permanece sent y cuenta sin verificar; se puede reintentar. | Confirmada |
| `Confirmation_success` | endEvent: Éxito: Egresado activo y JWT | `server/src/controllers/auth.controller.js::confirm` | Confirmada |
| `Confirmation_data` | dataObjectReference: users + desafío + audit_logs + outbox_events | `server/src/modules/identity/identity.service.js::verifyPendingAccount` | Confirmada |
#### RoleRequest: Solicitud de condición Estudiante

Prueba de familia: [server/test/profile-and-role-review.integration.test.js](../../server/test/profile-and-role-review.integration.test.js). GET de historial propio filtra user_id. No se infiere almacenamiento privado remoto ni recogida de DNI.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `RoleRequest_start` | startEvent: POST users/me/role-requests | `server/src/modules/users/role-review.service.js::requestStudentRole` | Confirmada |
| `RoleRequest_evidence` | userTask: Presentar referencia HTTPS y metadatos | `client/src/features/dashboard/UserProfile.jsx`; `server/src/modules/users/role-review.service.js::requestStudentRole` | Confirmada |
| `RoleRequest_validate` | exclusiveGateway: ¿Referencia y metadatos válidos? | `server/src/modules/users/role-review.service.js::requestStudentRole`; `server/src/modules/users/role-review.service.js::metadata`; `server/src/modules/users/profile.service.js::validHttpsReference` — Referencia opaca, no binario; cuatro strings allowlist; privacidad del destino remoto Por confirmar. | Confirmada |
| `RoleRequest_invalid` | endEvent: Rechazo 400: evidencia inválida | `server/src/modules/users/role-review.service.js::invalid`; `server/src/modules/users/role-review.service.js::metadata` | Confirmada |
| `RoleRequest_auth` | exclusiveGateway: ¿Egresado activo/verificado vigente? | `server/src/modules/users/role-review.service.js::requireCurrentUser`; `server/src/modules/users/role-review.service.js::requestStudentRole`; `server/src/middlewares/auth.middleware.js` | Confirmada |
| `RoleRequest_denied` | endEvent: Rechazo 401/403: acceso | `server/src/modules/users/role-review.service.js::requestStudentRole`; `server/src/middlewares/auth.middleware.js` | Confirmada |
| `RoleRequest_insert` | serviceTask: BEGIN; bloquear usuario; insertar pending | `server/src/modules/users/role-review.service.js::requestStudentRole` | Confirmada |
| `RoleRequest_result` | exclusiveGateway: ¿Inserción confirmada? | `server/src/modules/users/role-review.service.js::transaction`; `server/src/modules/users/role-review.service.js::requestStudentRole` | Confirmada |
| `RoleRequest_pending` | endEvent: Pendiente: revisión manual Estudiante | `server/src/modules/users/role-review.service.js::requestStudentRole` | Confirmada |
| `RoleRequest_duplicate` | endEvent: Rechazo 409: ROLE_REQUEST_PENDING | `server/src/modules/users/role-review.service.js::transaction` — Índice único parcial arbitra duplicados concurrentes. | Confirmada |
| `RoleRequest_error` | endEvent: Error 500: rollback solicitud | `server/src/modules/users/role-review.service.js::transaction` | Confirmada |
| `RoleRequest_data` | dataObjectReference: role_requests: referencia privada y metadatos | `server/src/modules/users/role-review.service.js::publicRequest`; `server/src/db/migrations/003_identity_publications.sql` — Acceso API propio o administrador; no escritura de auditoría/outbox al crear solicitud. | Confirmada |
#### RoleReview: Consulta y decisión de rol (peticiones independientes)

Prueba de familia: [server/test/profile-and-role-review.integration.test.js](../../server/test/profile-and-role-review.integration.test.js). GET y POST se autentican por separado. Rechazo académico es decisión exitosa rejected, distinta de rechazo HTTP. Auditoría de cola y decisión son transacciones distintas.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `RoleReview_start` | startEvent: GET cola / POST decisión | `server/src/modules/users/role-review.service.js::listPendingRoleRequests`; `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_action` | userTask: Consultar o decidir con motivo | `client/src/features/dashboard/AdminDashboard.jsx::Review` | Confirmada |
| `RoleReview_auth` | exclusiveGateway: ¿Administrador activo/verificado? | `server/src/modules/users/role-review.service.js::listPendingRoleRequests`; `server/src/modules/users/role-review.service.js::decideStudentRole`; `server/src/middlewares/auth.middleware.js` — Input/page/IDs/motivo inválidos 400; identidad del actor viene de sesión, no cuerpo. | Confirmada |
| `RoleReview_denied` | endEvent: Rechazo 400/401/403/404 | `server/src/modules/users/role-review.service.js::listPendingRoleRequests`; `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_kind` | exclusiveGateway: ¿Consulta o decisión? | `server/src/modules/users/role-review.service.js::listPendingRoleRequests`; `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_queue` | serviceTask: Leer pending; auditar cada evidencia; COMMIT | `server/src/modules/users/role-review.service.js::listPendingRoleRequests` — identity.role-request.evidence-read; no copiar referencia. | Confirmada |
| `RoleReview_queueResult` | exclusiveGateway: ¿Auditoría confirmada? | `server/src/modules/users/role-review.service.js::transaction`; `server/src/modules/users/role-review.service.js::listPendingRoleRequests` | Confirmada |
| `RoleReview_queueEnd` | endEvent: Éxito: cola privada (puede estar vacía) | `server/src/modules/users/role-review.service.js::listPendingRoleRequests` | Confirmada |
| `RoleReview_queueError` | endEvent: Error: rollback; sin revelar evidencia | `server/src/modules/users/role-review.service.js::transaction`; `server/src/modules/users/role-review.service.js::listPendingRoleRequests` | Confirmada |
| `RoleReview_locked` | serviceTask: BEGIN; bloquear usuarios por UUID y solicitud | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_status` | exclusiveGateway: ¿Estado y decisión? | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_same` | endEvent: Éxito: misma decisión, sin nuevos efectos | `server/src/modules/users/role-review.service.js::decideStudentRole`, `publicDecision` — Mismo outcome basta, aun si motivo/admin difieren; no se reescribe resultado ni se devuelve evidencia. | Confirmada |
| `RoleReview_conflict` | endEvent: Rechazo 409: decisión conflictiva | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_owner` | exclusiveGateway: ¿Solicitante sigue Egresado habilitado? | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_forbidden` | endEvent: Rechazo 403; rollback | `server/src/modules/users/role-review.service.js::decideStudentRole`; `server/src/modules/users/role-review.service.js::requireCurrentUser` | Confirmada |
| `RoleReview_decision` | exclusiveGateway: ¿Aprobar o rechazar? | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_approve` | serviceTask: pending → approved; Egresado → Estudiante | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_reject` | serviceTask: pending → rejected; conserva Egresado | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_effects` | serviceTask: Auditoría + outbox; COMMIT | `server/src/modules/users/role-review.service.js::decideStudentRole`; `server/src/modules/users/role-review.service.js::transaction` | Confirmada |
| `RoleReview_committed` | exclusiveGateway: ¿Efectos confirmados? | `server/src/modules/users/role-review.service.js::transaction` | Confirmada |
| `RoleReview_success` | endEvent: Éxito: aprobado; rol Estudiante | `server/src/modules/users/role-review.service.js::decideStudentRole`, `publicDecision` — Respuesta sin evidence_ref ni evidence_metadata. | Confirmada |
| `RoleReview_error` | endEvent: Error 500: rollback rol/decisión/efectos | `server/src/modules/users/role-review.service.js::transaction` | Confirmada |
| `RoleReview_data` | dataObjectReference: Solicitud, motivo privado, audit y outbox | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_outcome` | exclusiveGateway: ¿Resultado confirmado? | `server/src/modules/users/role-review.service.js::decideStudentRole` | Confirmada |
| `RoleReview_rejection` | endEvent: Decisión rechazada; conserva Egresado | `server/src/modules/users/role-review.service.js::decideStudentRole`, `publicDecision` — Respuesta sin evidence_ref ni evidence_metadata. | Confirmada |

### publication-risk-and-lifecycle

#### Draft: Crear publicación privada

Prueba de familia: [server/test/publication-lifecycle.integration.test.js](../../server/test/publication-lifecycle.integration.test.js). POST solo crea Borrador. Riesgo parcial no hace visible la publicación.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `Draft_start` | startEvent: POST publications | `server/src/modules/publications/publication.service.js::createPublication` | Confirmada |
| `Draft_input` | userTask: Guardar campos del borrador | `client/src/features/publications/CreatePublication.jsx`; `client/src/features/publications/PublicationForm.jsx` | Confirmada |
| `Draft_valid` | exclusiveGateway: ¿Entrada y cuenta válidas? | `server/src/modules/publications/publication.service.js::patchInput`; `server/src/modules/publications/publication.service.js::validateWindow`; `server/src/modules/publications/publication.service.js::actor`; `server/src/middlewares/auth.middleware.js` — Campos allowlist, dinero/fechas/HTTPS válidos, 0–4 imágenes, cuenta activa/verificada. Aún admite incompletitud. | Confirmada |
| `Draft_reject` | endEvent: Rechazo 400/401/403 | `server/src/modules/publications/publication.service.js::patchInput`; `server/src/modules/publications/publication.service.js::actor` | Confirmada |
| `Draft_save` | serviceTask: BEGIN; crear Borrador e imágenes ordenadas | `server/src/modules/publications/publication.service.js::createPublication`; `server/src/modules/publications/publication.service.js::images` — Centinelas textos vacíos y Venta interna; draft-modality-unset obliga selección explícita antes de enviar. | Confirmada |
| `Draft_effects` | serviceTask: Auditoría created + outbox; COMMIT | `server/src/modules/publications/publication.service.js::effects`; `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Draft_ok` | exclusiveGateway: ¿Transacción confirmada? | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Draft_pending` | endEvent: Pendiente: Borrador privado | `server/src/modules/publications/publication.service.js::createPublication`; `server/src/modules/publications/publication.service.js::listPublications`; `server/src/modules/publications/publication.service.js::getPublicPublication` — No visible en catálogo; detalle público 404. Titular lo consulta en /mine. | Confirmada |
| `Draft_error` | endEvent: Error 500: rollback borrador/imágenes/efectos | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Draft_data` | dataObjectReference: publications + publication_images [position 0–3] | `server/src/modules/publications/publication.service.js::images`; `server/src/db/migrations/004_publication_image_positions.sql` — Más de cuatro imágenes históricas hace fallar 004 atómicamente; operador corrige antes de reintentar. | Confirmada |
#### Risk: Enviar, reactivar o editar publicación activa

Prueba de familia: [server/test/publication-lifecycle.integration.test.js](../../server/test/publication-lifecycle.integration.test.js). La vista descompone stage para explicar política; ninguna transición se confirma hasta COMMIT. Riesgo y validación permanecen dentro de la transacción.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `Risk_start` | startEvent: submit / reactivate / PATCH Activa | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Risk_input` | userTask: Enviar o modificar condiciones | `client/src/features/publications/ManagePublications.jsx::mutate` | Confirmada |
| `Risk_auth` | exclusiveGateway: ¿Cuenta, propietario y datos válidos? | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::patchInput`; `server/src/controllers/publication.controller.js::lifecycle` | Confirmada |
| `Risk_denied` | endEvent: Rechazo 400/401/403/404 | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::patchInput` | Confirmada |
| `Risk_locks` | serviceTask: BEGIN; bloquear publicación y operaciones | `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::unblocked` — Operación fuera de Pendiente/Cancelada/Cerrada bloquea aun si cambió mientras se esperaba. | Confirmada |
| `Risk_state` | exclusiveGateway: ¿Estado / operación permite acción? | `server/src/modules/publications/publication.service.js::unblocked`; `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Risk_conflict` | endEvent: Rechazo 409 PUBLICATION_CONFLICT | `server/src/modules/publications/publication.service.js::conflict`; `server/src/modules/publications/publication.service.js::unblocked` | Confirmada |
| `Risk_noop` | endEvent: Éxito idempotente: sin efectos nuevos | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` — submit/reactivate ya Activa/Pendiente de revisión o PATCH idéntico; se comprueban operaciones antes. | Confirmada |
| `Risk_ready` | exclusiveGateway: ¿Modalidad/economía/fechas/imágenes completas? | `server/src/modules/publications/publication.service.js::validateReady`; `server/src/modules/publications/risk.policy.js::evaluatePublicationRisk` — Venta precio>0, garantía=0, sin fechas; Alquiler precio>0 y fechas; Préstamo precio=0 y fechas; 1–4 HTTPS, textos completos, modalidad explícita. | Confirmada |
| `Risk_invalid` | endEvent: Rechazo 422: corregir requisitos | `server/src/modules/publications/publication.service.js::validateReady`; `server/src/modules/publications/publication.service.js::incomplete` | Confirmada |
| `Risk_policy` | businessRuleTask: Calcular exposición max(precio, garantía), pilot-v1 | `server/src/modules/publications/risk.policy.js::evaluatePublicationRisk` — PEN, centavos exactos; 499.99 nivel 1, 500 y 999.99 nivel 2, 1000 nivel 3. | Confirmada |
| `Risk_threshold` | exclusiveGateway: ¿Exposición alcanza S/500? | `server/src/modules/publications/risk.policy.js::evaluatePublicationRisk` | Confirmada |
| `Risk_active` | serviceTask: Nivel 1 → Activa | `server/src/modules/publications/publication.service.js::stage` | Confirmada |
| `Risk_high` | exclusiveGateway: ¿Exposición alcanza S/1000? | `server/src/modules/publications/risk.policy.js::evaluatePublicationRisk` | Confirmada |
| `Risk_evidence` | exclusiveGateway: ¿Procedencia HTTPS válida? | `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `Risk_missing` | endEvent: Rechazo 422: falta procedencia | `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `Risk_pending` | serviceTask: Nivel 2 o 3 → Pendiente de revisión | `server/src/modules/publications/publication.service.js::stage` | Confirmada |
| `Risk_persist` | serviceTask: Nuevo submitted_at; limpiar revisión; audit/outbox | `server/src/modules/publications/publication.service.js::stage`; `server/src/modules/publications/publication.service.js::persist`; `server/src/modules/publications/publication.service.js::effects` — Edición activa recalcula y puede perder visibilidad; timestamp aumenta incluso en mismo milisegundo. | Confirmada |
| `Risk_commit` | exclusiveGateway: ¿COMMIT correcto? | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Risk_success` | endEvent: Éxito: Activa pública | `server/src/modules/publications/publication.service.js::stage`; `server/src/modules/publications/publication.service.js::listPublications`; `server/src/modules/publications/publication.service.js::getPublicPublication` | Confirmada |
| `Risk_error` | endEvent: Error 500: rollback datos/imágenes/efectos | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Risk_data` | dataObjectReference: Riesgo/versionado/envío + audit + outbox | `server/src/modules/publications/publication.service.js::stage`; `server/src/modules/publications/publication.service.js::effects` | Confirmada |
| `Risk_outcome` | exclusiveGateway: ¿Estado confirmado? | `server/src/modules/publications/publication.service.js::stage` | Confirmada |
| `Risk_pendingEnd` | endEvent: Pendiente de revisión; no pública | `server/src/modules/publications/publication.service.js::stage` | Confirmada |
#### Lifecycle: Pausar, retirar o editar borrador/pausada

Prueba de familia: [server/test/publication-lifecycle.integration.test.js](../../server/test/publication-lifecycle.integration.test.js). Pausing hides publication immediately after commit. Estado privado no significa que el servidor remoto de imágenes/evidencia sea privado. Reactivación es otra petición, modelada en Risk.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `Lifecycle_start` | startEvent: pause / withdraw / PATCH | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_input` | userTask: Confirmar acción o editar | `client/src/features/publications/ManagePublications.jsx::ask/mutate` | Confirmada |
| `Lifecycle_auth` | exclusiveGateway: ¿Cuenta/titular/datos válidos? | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::patchInput` | Confirmada |
| `Lifecycle_denied` | endEvent: Rechazo 400/401/403/404 | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::patchInput` | Confirmada |
| `Lifecycle_terminal` | exclusiveGateway: ¿Ya Retirada? | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_terminalDecision` | exclusiveGateway: ¿Repetir withdraw? | `server/src/modules/publications/publication.service.js::lifecycle` | Confirmada |
| `Lifecycle_noop` | endEvent: Éxito idempotente | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_conflict` | endEvent: Rechazo 409; sin cambios | `server/src/modules/publications/publication.service.js::conflict`; `server/src/modules/publications/publication.service.js::unblocked` | Confirmada |
| `Lifecycle_locks` | serviceTask: BEGIN; bloquear y comprobar operaciones | `server/src/modules/publications/publication.service.js::unblocked` — Estados permitidos: Pendiente, Cancelada, Cerrada. Retirada+withdraw retorna antes de comprobar operaciones. | Confirmada |
| `Lifecycle_permitted` | exclusiveGateway: ¿Acción/estado sin operación bloqueante? | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_action` | exclusiveGateway: ¿Acción solicitada? | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_pause` | serviceTask: Activa → Pausada | `server/src/modules/publications/publication.service.js::lifecycle` | Confirmada |
| `Lifecycle_withdraw` | serviceTask: Estado no retirado → Retirada | `server/src/modules/publications/publication.service.js::lifecycle` — Retirada terminal; no reactivación posterior. | Confirmada |
| `Lifecycle_edit` | serviceTask: Editar Borrador o Pausada; recalcular riesgo | `server/src/modules/publications/publication.service.js::updatePublication` — Borrador admite incompletitud; Pausada exige validateReady y sigue Pausada. Editar Activa se modela en Risk. | Confirmada |
| `Lifecycle_valid` | exclusiveGateway: ¿Edición válida o sin cambio? | `server/src/modules/publications/publication.service.js::updatePublication` | Confirmada |
| `Lifecycle_invalid` | endEvent: Rechazo 400/422: conserva estado | `server/src/modules/publications/publication.service.js::validateWindow`; `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `Lifecycle_persist` | serviceTask: Persistir estado/imágenes; audit + outbox | `server/src/modules/publications/publication.service.js::persist`; `server/src/modules/publications/publication.service.js::images`; `server/src/modules/publications/publication.service.js::effects` | Confirmada |
| `Lifecycle_commit` | exclusiveGateway: ¿COMMIT correcto? | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `Lifecycle_success` | endEvent: Éxito: estado privado guardado | `server/src/modules/publications/publication.service.js::lifecycle`; `server/src/modules/publications/publication.service.js::updatePublication`; `server/src/modules/publications/publication.service.js::getPublicPublication` | Confirmada |
| `Lifecycle_error` | endEvent: Error 500: rollback completo | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
#### PublicationReview: Cola y decisión administrativa de publicación

Prueba de familia: [server/test/publication-lifecycle.integration.test.js](../../server/test/publication-lifecycle.integration.test.js). GET y POST separados: cada uno autentica y confirma su propia transacción. Rechazo de contenido devuelve Borrador como resultado exitoso de la decisión.

| ID | Tipo / significado | Evidencia (archivo::símbolo) | Confianza |
|---|---|---|---|
| `PublicationReview_start` | startEvent: GET reviews / POST review | `server/src/modules/publications/publication.service.js::listPendingPublicationReviews`; `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_input` | userTask: Consultar o decidir con motivo/submittedAt | `client/src/features/dashboard/AdminDashboard.jsx::Review` | Confirmada |
| `PublicationReview_auth` | exclusiveGateway: ¿Admin vigente y entrada válida? | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::decidePublicationReview`; `server/src/modules/publications/publication.service.js::listPendingPublicationReviews`; `server/src/middlewares/auth.middleware.js` | Confirmada |
| `PublicationReview_denied` | endEvent: Rechazo 400/401/403/404 | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_kind` | exclusiveGateway: ¿Consulta o decisión? | `server/src/modules/publications/publication.service.js::listPendingPublicationReviews`; `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_queue` | serviceTask: Leer Pendiente de revisión; auditar referencias; COMMIT | `server/src/modules/publications/publication.service.js::listPendingPublicationReviews` — publication.evidence.viewed por fila con referencia; solo auditoría, sin evento outbox de lectura. | Confirmada |
| `PublicationReview_queueOk` | exclusiveGateway: ¿Auditoría confirmada? | `server/src/modules/publications/publication.service.js::transaction`; `server/src/modules/publications/publication.service.js::listPendingPublicationReviews` | Confirmada |
| `PublicationReview_queueEnd` | endEvent: Éxito: cola privada (incluye vacía) | `server/src/modules/publications/publication.service.js::listPendingPublicationReviews` | Confirmada |
| `PublicationReview_queueError` | endEvent: Error: rollback accesos; no revelar filas | `server/src/modules/publications/publication.service.js::transaction`; `server/src/modules/publications/publication.service.js::listPendingPublicationReviews` | Confirmada |
| `PublicationReview_lock` | serviceTask: BEGIN; bloquear admin y publicación | `server/src/modules/publications/publication.service.js::actor`; `server/src/modules/publications/publication.service.js::locked`; `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_stamp` | exclusiveGateway: ¿submittedAt coincide con envío actual? | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_stale` | endEvent: Rechazo 409: envío obsoleto | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_status` | exclusiveGateway: ¿Pendiente o repetición exacta? | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_same` | endEvent: Éxito: repetición sin efectos | `server/src/modules/publications/publication.service.js::decidePublicationReview`, `publicReviewDecision` — Requiere mismo outcome, admin, motivo normalizado y submittedAt; otro administrador recibe 409. Respuesta sin evidencia; no duplica efectos. | Confirmada |
| `PublicationReview_conflict` | endEvent: Rechazo 409: decisión / operación conflictiva | `server/src/modules/publications/publication.service.js::decidePublicationReview`; `server/src/modules/publications/publication.service.js::unblocked` | Confirmada |
| `PublicationReview_unblocked` | exclusiveGateway: ¿Sin operación bloqueante? | `server/src/modules/publications/publication.service.js::unblocked` | Confirmada |
| `PublicationReview_decision` | exclusiveGateway: ¿approve o reject? | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_approve` | serviceTask: Revalidar requisitos; Activa | `server/src/modules/publications/publication.service.js::decidePublicationReview`; `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `PublicationReview_valid` | exclusiveGateway: ¿Aprobación válida? | `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `PublicationReview_invalid` | endEvent: Rechazo 422: requisitos/procedencia | `server/src/modules/publications/publication.service.js::validateReady` | Confirmada |
| `PublicationReview_reject` | serviceTask: Pendiente de revisión → Borrador | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_effects` | serviceTask: Guardar revisión; auditoría + outbox | `server/src/modules/publications/publication.service.js::decidePublicationReview`; `server/src/modules/publications/publication.service.js::persist`; `server/src/modules/publications/publication.service.js::effects` | Confirmada |
| `PublicationReview_commit` | exclusiveGateway: ¿COMMIT correcto? | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `PublicationReview_success` | endEvent: Éxito: aprobación Activa | `server/src/modules/publications/publication.service.js::decidePublicationReview`, `publicReviewDecision` — Respuesta sin provenance_evidence_ref ni otros campos privados de evidencia. | Confirmada |
| `PublicationReview_error` | endEvent: Error 500: rollback decisión/efectos | `server/src/modules/publications/publication.service.js::transaction` | Confirmada |
| `PublicationReview_data` | dataObjectReference: Referencia privada, submitted_at, revisión | `server/src/modules/publications/publication.service.js::decidePublicationReview`; `server/src/modules/publications/publication.service.js::listPendingPublicationReviews` | Confirmada |
| `PublicationReview_outcome` | exclusiveGateway: ¿Decisión confirmada? | `server/src/modules/publications/publication.service.js::decidePublicationReview` | Confirmada |
| `PublicationReview_rejection` | endEvent: Rechazada: Borrador para corrección | `server/src/modules/publications/publication.service.js::decidePublicationReview`, `publicReviewDecision` — Respuesta sin provenance_evidence_ref ni otros campos privados de evidencia. | Confirmada |

## Validación y render reproducibles

Con las herramientas de la skill instaladas, desde la raíz:

```powershell
node "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\validate-bpmn.mjs" docs/bpmn/identity-verification-and-role-review.bpmn
node "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\validate-bpmn.mjs" docs/bpmn/publication-risk-and-lifecycle.bpmn
node "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\validate-bpmn.mjs" docs/bpmn/operation-request-and-reservation.bpmn
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\render-bpmn.ps1" -InputPath docs/bpmn/identity-verification-and-role-review.bpmn -OutputPath docs/bpmn/identity-verification-and-role-review.svg
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\render-bpmn.ps1" -InputPath docs/bpmn/publication-risk-and-lifecycle.bpmn -OutputPath docs/bpmn/publication-risk-and-lifecycle.svg
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agents\skills\bpmn-process-review\scripts\render-bpmn.ps1" -InputPath docs/bpmn/operation-request-and-reservation.bpmn -OutputPath docs/bpmn/operation-request-and-reservation.svg
```

El validador usa bpmn-moddle; el render requiere bpmn-to-image. Verificación 2026-10-01: el archivo nuevo de Fase 3 devolvió `OK` (4 procesos, 1 diagrama), sin advertencias; su SVG se generó y una vista PNG derivada se inspeccionó. Los dos archivos de Fase 2 fueron validados y renderizados el 2026-09-30. Los tests de trazabilidad comprueban namespaces, IDs únicos, DI para nodos/flujos y documentación. Gate completo y conteos frescos en el [README principal](../../README.md).
