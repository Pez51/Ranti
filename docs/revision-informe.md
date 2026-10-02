# Revisión del informe — estado verificado hasta Fase 3

Actualizado el 2026-10-01 sobre código hasta `fb7b047` y la verificación de Fase 3. Esta matriz sustituye afirmaciones históricas del diagnóstico inicial, conservado en Git. Código/pruebas prevalecen sobre Graphify desactualizado. [Comandos y operación](../README.md); [BPMN y ledger](bpmn/README.md).

## Alcance implementado

“Implementado en simulación” no acredita identidad real ante UCSM ni completa todo el informe. Registro institucional para estudiantes/egresados, sin DNI, sin SSO real y sin envío de correo. Rol inicial Egresado; Estudiante por revisión manual. Evidencia como referencia HTTPS opaca, sin carga binaria ni almacén privado.

| RF | Estado | Evidencia y límite |
|---|---|---|
| RF-01 Registro estudiante | Implementado en simulación | `identity.service.js::registerPendingAccount/verifyPendingAccount`, `Register.jsx`: consentimiento, dominio, cuenta pendiente; Estudiante solo tras revisión. |
| RF-02 Acceso egresado | Implementado en simulación | `auth.controller.js::login`, `identity-provider.js`: Egresado por defecto con correo institucional, sin alternativa por correo personal. |
| RF-03 Perfil | Implementado en alcance Fase 2 | `profile.service.js`, `UserProfile.jsx`: nombre, avatar HTTPS, facultad; universidad fija y métricas protegidas. |
| RF-04 Identidad | Implementado en simulación | `identity.service.js`, `simulated-identity-provider.js`: hash, expiración, cinco intentos, consumo único, rollback; sin proveedor real. |
| RF-05 Condición académica | Implementado en alcance Fase 2 | `role-review.service.js`, `publicProfile`: derivada del rol vigente, evidencia privada, cola auditada, aprobación/rechazo y concurrencia. |
| RF-06 Publicar bien | Implementado en alcance Fase 2 | `createPublication/submitPublication`, `CreatePublication.jsx`: Borrador, validación y envío antes de visibilidad. |
| RF-07 Modalidad/disponibilidad | Implementado en alcance Fases 2–3 | `risk.policy.js`, `operation.policy.js`: Venta/Alquiler/Préstamo, economía, fechas e intervalos semiabiertos; entrega pendiente. |
| RF-08 Riesgo | Implementado en alcance Fase 2 | `evaluatePublicationRisk/stage/decidePublicationReview`: pilot-v1, exposición máxima precio/garantía, S/500 revisión y S/1000 procedencia. |
| RF-09 Buscar/filtrar | Implementado en alcance Fase 2 | `listPublications/getPublicPublication`, `Home.jsx/ProductDetail.jsx`: filtros combinables, público solo Activa. |
| RF-21 Editar publicación | Implementado en alcance Fase 2 | `updatePublication`, `ManagePublications.jsx`: propietario, estados y campos permitidos, conflicto por operación. |
| RF-22 Precio/garantía | Implementado en alcance Fase 2 | `updatePublication/stage`: recalcula riesgo e invalida revisión anterior; Activa puede pasar a revisión. |
| RF-23 Pausar/retirar | Implementado en alcance Fase 2 | `lifecycle`: pausa, reactivación reevaluada, Retirada terminal, idempotencia y rollback. |
| RF-10 Solicitar operación | Implementado en alcance Fase 3 | `requestOperation`, `ProductDetail.jsx`: `Pendiente` con términos y vencimiento; sin snapshot, reserva, pago ni OTP. Economía pendiente. |
| RF-11 Aceptar/rechazar | Implementado en alcance Fase 3 | `decideOperation`, `Operations.jsx`: solo titular vigente, rechazo con motivo, aceptación atómica; `Pendiente de pago/garantía` y pago posterior aún no alcanzables desde Fase 3. |
| RF-12 Solapamientos | Implementado en alcance Fase 3 | Migración 006 y `operation-lifecycle.integration.test.js`: índice de venta, exclusión `[inicio, fin)`, prueba de 100 aceptaciones incompatibles en Venta/Alquiler; carga operativa pendiente. |
| RF-24 Snapshot | Implementado en alcance Fase 3 | `buildContractSnapshot`, trigger de `contract_version`: se congela al aceptar, no al solicitar; etapas económicas pendientes. |
| RF-25 Cancelar | Implementado preentrega en Fase 3 | `cancelOperation`: `Pendiente` y `Aceptada` sin economía terminan `Cancelada`; cancelación tras pago/reversión final pendiente. |
| RF-26 Bloquear edición activa | Implementado en alcance Fase 3 | `publication.service.js::unblocked`, invalidación pendiente y locks: aceptada bloquea edición/pausa; edición contractual rechaza solicitudes aún pendientes. |
| RF-28 Liberar reservas | Implementado preentrega en Fase 3 | `cancelOperation` libera reserva `Aceptada` sin movimiento; liberación tras reversión/cierre pendiente. |

