# Ranti: brechas entre el informe y el repositorio

Revisión del commit `3d87e3c` frente al [Informe del Capítulo 1](C:/Users/giacc/OneDrive/Documentos/ChatGPT/Ranti/output/markdown/Informe_Capitulo_1_Ranti/Informe_Capitulo_1_Ranti.md), especialmente sus secciones 1.11.1, 1.11.2 y 1.11.5. El estado de las correcciones aparece primero; el diagnóstico histórico se conserva debajo para mantener trazabilidad. Los diagramas originales están en [procesos](processes/ranti/index.md).

## Estado de las correcciones — 2026-09-28

| Hallazgo inicial | Estado comprobado en el código corregido |
|---|---|
| 1. Rol de registro | Corregido: solo se admite `Estudiante` en el registro público. |
| 2. Columna de publicaciones | Corregido: lectura, filtro e inserción usan `category`; comprobado con la migración real. |
| 3. Transacciones abiertas | Corregido: rechazo por dueño o solapamiento revierte antes de liberar la conexión. |
| 4. Éxito simulado en pago | Mitigado: se retiraron formularios de tarjeta, importes fijos y éxito ficticio del checkout. La API rechaza entrega desde `Pendiente de pago/garantía`. El servicio de pagos sigue pendiente. |
| 5. OTP | Parcial: generación criptográfica, consumo de un solo uso, bloqueo de fila y actualización transaccional de reserva/auditoría. La pantalla ya no usa `849201`. Faltan hash en reposo, caducidad, límite de intentos, emisión en el momento correcto y confirmaciones bilaterales. La pantalla de entrega permanece deshabilitada. |
| 6. Cuenta y verificación | Parcial: cada petición protegida consulta cuenta/rol vigentes. Se bloquean usuarios suspendidos/eliminados. Publicar, reservar y confirmar entrega exige cuenta `Activa` y `Verificado`. Falta el flujo que verifica identidad y condición académica. |
| 7–8. Estado y fechas de reserva | Se rechazan publicaciones no activas, identificadores/fechas inválidos, intervalos vacíos o invertidos y fechas de reserva en ventas. No quedan transacciones abiertas tras esos rechazos. Siguen pendientes aceptación/rechazo, cancelación y restricciones de integridad en la base de datos. |
| 10. Datos del detalle público | Corregido: solo publicaciones activas y selección explícita sin correo ni identificador interno del oferente. |
| 11. Interfaces desconectadas | Parcialmente corregido: login, sesión, notificaciones, creación, catálogo y detalle de publicaciones consumen la API real. Reclamos, ARCO, perfil y paneles todavía contienen flujos o datos locales. |
| 15. Calidad | Fase 1: 65 pruebas servidor aprobadas sin PostgreSQL y 68 omitidas; 133/133 con PostgreSQL temporal; cliente 7/7, lint y build correctos. No equivale a aceptación de todos los RF/RNF. |
| 16. Arranque sin base de datos | Corregido: el error de conexión se propaga e impide iniciar el listener. |
| 17. README | Corregidas migración, comandos, formato y credencial de ejemplo. Se documenta la ejecución reproducible de pruebas. |

Las pruebas reales se ejecutan con `tools/test-postgres.ps1`, que crea y elimina una instancia temporal independiente. Incluyen dos reservas concurrentes, dos confirmaciones de entrega concurrentes, ausencia de transacciones abiertas y rollback completo cuando falla la auditoría; no sustituyen la prueba de 100 reservas del RNF-02. Se verificaron ambas pantallas de indisponibilidad en el navegador.

No hay todavía una ruta de negocio que habilite `Lista para entrega` después de una aceptación y validación económica. Tampoco están completos el registro/verificación desde el cliente, las confirmaciones bilaterales, el cierre, la verificación académica o la gestión económica. Las solicitudes desde el detalle permanecen deshabilitadas hasta definir esa máquina de estados. No usar este prototipo para operaciones reales. Los BPMN y el grafo corresponden al commit inicial y deben regenerarse cuando se estabilice el flujo completo.

