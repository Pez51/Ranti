# Ranti — intercambio universitario UCSM

React/Vite, API Node/Express y PostgreSQL. Fase 2 implementa identidad institucional simulada, perfil, revisión manual del rol Estudiante y publicaciones con riesgo/ciclo de vida. [Estado de RF](docs/revision-informe.md); [BPMN y evidencia](docs/bpmn/README.md).

## Preparación

Node.js 24.x (comprobado con 24.14.1), npm y PostgreSQL (integración local con 17). Desde la raíz:

```powershell
npm run setup
# Crear previamente una base vacía: CREATE DATABASE ranti_db;
npm run migrate --prefix server
npm run dev
```

Antes de migrar, crear `server/.env` con valores locales; nunca versionar credenciales:

```dotenv
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://USUARIO:CONTRASEÑA@localhost:5432/ranti_db
JWT_SECRET=REEMPLAZAR_POR_UN_SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
FRONTEND_URL=http://localhost:5173
PAYMENT_PROVIDER=simulated
IDENTITY_PROVIDER=simulated
IDENTITY_SIMULATOR_EXPOSE_CODE=false
```

El único proveedor de identidad disponible es `simulated`: sin SSO real y sin envío de correo. Para pruebas locales, habilitar `IDENTITY_SIMULATOR_EXPOSE_CODE=true` y reiniciar la API; la respuesta incluye `simulation_code` y la pantalla avisa que es simulación. Deshabilitado, no existe otro canal implementado para recibir el código. No habilitar exposición como autenticación de producción. No se recoge DNI. Aceptar los nombres de pago `culqi`/`niubiz` en configuración no implementa esos adaptadores.

El comando `npm run migrate --prefix server` aplica hasta 004, en orden:

| Archivo | Contenido |
|---|---|
| `server/src/db/migrations/001_init.sql` | Línea base histórica. |
| `server/src/db/migrations/002_foundations.sql` | Auditoría inmutable y outbox. |
| `server/src/db/migrations/003_identity_publications.sql` | Consentimiento, desafíos, solicitudes de rol, riesgo y ciclo de publicaciones. |
| `server/src/db/migrations/004_publication_image_positions.sql` | Orden persistente, posiciones 0–3 y unicidad de imágenes. |

Cada archivo y su historial se confirman en una transacción; advisory lock serializa ejecuciones. SHA-256 detecta cambios de bytes con `MIGRATION_CHECKSUM_MISMATCH`; `.gitattributes` conserva LF. No editar migraciones desplegadas ni sustituir checksums silenciosamente. Repetir el comando omite lo aplicado.

La migración 004 falla de forma atómica si una publicación histórica tiene más de cuatro imágenes. Un operador debe respaldar y corregir esa galería antes de reintentar; no elimina imágenes automáticamente. Las migraciones anteriores confirmadas no se revierten por ese fallo.

Para una base creada manualmente con 001, respaldar y revisar destino antes de ejecutar:

```powershell
npm run migrate --prefix server -- --adopt-baseline
```

La adopción valida 10 tablas, columnas, defaults, constraints y 14 enums históricos; registra checksum de 001 sin ejecutarla y aplica pendientes hasta 004. Rechaza incompatibilidad con `BASELINE_ADOPTION_VALIDATION_FAILED`; nunca adopta automáticamente. La validación bloquea tablas. Historias experimentales CRLF requieren conciliación explícita con los bytes realmente desplegados.

La API falla al arrancar si PostgreSQL no responde. `npm start --prefix server` inicia solo API; el arranque no migra. Cliente: `http://localhost:5173`; API: `http://localhost:3000/api`. Para otra API, definir `VITE_API_URL` en `client/.env.local`.

## Registro, verificación y sesión

Correo permitido: `ucsm.edu.pe` o subdominio válido, normalizado. Cada cuenta pública se crea por defecto como Egresado, en `Pendiente de verificación / No verificado`, con consentimiento y versión de términos. Registro no emite JWT ni acepta escalada de rol. Estudiante exige revisión manual posterior.

Ejemplo PowerShell 7.1+ local; código e identificadores se toman de respuestas reales:

```powershell
$api = 'http://localhost:3000/api'
$email = Read-Host 'Correo institucional UCSM'
$password = Read-Host 'Contraseña local de prueba' -MaskInput
$registration = Invoke-RestMethod -Method Post -Uri "$api/auth/register" -ContentType 'application/json' -Body (@{
  email = $email; password = $password; acceptTerms = $true; termsVersion = 'pilot-v1'
} | ConvertTo-Json)
# Solo si hay que reenviar tras indisponibilidad o expiración:
$registration = Invoke-RestMethod -Method Post -Uri "$api/auth/verification/resend" -ContentType 'application/json' -Body (@{
  email = $email
} | ConvertTo-Json)
$code = Read-Host 'Código de simulación local de la respuesta vigente'
$verified = Invoke-RestMethod -Method Post -Uri "$api/auth/verification/confirm" -ContentType 'application/json' -Body (@{
  challengeId = $registration.challenge_id; code = $code
} | ConvertTo-Json)
$session = Invoke-RestMethod -Method Post -Uri "$api/auth/login" -ContentType 'application/json' -Body (@{
  email = $email; password = $password
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($session.token)" }
Invoke-RestMethod -Uri "$api/users/me" -Headers $headers
```

Desafío de seis dígitos generado criptográficamente, hash bcrypt, diez minutos y cinco intentos. Reenvío invalida desafíos anteriores. Código incorrecto, expirado, agotado o reutilizado produce `IDENTITY_INVALID_CHALLENGE`; intentos incorrectos y expiración se persisten aunque se rechace la petición. Una caída al solicitar desafío conserva cuenta pendiente y devuelve 202/`retryable`; durante confirmación devuelve 503 y permite reintentar.

Verificación válida activa la cuenta, conserva Egresado, consume desafío y escribe auditoría/outbox atómicamente; fallo revierte todo. Confirmación/login devuelven `{ token, user }`; JWT vence a las 24 horas. Login rechaza uniformemente cuenta pendiente, suspendida, no verificada o credenciales inválidas. Middleware consulta estado/rol vigentes en cada petición.

Registro y login comparten la misma regla de contraseña: 8–72 caracteres y como máximo 72 bytes UTF-8, antes de hash/comparación bcrypt. Por ejemplo, 36 caracteres `é` ocupan 72 bytes y son válidos; 37 ocupan 74 bytes y se rechazan.

## Contratos HTTP

Propietario requiere JWT, cuenta Activa/Verificado y titularidad. Administración añade rol Administrador vigente. No existe alta pública de administradores.

| Método y ruta | Contrato |
|---|---|
| `POST /api/auth/register` | `email, password, acceptTerms: true, termsVersion`; pendiente, sin token. |
| `POST /api/auth/verification/resend` | `email`; reemplaza desafío. |
| `POST /api/auth/verification/confirm` | `challengeId, code`; verifica y emite sesión. |
| `POST /api/auth/login` | `email, password`. |
| `GET /api/auth/me` | Sesión y rol vigentes. |
| `GET /api/users/me`, `PATCH /api/users/me` | Perfil propio; solo `display_name, avatar_url, faculty` editables. |
| `GET /api/users/me/role-requests`, `POST /api/users/me/role-requests` | Historial/solicitud Estudiante: `evidence_ref` HTTPS y `evidence_metadata` opcional. |
| `GET /api/admin/role-requests` | Cola pendiente paginada con acceso a evidencia auditado. |
| `POST /api/admin/role-requests/:id/decision` | `decision: approve|reject, reason`; aprobación promueve a Estudiante. |
| `GET /api/publications`, `GET /api/publications/:id` | Solo Activa; sin correo, evidencia privada ni revisión. |
| `GET /api/publications/mine` | Todas las publicaciones propias. |
| `POST /api/publications` | Crea Borrador, admite datos incompletos. |
| `PATCH /api/publications/:id` | Edita Borrador/Pausada/Activa; Activa se recalcula y puede pasar a revisión. |
| `POST /api/publications/:id/submit` | Envía Borrador completo. |
| `POST /api/publications/:id/pause` | Activa → Pausada. |
| `POST /api/publications/:id/reactivate` | Pausada → reevaluación → Activa o Pendiente de revisión. |
| `POST /api/publications/:id/withdraw` | Retirada terminal; reintento sin efectos duplicados. |
| `GET /api/admin/publications/reviews` | Cola pendiente paginada; lectura de cada referencia de procedencia auditada. |
| `POST /api/admin/publications/:id/review` | `decision, reason, submittedAt`; decisión ligada al envío actual. |