Rutas/middleware: `server/src/routes/{auth,user,publication,operation}.routes.js`, `auth.middleware.js`; controladores delegan a `server/src/modules/{identity,users,publications,operations}`. Persistencia: migraciones 003–006. Pruebas reales: `identity.integration.test.js`, `profile-and-role-review.integration.test.js`, `publication-lifecycle.integration.test.js`, `operation-lifecycle.integration.test.js`, `phase3-migration.integration.test.js`. Ledger BPMN enlaza cada elemento y sus excepciones con símbolos/pruebas.

## Fases posteriores

Pendiente significa RF completo pendiente; fundamentos y controles parciales no lo completan.

| RF | Estado | Brecha |
|---|---|---|
| RF-13 Pago/garantía | Pendiente | Sin economía completa ni proveedor; no dinero real. |
| RF-14 Entrega/recepción | Pendiente | API parcial exige Lista para entrega; OTP y confirmaciones completas pendientes. |
| RF-15 Devolución/cierre | Pendiente | Sin flujo completo. |
| RF-16 Calificación | Pendiente | Sin flujo completo. |
| RF-17 Confianza | Pendiente | Métricas leídas, sin motor de reputación completo. |
| RF-18 Incidencia | Pendiente | Sin resolución completa. |
| RF-19 Moderación | Pendiente | Revisiones de roles/publicaciones no completan moderación general. |
| RF-20 Notificaciones | Pendiente | Lectura/marcado/frontera de creación; sin scheduler ni productores completos. |
| RF-27 Eventos alquiler | Pendiente | Sin ciclo completo. |
| RF-29 Reversión/reembolso | Pendiente | Sin economía completa. |
| RF-30 Auditoría | Pendiente | Fase 2 registra efectos atómicos; faltan fases posteriores. |
| RF-31 ARCO | Pendiente | Sin flujo completo de derechos. |
| RF-32 Reportar usuario | Pendiente | Sin reporte/moderación completos. |

## Operación y límites

Cuenta pendiente se confirma antes de pedir desafío; una caída del proveedor no la elimina. Verificación válida, decisiones de rol, mutaciones de publicación y operaciones comparten transacción con auditoría/outbox. Intentos incorrectos y expiración sí se confirman antes de rechazar. Cola administrativa no revela datos si falla auditoría. La API no controla privacidad del servidor remoto de evidencia.

`npm run migrate --prefix server` aplica 001–006. Base histórica 001 necesita adopción explícita respaldada. `004_publication_image_positions.sql` falla atómicamente con más de cuatro imágenes históricas por publicación. 005 agrega estados en un commit separado; 006 requiere permiso para `btree_gist`, bloquea las tablas de publicaciones/operaciones/reservas en `SHARE ROW EXCLUSIVE` y falla ante datos heredados ambiguos o reservas incompatibles. El operador respalda y reconcilia antes de reintentar; no hay limpieza automática. `OPERATION_REQUEST_TTL_HOURS` usa 48 horas por defecto, rango 1–168. El comando `npm run expire:operations --prefix server` ejecuta un lote de hasta 100; la expiración perezosa al decidir/cancelar cubre la falta de scheduler, no actualiza filas nunca visitadas.

Sin browser E2E: React simula API; integración servidor usa PostgreSQL temporal y cada suite destructiva/productora posee una base privada para evitar interferencia paralela. No hay scheduler/daemon de outbox ni productores para notificaciones completas; sí eventos transaccionales de identidad/rol/publicación/operación. No hay dinero real ni pagos simulados ejecutados en Fase 3. La ruta heredada de confirmación de entrega existe, pero ninguna solicitud de Fase 3 emite OTP ni llega a `Lista para entrega`; OTP y entrega seguros siguen pendientes. Por confirmar: alta operativa de administradores, retención/almacenamiento de evidencia, gobierno de términos/proveedores, programación de expiración y despliegue del worker.

## Requisitos no funcionales

Sin mediciones de piloto, SUS ni aceptación RNF inventada.

| RNF | Evidencia y pendiente |
|---|---|
| RNF-01 Rendimiento | Sin carga de aceptación/p95 demostrado. |
| RNF-02 Integridad | Fase 3: 100 aceptaciones incompatibles de Venta y 100 de Alquiler confirman una reserva por grupo, 99 conflictos, con snapshot/efectos ausentes en perdedores; aceptación de carga y operación más amplia pendiente. |
| RNF-03 Disponibilidad | Sin piloto de siete días ni medición. |
| RNF-04 Seguridad | Autorización/validaciones/desafíos; falta evaluación integral/proveedor real. |
| RNF-05 Privacidad | Proyecciones y acceso auditado; sin almacén privado ni política validada. |
| RNF-06 Usabilidad | Sin SUS con usuarios. |
| RNF-07 Compatibilidad | Build genera service worker; instalación/navegadores pendientes. |
| RNF-08 Testabilidad | Suites automatizadas; comandos y conteos frescos en README. |
| RNF-09 Auditoría | Cobertura hasta Fase 3; economía, entrega y gobierno pendientes. |
| RNF-10 Recuperación | Sin respaldo/restauración de aceptación demostrados. |

Resultados frescos en README; no se reutilizan conteos históricos. Plan/especificación y grafo obsoleto permanecen sin modificar.