### Fase 1 — fundamentos verificados el 2026-09-28

| Frontera implementada | Evidencia y límite |
|---|---|
| Rutas protegidas | Guardas de sesión y rol administrador, sesión corrupta y cambios de sesión cubiertos por 7 pruebas cliente. No implementa identidad ni perfiles. |
| Configuración y errores | Configuración validada y congelada, JWT de al menos 32 caracteres fuera de pruebas, autorización por rol y UUID generado por petición. El formato normalizado cubre el middleware final, 404 y JSON malformado; las respuestas explícitas heredadas se conservan. |
| Migraciones | Runner incremental con SHA-256, bloqueo advisory, transacciones por archivo, rechazo de checksum alterado y adopción explícita de una línea base compatible. `001_init.sql` conserva su contenido histórico; LF se fija con Git. |
| Auditoría | `appendAudit` acepta cliente transaccional, snapshots de objeto o NULL y metadatos; el trigger rechaza UPDATE/DELETE normales. Rechaza claves sensibles anidadas antes de persistir. No implica cobertura de auditoría en todos los RF. |
| Outbox | Deduplicación de inserciones concurrentes, reclamación atómica con `FOR UPDATE SKIP LOCKED`, lease recuperable y comprobación del propietario al completar/fallar. Handler exitoso confirma una vez la fila; fallo y evento desconocido reintentan con backoff de 60 segundos iniciales hasta una hora y diagnóstico fijo sanitizado. |
| Notificaciones | `createInAppNotification(db, payload)` devuelve la fila insertada y puede enlazarse como handler. Lectura y marcado propios permanecen. No hay productores/scheduler activos ni cobertura completa de RF-20. |

Los handlers se ejecutan después de la reclamación; `processOutboxBatch` requiere un Pool o Client en autocommit. Los repositorios aceptan clientes de transacciones del llamador para que negocio, auditoría y encolado se confirmen juntos. Todos los reclamadores deben usar la misma duración de lease (60 segundos por defecto) e identificadores de worker únicos entre ejecuciones concurrentes. No hay heartbeat de leases: un efecto lento o una caída entre el efecto y la confirmación puede repetirse. La garantía de efectos es al menos una vez y exige handlers idempotentes; la deduplicación del encolado no deduplica por sí sola notificaciones u otros efectos. El rechazo de secretos se basa en claves (`password`, `token`, `otp`, `pan`, `cvv`), no en clasificación de texto libre.

Comandos ejecutados desde la raíz:

| Comando | Resultado exacto |
|---|---|
| `npm test --prefix server` | 65 aprobadas + 68 omitidas; 7 archivos aprobados + 4 omitidos. |
| `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1` | 133 aprobadas en 11 archivos, 0 omitidas; instancia detenida y directorio temporal eliminado. |
| `npm test --prefix client` | 7 aprobadas en 1 archivo. |
| `npm run lint --prefix client` | Salida 0. |
| `npm run build --prefix client` | Salida 0, frontend y service worker generados. |
| `git diff --check` | Sin errores. |

Arranque: configurar `server/.env`, ejecutar `npm run migrate --prefix server` y `npm run dev` desde la raíz; `npm start --prefix server` inicia solo la API. Para una base creada manualmente con la línea base compatible, ejecutar explícitamente `npm run migrate --prefix server -- --adopt-baseline` después de respaldarla. El arranque no migra automáticamente. Las condiciones de adopción y los checksums están documentados en el [README](../README.md).

Permanecen pendientes las fases posteriores y sus RF: identidad, roles académicos, perfiles, riesgo y edición de publicaciones, solicitudes/aceptación/cancelación, economía simulada, OTP seguro y cierre, reputación, incidencias, moderación, ARCO y notificaciones completas. Tampoco se declara cumplimiento de rendimiento, 100 reservas concurrentes, disponibilidad, SUS, instalación PWA o recuperación. No se procesa dinero real.