Colas: `limit` 1–100 (20 por defecto), `offset` 0–100000. Perfil deriva condición académica del rol, universidad fija UCSM; métricas protegidas no prueban reputación completa. Evidencia de rol permite cuatro textos planos acotados: `documentType, institution, academicPeriod, note`; esa allowlist no detecta secretos dentro de sus valores de texto libre. La referencia HTTPS es opaca: no se carga un binario ni se controla privacidad del destino remoto. El titular conserva acceso a su propia evidencia. Para administradores, únicamente las colas devuelven referencias de evidencia y auditan cada lectura antes de responder. Las respuestas de decisión, iniciales y repetidas, nunca incluyen `evidence_ref`, `evidence_metadata` ni `provenance_evidence_ref`. Referencia inválida o metadatos ajenos se rechazan; segunda solicitud pendiente: 409 `ROLE_REQUEST_PENDING`. Misma decisión de rol devuelve resultado existente, aunque cambien administrador o motivo; opuesta: 409. Decisiones nuevas escriben auditoría/outbox sin evidencia ni motivo libre en esos registros; reintentos del mismo resultado no duplican efectos.

La sintaxis de autoridad de las URL de evidencia es intencionalmente conservadora: `https://`, etiquetas ASCII alfanuméricas con guiones internos separadas por puntos, sin credenciales, y puerto opcional de 1 a 65535. Rechaza IPv6 entre corchetes (por ejemplo, `https://[::1]/evidence`), aunque sea una URL HTTPS válida para otros consumidores; no acepta todas las formas permitidas por el estándar de URL.

Mutaciones de publicación aceptan `title, description, category, condition, modality, price, guarantee_amount, available_from, available_until, provenance_evidence_ref, images`. Acciones de ciclo reciben cuerpo vacío. Envío exige textos completos, modalidad explícita y 1–4 imágenes HTTPS ordenadas, primera principal. Centinelas de borrador como `draft-modality-unset` no se muestran públicamente. Venta: precio positivo, garantía cero, sin fechas. Alquiler: precio positivo y fechas. Préstamo: precio cero y fechas. Garantía no negativa, PEN con máximo dos decimales, sin redondear. ISO con zona o `YYYY-MM-DD` a medianoche de Perú; inicio menor que fin.

Política `pilot-v1`: exposición = máximo(precio, garantía).

| Exposición | Nivel | Envío |
|---|---|---|
| Menor que S/500 (499.99 incluido) | 1 | Activa. |
| Desde S/500 hasta menos de S/1000 (500 y 999.99 incluidos) | 2 | Pendiente de revisión. |
| Desde S/1000 (1000 incluido) | 3 | Referencia HTTPS de procedencia obligatoria y Pendiente de revisión. |

Falta de procedencia/datos completos: 422. Aprobar activa; rechazar devuelve Borrador. `submittedAt` debe coincidir con el ISO exacto del envío actual; decisión obsoleta/conflictiva: 409. Repetición idéntica requiere mismo administrador, motivo normalizado, decisión y envío, sin efectos duplicados.

Edición/cambio de estado se bloquea si alguna operación está fuera de `Pendiente, Cancelada, Cerrada`; filas bloqueadas y reevaluadas tras esperar. Retirada es terminal. Mutaciones efectivas, imágenes, auditoría y outbox comparten transacción: fallo implica rollback. Cola administrativa no revela filas si falla auditoría de acceso.

Filtros combinables: `search, category` (alias `faculty`), `modality, condition, minPrice, maxPrice, availableFrom, availableUntil`. Disponibilidad excluye ventas.