## Diagnóstico inicial (commit `3d87e3c`)

Los hallazgos y matrices siguientes describen exclusivamente el punto de partida. Para el código modificado, prevalece la tabla de estado anterior.

El repositorio es un prototipo visual con una API inicial. La API tiene registro, login, lectura y creación de publicaciones, creación de operación, confirmación de entrega y lectura de notificaciones. La mayoría de las pantallas no consume esa API. La migración tiene diez tablas, pero disponer de una tabla no implementa el caso de uso asociado.

### P0: corregir antes de probar transacciones reales

1. **Escalada de rol en el registro.** `register` recibe `role` del cuerpo y lo inserta sin restringirlo. El enum permite `Administrador`, por lo que un solicitante puede registrar ese rol y obtenerlo en el JWT. Restringir la asignación de roles en servidor y crear administradores mediante un procedimiento controlado. Fuentes: `server/src/controllers/auth.controller.js:6-35`, `server/src/db/migrations/001_init.sql:5`.
2. **Migración incompatible con el controlador.** La tabla `publications` define `category`; las consultas y el `INSERT` del controlador usan `faculty_category`. El catálogo y la publicación fallan con el esquema entregado. Unificar nombre mediante una nueva migración y pruebas de integración. Fuentes: `server/src/db/migrations/001_init.sql:42-57`, `server/src/controllers/publication.controller.js:9-35,95-100`.
3. **Transacción de reserva sin cierre en dos rechazos.** `createOperation` ejecuta `BEGIN`, adquiere `FOR UPDATE` y luego responde 400 si el usuario es el dueño o 409 si hay solapamiento. En ambos caminos omite `ROLLBACK` y libera el cliente. El bloqueo o estado transaccional puede persistir en la conexión del pool. Convertir rechazos en errores capturados o revertir explícitamente antes de responder. Fuentes: `server/src/controllers/operation.controller.js:11-39,87-95`.
4. **Pago y custodia representados como si fueran reales.** `Checkout.jsx` usa `setTimeout` y navega a entrega; no crea una transacción ni recibe confirmación de proveedor. La API deja confirmar entrega desde `Pendiente de pago/garantía`. El informe RF-13/14/15 exige resolución económica y estados consistentes. Retirar mensajes de éxito simulado o marcarlos como demo hasta integrar el flujo elegido. Fuentes: `client/src/features/operations/Checkout.jsx:11-20`, `server/src/controllers/operation.controller.js:116-129`.
5. **OTP inseguro e inconsistente entre capas.** El cliente acepta y muestra `849201`; el servidor genera otro código con `Math.random`, lo almacena en claro, lo devuelve en la creación y no impone expiración, límite de intentos ni consumo de un solo uso. Alinear ambos lados, generar códigos con criptografía segura y registrar intentos. Fuentes: `client/src/features/operations/EntregaOTP.jsx:12-16,44-50`, `server/src/controllers/operation.controller.js:53,85,121-129`.
6. **Acceso sin verificación académica efectiva.** Registrar un correo con sufijo permitido emite JWT inmediatamente. `requireAuth` solo verifica firma y fecha del token; no consulta estado, rol vigente ni verificación. El login solo bloquea `Suspendida`. Esto no satisface RF-01, RF-02, RF-04 ni los controles de riesgo. Fuentes: `server/src/controllers/auth.controller.js:10-39,54-78`, `server/src/middlewares/auth.middleware.js:6-21`.

### P1: completar el flujo de negocio

7. **Estados de operación incompletos.** RF-10 y RF-11 definen solicitud pendiente y decisión del oferente. La API crea directamente `Pendiente de pago/garantía`; no hay rutas para aceptar, rechazar o cancelar. Tampoco se valida que la publicación esté `Activa`, que las fechas formen un intervalo válido ni que el usuario esté habilitado. Fuentes: `server/src/routes/operation.routes.js:8-14`, `server/src/controllers/operation.controller.js:14-78`.
8. **Reserva parcialmente protegida.** El controlador bloquea la fila de publicación y consulta solapamientos, pero la migración no tiene restricción de exclusión para intervalos, ni `CHECK` de fechas, ni liberación al cancelar. Hay además otra implementación de reserva, no usada por rutas, con comparación de límites distinta. Consolidar una sola regla y probar concurrencia. Fuentes: `server/src/controllers/operation.controller.js:28-44`, `server/src/services/operation.service.js:1-77`, `server/src/db/migrations/001_init.sql:84-92`.
9. **Auditoría prometida pero casi ausente.** Existe `audit_logs`, pero las rutas activas de publicación, reserva y entrega no escriben allí. El servicio de operación sí lo intenta, pero no está conectado a la ruta y su importación de `pool` no coincide con el `export default` de `database.js`. RF-30 y RNF-09 siguen pendientes. Fuentes: `server/src/db/migrations/001_init.sql:147-156`, `server/src/services/operation.service.js:1,56-65`, `server/src/config/database.js:33`.
10. **Privacidad del detalle público.** `GET /api/publications/:id` no filtra estado y devuelve `p.*` junto al correo del oferente. Limitar campos y publicar solo estados autorizados; reservar datos de contacto para participantes y momento apropiado. Fuentes: `server/src/routes/publication.routes.js:13-14`, `server/src/controllers/publication.controller.js:55-73`.
11. **Interfaces desconectadas.** `Login.jsx` navega sin autenticar ni guardar token; `CreatePublication.jsx`, `ClaimsForm.jsx` y `ArcoForm.jsx` anuncian éxito con `alert`; `Home.jsx` usa `mockProducts`, `ProductDetail.jsx` presenta datos fijos. Conectar estas vistas a la API y manejar estados de carga, error y permiso. Fuentes: `client/src/features/auth/Login.jsx:10-19`, `client/src/features/publications/CreatePublication.jsx:9-13`, `client/src/features/legal/ClaimsForm.jsx:9-13`, `client/src/features/legal/ArcoForm.jsx:9-13`, `client/src/features/catalog/Home.jsx:5-29`, `client/src/features/catalog/ProductDetail.jsx:4-46`.
12. **Procesos posteriores a la entrega ausentes.** No hay endpoints para devolución, conformidad, incidencia vinculada, resolución económica, cierre o calificación. Las tablas `incidences` y `transactions` son preparación de datos, no implementación. Fuentes: `server/src/routes/operation.routes.js`, `server/src/db/migrations/001_init.sql:95-119`.
13. **Moderación y ARCO sin servidor.** El panel administrativo contiene datos fijos; las solicitudes ARCO y reclamos muestran confirmaciones locales. No se valida rol en rutas administrativas porque no hay rutas administrativas. Para RF-19, RF-31 y RF-32 hacen falta almacenamiento de evidencia con acceso restringido, decisiones y auditoría. Fuentes: `client/src/features/dashboard/AdminDashboard.jsx:16-145`, `client/src/features/legal/ArcoForm.jsx:9-13`, `client/src/features/legal/ClaimsForm.jsx:9-13`, `server/src/app.js:31-34`.
14. **Notificaciones solo de lectura.** El usuario autenticado puede listar y marcar propias como leídas. `createNotification` existe, pero ninguna ruta de negocio la invoca. Faltan eventos críticos, preferencia y archivo previstos en RF-20 y UC-13. Fuentes: `server/src/controllers/notification.controller.js:4-56`, `server/src/routes/notification.routes.js:8-14`.

### P2: calidad, mantenimiento y documentación