## Cliente e infraestructura

`/registro`: registrar/reenviar/confirmar; `/login`: sesión real; `/perfil`: perfil y solicitud Estudiante; `/publicar`: borrador/envío; `/mis-publicaciones` y alias `/oferente`: edición/ciclo; `/admin`: ambas revisiones. Catálogo/detalle consumen API. Formularios manejan carga/error y serializan confirmación/refresco. Pruebas React con API simulada, sin browser E2E.

Cada petición recibe `X-Request-Id`. Middleware final devuelve `{ error: { code, message, request_id } }`; controladores/middleware heredados conservan sus contratos. Auditoría/outbox rechazan claves sensibles recursivamente; no detectan secretos en texto libre.

`processOutboxBatch` reclama hasta 20 eventos con `FOR UPDATE SKIP LOCKED`, lease de 60 segundos y propietario único; handlers por nombre reciben `(payload, event)`. Reintento `min(2^attempts × 30 segundos, 1 hora)` (primer fallo 60 segundos). Usar Pool/Client en autocommit y confirmar reclamaciones antes de despachar. Entrega al menos una vez: handlers necesitan idempotencia; no hay renovación de lease ni garantía externa exactamente una vez.

Identidad, decisiones de rol y mutaciones de publicación ya producen outbox. No hay scheduler/daemon ni productores conectados para flujos posteriores/notificaciones completas. `createInAppNotification`, lectura y marcado existen; no entrega automática de estos eventos ni correo.

## Verificación y límites

```powershell
npm test --prefix server
powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1
npm test --prefix client
npm run lint --prefix client
npm run build --prefix client
git diff --check
```

El script PostgreSQL crea una instancia temporal con puerto libre, ejecuta la suite y limpia esa instancia; no usa bases existentes. Otra instalación: `-PostgresBin 'C:\Program Files\PostgreSQL\16\bin'`. Validación/render en [BPMN](docs/bpmn/README.md).

Resultados frescos de Fase 2, 2026-10-01:

| Comando | Resultado |
|---|---|
| `npm test --prefix server` | 233 pruebas aprobadas, 170 omitidas; 13 archivos aprobados, 8 omitidos (403 pruebas / 21 archivos). |
| `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1` | 403 pruebas aprobadas en 21 archivos, sin omitidas. |
| `npm test --prefix client` | 53 pruebas aprobadas en 9 archivos. |
| `npm run lint --prefix client` | Salida 0. |
| `npm run build --prefix client` | Salida 0; frontend y service worker generados, sin advertencias. |
| Validación BPMN | Ambos archivos válidos: 4 procesos y 1 diagrama cada uno, sin advertencias del validador. |
| Render BPMN | Ambos SVG generados y analizados como XML; vistas PNG derivadas inspeccionadas. |
| `git diff --check` | Sin errores. |

La interferencia intermitente entre las suites de outbox, identidad y revisión de rol quedó corregida: cada suite posee una base privada dentro del clúster temporal mediante `server/test/helpers/disposable-database.js`. Esto impide que un `TRUNCATE` o un worker de una suite reclame eventos de otra. La verificación posterior pasó 403/403 en paralelo.

No hay proveedor institucional real, carga binaria de evidencia ni almacén privado de objetos. Por confirmar: alta operativa de administradores, gobierno de términos/proveedores, retención de evidencia y despliegue del worker.

Fases posteriores pendientes: aceptación/cancelación, economía, entrega/cierre completos, reputación, incidencias, moderación general, ARCO y notificaciones completas. Pago/entrega del cliente muestran indisponibilidad; no dinero real. La ruta heredada autenticada `POST /api/operations` exige publicación Activa pero crea directamente `Pendiente de pago/garantía`, con snapshot contractual, reserva para alquiler/préstamo y OTP; todavía omite el paso de aceptación previsto para Fase 3. Confirmar entrega exige `Lista para entrega`; la seguridad completa del OTP sigue pendiente. Esta frontera heredada no se modifica en Fase 2. No se afirma cumplimiento RNF, piloto con usuarios, SUS, disponibilidad, recuperación ni instalación PWA.