15. **Pruebas y automatización.** `server/package.json` mantiene un script de prueba que falla siempre; el cliente compila, pero `npm run lint` reporta 10 errores. Añadir pruebas de autenticación, reglas de estados, transacciones y concurrencia antes de expandir el producto. Fuentes: `server/package.json:8-12`, `client/eslint.config.js`.
16. **Arranque no bloquea si falta la base de datos.** `testConnection` captura el error y termina sin lanzarlo; `server.js` continúa hasta `app.listen`. Hacer que el arranque falle si PostgreSQL no está disponible. Fuentes: `server/src/config/database.js:21-31`, `server/server.js:6-12`.
17. **README desactualizado.** Instruye ejecutar `001_init_normalized.sql`, pero solo existe `001_init.sql`; el bloque SQL está sin cerrar y muestra un `JWT_SECRET` de ejemplo fácil de copiar. Corregir guía de arranque, variables de entorno y migraciones reproducibles. Fuentes: `README.md:26-63`, `server/src/db/migrations/001_init.sql`.
18. **PWA pendiente de completar.** Vite genera el service worker, pero el manifiesto tiene `icons: []`; falta comprobar instalación y uso en los navegadores del piloto definidos en RNF-07. Fuente: `client/vite.config.js:6-17`.

## Cobertura de requisitos funcionales

Leyenda: **Parcial** = existe código, pero no alcanza el criterio del informe; **Pendiente** = no hay flujo funcional completo; **API parcial** = endpoint sin integración útil con la pantalla.

| Requisito | Estado | Evidencia o brecha principal |
|---|---|---|
| RF-01 Registro estudiante | Parcial | Registro API sin verificación de correo ni consentimiento; `auth.controller.js`. |
| RF-02 Acceso egresado | Pendiente | Exige correo institucional; no hay acreditación alternativa. |
| RF-03 Perfil | Pendiente | `UserProfile.jsx` contiene datos fijos; no hay actualización API. |
| RF-04 Verificación de identidad | Pendiente | Columnas de estado sin flujo de revisión. |
| RF-05 Condición académica | Parcial | Campo en `users`; interfaz no lo obtiene dinámicamente. |
| RF-06 Publicar bien | API parcial | Inserción incompatible con migración y pantalla simulada. |
| RF-07 Modalidad y disponibilidad | Parcial | Modalidad/precio/garantía; sin calendario de oferta ni validación por modalidad. |
| RF-08 Riesgo progresivo | Pendiente | `risk_level` no se calcula ni controla. |
| RF-09 Buscar y filtrar | API parcial | Consulta usa columna inexistente; cliente filtra datos fijos. |
| RF-10 Solicitar operación | Parcial | Crea operación, pero salta estado `Pendiente` y no verifica usuario/publicación. |
| RF-11 Aceptar o rechazar | Pendiente | Sin rutas ni transiciones. |
| RF-12 Evitar solapamientos | Parcial | `FOR UPDATE` y consulta; faltan validación y prueba de concurrencia. |
| RF-13 Pago/garantía | Pendiente | Checkout simulado; tabla sin integración. |
| RF-14 Entrega y recepción | Parcial | Confirmación solo del oferente; pantalla OTP simulada. |
| RF-15 Devolución y cierre | Pendiente | Sin rutas. |
| RF-16 Calificación | Pendiente | Sin modelo ni rutas. |
| RF-17 Señales de confianza | Parcial | Columnas de reputación; datos mostrados son fijos. |
| RF-18 Incidencia | Pendiente | Tabla y formulario sin envío real. |
| RF-19 Moderación | Pendiente | Panel estático; sin rutas administrativas. |
| RF-20 Notificaciones | Parcial | Lectura y marcado; no creación desde eventos críticos. |
| RF-21 Editar publicación | Pendiente | Sin ruta. |
| RF-22 Cambiar precio/garantía | Pendiente | Sin ruta ni reevaluación de riesgo. |
| RF-23 Pausar/retirar | Pendiente | Sin ruta. |
| RF-24 Snapshot contractual | Parcial | Se crea antes de aceptación y omite condiciones relevantes. |
| RF-25 Cancelar solicitud | Pendiente | Sin ruta ni liberación. |
| RF-26 Bloquear edición activa | Pendiente | Aún no existe edición controlada. |
| RF-27 Eventos durante alquiler | Pendiente | Sin estados ni flujo. |
| RF-28 Liberar reservas | Pendiente | Sin cancelación o liberación. |
| RF-29 Reversión/reembolso | Pendiente | Sin integración económica. |
| RF-30 Auditoría | Pendiente | Tabla existente; código de ruta no escribe eventos. |
| RF-31 ARCO | Pendiente | Tabla y formulario simulado; sin seguimiento. |
| RF-32 Reportar usuario | Pendiente | Tabla y formulario simulado; sin moderación. |

## Requisitos no funcionales y evidencia pendiente

| Requisito | Estado actual |
|---|---|
| RNF-01 Rendimiento | Sin prueba de 50 concurrentes ni p95 de 2.5 s. |
| RNF-02 Integridad | Sin prueba de 100 reservas concurrentes; riesgo por transacción abierta. |
| RNF-03 Disponibilidad | Sin piloto de 7 días ni medición del 99 %. |
| RNF-04 Seguridad | Middleware básico; sin autorización por recurso/rol en los flujos previstos ni escaneo de aceptación. |
| RNF-05 Privacidad | Detalle público expone correo del oferente; sin control de evidencias. |
| RNF-06 Usabilidad | Sin medición SUS ni tareas con usuarios. |
| RNF-07 Compatibilidad | Build PWA presente; íconos y prueba de instalación pendientes. |
| RNF-08 Testabilidad | Sin pruebas backend; lint cliente falla. |
| RNF-09 Auditoría | Sin escritura sistemática desde rutas activas. |
| RNF-10 Recuperación | Sin respaldo/restauración demostrada. |

## Qué conservar, cambiar o retirar

- **Conservar:** separación cliente/API, PostgreSQL, migración inicial como base de diseño, bloqueo pesimista como mecanismo posible y componentes de UI reutilizables. Requieren correcciones antes de un piloto.
- **Cambiar:** centralizar reglas de operación y estados en un servicio único; usar migraciones versionadas; conectar cliente y API mediante una capa de acceso; validar entradas y autorización por recurso en servidor; separar demo de datos reales.
- **Retirar o aislar del producto:** OTP fijo `849201`, pago ficticio, confirmaciones falsas de reclamo/ARCO, productos y métricas administrativas fijas, `operation.service.js` duplicado y no usado. No borrar el diseño visual: convertir esas pantallas en estados reales o marcarlas claramente como prototipo.
- **Revisar dependencias:** `axios`, `winston` y `zod` figuran en paquetes, pero no aparecen usados en los módulos revisados. Mantener solo si se incorporan al flujo real.

## Orden de trabajo recomendado

1. Corregir rol de registro, esquema/migración, transacciones abiertas y exposición de datos. Añadir pruebas que reproduzcan cada falla.
2. Definir la máquina de estados: solicitud, aceptación/rechazo, reserva, pago/garantía, entrega, devolución, cierre y cancelación. Decidir proveedor económico antes de prometer custodia.
3. Implementar backend de identidad/verificación, publicaciones, reservas y cierre con autorización y auditoría; cubrir concurrencia.
4. Conectar pantallas a endpoints reales. Eliminar éxito simulado y datos fijos; añadir manejo de errores.
5. Completar incidencias, moderación, ARCO, reputación y notificaciones por eventos.
6. Ejecutar pruebas de RNF del informe y piloto con usuarios; ajustar README y operación antes de declarar cumplimiento.

## Verificaciones ejecutadas

- `npm ci` en cliente y servidor: terminó sin vulnerabilidades reportadas por npm en la instalación actual.
- `npm run build` en cliente: pasó; Vite generó paquete y service worker.
- `npm run lint` en cliente: falló con 10 errores.
- `npm test` en servidor: falla por script marcador de posición.
- `node --check` en 13 archivos JavaScript del servidor: pasó.
- Se validaron seis archivos BPMN y se renderizaron seis SVG. No se ejecutó un flujo contra PostgreSQL real ni un proveedor de pagos.
