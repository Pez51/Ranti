# Ranti — intercambio universitario UCSM

React/Vite, API Node/Express y PostgreSQL. Fases 1–3 implementan identidad institucional simulada, perfil, publicaciones y solicitudes con decisión y reserva previa a economía. [Estado de RF](docs/revision-informe.md); [BPMN y evidencia](docs/bpmn/README.md); [formulario y resumen económico informativo](docs/publication-pricing-policy.md).

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
OPERATION_REQUEST_TTL_HOURS=48
RANTI_PHOTO_DIR=C:/RantiData/profile-photos
RANTI_PUBLICATION_PHOTO_DIR=C:/RantiData/publication-photos
```

El único proveedor de identidad disponible es `simulated`: sin SSO real y sin envío de correo. Para pruebas locales, habilitar `IDENTITY_SIMULATOR_EXPOSE_CODE=true` y reiniciar la API; la respuesta incluye `simulation_code` y la pantalla avisa que es simulación. Deshabilitado, no existe otro canal implementado para recibir el código. No habilitar exposición como autenticación de producción. No se recoge DNI. Aceptar los nombres de pago `culqi`/`niubiz` en configuración no implementa esos adaptadores.

El comando `npm run migrate --prefix server` aplica las migraciones pendientes hasta 022, en orden:

Recuperación excepcional de una base manual local: si `ranti_db` tiene las tablas iniciales, el historial `schema_migrations` vacío y valores ENUM con tildes mal codificadas, no recrear tablas ni marcar migraciones arbitrariamente. Tras respaldar la base configurada, desde `server/` se puede ejecutar `node ../tools/repair-manual-baseline.mjs --backup-confirmed`. Esta herramienta solo admite desarrollo local `ranti_db`, los bytes conocidos de 001 con su adición de outbox legado, el contrato histórico completo y la columna opcional `career VARCHAR(100)` de 010. Corrige únicamente la codificación reconocida, valida todo el esquema y registra la base inicial en una transacción; cualquier deriva desconocida revierte la reparación. Después aplica las migraciones pendientes por el runner normal. No modifica contraseñas ni reglas de autenticación, no borra datos y no sustituye las validaciones del arranque. Si cambia `.env` después de un fallo de arranque, detener y volver a ejecutar `npm run dev` desde la raíz.

Con `NODE_ENV=development`, el servidor también aplica las migraciones pendientes al arrancar y comprueba las tablas de chat, calendario, entrega y pago simulado **antes** de escuchar peticiones. Usa la misma conexión `DATABASE_URL` que la aplicación: no cambia de base ni inventa credenciales. Si una migración falla o el historial declara tablas que faltan, detiene el arranque con diagnóstico; no borra datos ni ignora checksums. En producción, las migraciones siguen siendo un paso explícito de despliegue.

| Archivo | Contenido |
|---|---|
| `server/src/db/migrations/001_init.sql` | Línea base histórica. |
| `server/src/db/migrations/002_foundations.sql` | Auditoría inmutable y outbox. |
| `server/src/db/migrations/003_identity_publications.sql` | Consentimiento, desafíos, solicitudes de rol, riesgo y ciclo de publicaciones. |
| `server/src/db/migrations/004_publication_image_positions.sql` | Orden persistente, posiciones 0–3 y unicidad de imágenes. |
| `server/src/db/migrations/005_operation_status_values.sql` | Agrega `Rechazada`, `Expirada`, `Cancelación en reversión` al enum; tiene su propia confirmación. |
| `server/src/db/migrations/006_operations_reservations.sql` | Contratos, reglas de transición y exclusión de reservas; concilia filas históricas válidas. |
| `server/src/db/migrations/007_sale_reservation_reconciliation.sql` | Reconcilia ventas heredadas activas sin reserva y congela publicación, modalidad y fechas de operaciones ya reservadas. |
| `server/src/db/migrations/008_add_roles.sql` | Amplía el enum de roles; contiene su propia confirmación. |
| `server/src/db/migrations/009_add_contact_number.sql` | Agrega celular opcional al perfil. |
| `server/src/db/migrations/010_add_career.sql` | Agrega carrera al perfil sin alterar valores históricos. |
| `server/src/db/migrations/011_publication_photos.sql` | Registra archivos de fotos y su propietario para asociarlos a publicaciones. |
| `server/src/db/migrations/012_publication_seven_photos.sql` | Amplía las posiciones permitidas a 0–6, conservando las fotos existentes. |
| `server/src/db/migrations/013_publication_details.sql` | Categoría personalizada y estado físico de 1–5 estrellas; conserva publicaciones históricas. |
| `server/src/db/migrations/014_private_provenance_files.sql` | Archivos privados de procedencia con propietario, tipo y tamaño. |
| `server/src/db/migrations/015_rental_billing_unit.sql` | Unidad de alquiler, conservación en solicitudes y actualización de versión al cambiarla; alquileres históricos quedan por día. |
| `server/src/db/migrations/016_open_ended_rental_availability.sql` | Fecha de fin de disponibilidad opcional para Alquiler; solicitudes/reservas conservan intervalos finitos. |
| `server/src/db/migrations/017_operation_offers.sql` | Oferta privada de precio para Venta/Alquiler, separada del precio publicado y no editable una vez enviada. |
| `server/src/db/migrations/018_operation_handoffs.sql` | Lugar/horario propuestos por cualquiera, acuerdo y confirmación bilateral de entrega/devolución del piloto. |
| `server/src/db/migrations/019_publication_conversations.sql` | Chat privado y persistente por publicación e interesado, con historial paginado y reintentos deduplicados. |
| `server/src/db/migrations/020_calendar_and_simulated_payment.sql` | Disponibilidad bilateral opcional de 30 minutos durante siete días; pago simulado separado de transacciones reales y posterior al encuentro acordado. |
| `server/src/db/migrations/021_chat_calendar_invitations.sql` | Mensajes tipados de invitación al calendario, vinculados a un trato aceptado de la misma conversación. |
| `server/src/db/migrations/022_chat_workflow_events.sql` | Avisos del flujo en el historial privado del chat, vinculados a la operación y deduplicados. |

Consulta [Chat, disponibilidad y entrega del piloto](docs/pilot-communications.md) para reglas, límites y pruebas. El chat se abre desde «Consultar al oferente», «Abrir chat de esta operación» o el menú de cuenta → «Mis conversaciones».

Cada archivo y su historial se confirman en una transacción; advisory lock serializa ejecuciones. SHA-256 detecta cambios de bytes con `MIGRATION_CHECKSUM_MISMATCH`; `.gitattributes` conserva LF. No editar migraciones desplegadas ni sustituir checksums silenciosamente. Repetir el comando omite lo aplicado.

La migración 004 falla de forma atómica si una publicación histórica tiene más de cuatro imágenes. Un operador debe respaldar y corregir esa galería antes de reintentar; no elimina imágenes automáticamente. Las migraciones anteriores confirmadas no se revierten por ese fallo.

Antes de 006, el rol PostgreSQL que migra necesita permiso para `CREATE EXTENSION IF NOT EXISTS btree_gist` (o la extensión ya instalada por un administrador). 006 toma `SHARE ROW EXCLUSIVE` sobre `publications`, `operations` y `reservations`: planificar una ventana de quiescencia de escrituras. Su preflight rechaza `Pendiente` legado ambiguo, estados/datos nulos o terminales sin metadatos, fechas o relaciones inválidas, reservas duplicadas y solapamientos vivos. Respaldar e investigar cada rechazo; la reconciliación corresponde al operador antes de reintentar, sin reinterpretación ni borrado automático. Si 006 falla, revierte 006; 005 ya confirmado permanece aplicado. El snapshot económico legado prioriza sus importes cuando existen y usa la publicación actual como respaldo documentado.

007 también bloquea esas tres tablas. Crea reservas vivas para ventas heredadas aún comprometidas que carecían de ellas; rechaza atómicamente compromisos de venta múltiples o estados de reserva contradictorios para conciliación manual. Conserva snapshots e historial. Una vez que existe una reserva, ni la operación ni su reserva pueden trasladar conjuntamente la publicación, modalidad o intervalo contratado. Respaldar antes de migrar y revisar los errores de 007 antes de reintentar: no elimina filas para forzar el avance.

Para una base creada manualmente con 001, respaldar y revisar destino antes de ejecutar:

```powershell
npm run migrate --prefix server -- --adopt-baseline
```

La adopción valida 10 tablas, columnas, defaults, constraints y 14 enums históricos; registra checksum de 001 sin ejecutarla y aplica pendientes. Rechaza incompatibilidad con `BASELINE_ADOPTION_VALIDATION_FAILED`; nunca adopta automáticamente. La validación bloquea tablas. Historias experimentales CRLF requieren conciliación explícita con los bytes realmente desplegados.

La API falla al arrancar si PostgreSQL no responde. `npm start --prefix server` inicia solo API; el arranque no migra. Cliente: `http://localhost:5173`; API: `http://localhost:3000/api`. Para otra API, definir `VITE_API_URL` en `client/.env.local`.

## Registro, verificación y sesión

Correo permitido: exactamente `@ucsm.edu.pe` (Egresado) o `@estudiante.ucsm.edu.pe` (Estudiante), normalizado. El servidor deriva el rol del dominio y descarta cualquier rol enviado por el cliente. Cada cuenta pública se crea en `Pendiente de verificación / No verificado`, con consentimiento y versión de términos; el registro no emite JWT. Ambos roles quedan habilitados tras confirmar el código, sin revisión administrativa para Estudiante. El proveedor actual sigue siendo simulado: verificar el código no acredita una integración real con UCSM.

Esta regla se aplica a registros nuevos. No se cambian silenciosamente los roles de cuentas ya existentes; antes de una migración de datos conviene auditar excepciones y cuentas administrativas.

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

La foto se selecciona desde un archivo en Mi perfil; no se pega una URL. En el piloto se guarda fuera de Git en `server/uploads/profile`, o en `RANTI_PHOTO_DIR` si se configura. Conviene poner ese directorio en almacenamiento persistente y respaldarlo junto con la base; cambiar de equipo sin copiarlo deja referencias de foto sin archivo. El adaptador de archivos puede sustituirse por almacenamiento de objetos más adelante. Se valida límite, tipo declarado y firma básica, pero aún faltan decodificación/reescalado, análisis antimalware y políticas de retención para producción. Una foto no válida se rechaza; cambiar la foto retira la anterior. Las URL de avatar heredadas no se muestran y se reemplazan al subir una foto nueva.

En Mi perfil, facultad y carrera se eligen cada una en un único campo de autocompletado: escribir filtra la lista, pero hay que seleccionar una opción por clic o teclado; el texto no seleccionado se descarta y no se guarda. La carrera depende de la facultad y se limpia cuando esta cambia. El servidor valida también la pareja y rechaza valores inventados o de otra facultad con `INVALID_ACADEMIC_SELECTION`. Los perfiles anteriores con facultad libre no se convierten automáticamente: deben seleccionar una pareja válida al editar los datos académicos. Las cuentas sin rol académico pueden dejar ambos campos vacíos. El catálogo incluye programas presenciales y virtuales; procede de la [lista de facultades UCSM 2026](https://ucsm.edu.pe/cato-xp-2026-liderazgo-ucsm-educacion-superior/), el [directorio de carreras](https://www2.ucsm.edu.pe/catoxp/nuestras-carreras/) y la [oferta virtual](https://www2.ucsm.edu.pe/virtual/carreras-profesionales-ucsm-virtual/). Revisarlo cuando UCSM cambie su oferta.

¿Qué pasa si falla la carga de foto después de guardar nombre, celular, facultad o carrera? Esas ediciones de texto pueden haber quedado guardadas; la pantalla recarga el perfil y permite reintentar la foto. La actualización conjunta todavía no es atómica entre PostgreSQL y el almacenamiento de archivos.

## Contratos HTTP

Propietario requiere JWT, cuenta Activa/Verificado y titularidad. Administración añade rol Administrador vigente. No existe alta pública de administradores.

| Método y ruta | Contrato |
|---|---|
| `POST /api/auth/register` | `email, password, acceptTerms: true, termsVersion`; pendiente, sin token. |
| `POST /api/auth/verification/resend` | `email`; reemplaza desafío. |
| `POST /api/auth/verification/confirm` | `challengeId, code`; verifica y emite sesión. |
| `POST /api/auth/login` | `email, password`. |
| `GET /api/auth/me` | Sesión y rol vigentes. |
| `GET /api/users/me`, `PATCH /api/users/me` | Perfil propio; solo `display_name`, `contact_number`, `faculty` y `career` editables. La pareja académica debe pertenecer al catálogo. La URL de foto no se acepta en PATCH. |
| `GET /api/users/academic-catalog` | Las 12 facultades UCSM y carreras admitidas, para cuentas verificadas. |
| `PUT /api/users/me/photo` | Foto binaria JPEG/PNG/WebP, máximo 2 MB; requiere sesión verificada y `Content-Type` coincidente. |
| `GET /api/users/photos/:userId/:photoId` | Sirve la foto pública vigente del perfil. |
| Rutas heredadas `GET/POST /api/users/me/role-requests`, `GET /api/admin/role-requests` y `POST /api/admin/role-requests/:id/decision` | Responden 410; la revisión manual de Estudiante se retiró del flujo actual. |
| `GET /api/publications`, `GET /api/publications/:id` | Solo Activa; sin correo, evidencia privada ni revisión. |
| `GET /api/publications/mine` | Todas las publicaciones propias. |
| `POST /api/publications` | Crea Borrador, admite datos incompletos. |
| `POST /api/publications/provenance` | Comprobante binario privado: JPEG/PNG/WebP de hasta 2 MB o PDF de hasta 5 MB; devuelve `{ref,mime,size}`. |
| `GET /api/publications/provenance/:fileId` | Descarga con JWT y cuenta verificada: titular, o administrador si el archivo está asociado a una publicación. Auditoría antes de entregar bytes, sin caché. |
| `GET /api/publications/:id/pricing` | Resumen informativo calculado en el servidor, solo para el propietario verificado; no incluye cargos del comprador ni contabilidad interna de Ranti. |
| `POST /api/publications/photos` | Foto binaria JPEG/PNG/WebP, máximo 2 MB, sesión activa y verificada; devuelve `{url}`. |
| `GET /api/publications/photos/:photoId` | Sirve una foto de artículo por identificador aleatorio; contenido público, no usar para evidencia privada. |
| `PATCH /api/publications/:id` | Edita Borrador/Pausada/Activa; Activa se recalcula y puede pasar a revisión. |
| `POST /api/publications/:id/submit` | Envía Borrador completo. |
| `POST /api/publications/:id/pause` | Activa → Pausada. |
| `POST /api/publications/:id/reactivate` | Pausada → reevaluación → Activa o Pendiente de revisión. |
| `POST /api/publications/:id/withdraw` | Retirada terminal; reintento sin efectos duplicados. |
| `GET /api/admin/publications/reviews` | Cola pendiente paginada; lectura de cada referencia de procedencia auditada. |
| `POST /api/admin/publications/:id/review` | `decision, reason, submittedAt`; decisión ligada al envío actual. |
| `POST /api/operations` | Solicita publicación Activa con `publication_id, requested_price, requested_guarantee_amount, requested_contract_version` y fechas para Alquiler/Préstamo; devuelve `{ operation }` en `Pendiente`. |
| `GET /api/operations/mine` | Privada; `side=requested|received` (por defecto `requested`), `status` opcional, `limit` 1–100 (20), `offset` 0–10000; devuelve `{ items, limit, offset }`. |
| `GET /api/operations/:id` | Detalle solo para demandante u oferente; devuelve `{ operation }`. |
| `POST /api/operations/:id/accept` | Solo oferente actual; cuerpo `{}`; revalida y confirma `Aceptada`, snapshot y reserva. |
| `POST /api/operations/:id/reject` | Solo oferente actual; `{ reason }` de 1–500 caracteres; `Rechazada`, sin reserva. |
| `POST /api/operations/:id/cancel` | Solo demandante actual; `{ reason }` de 1–500 caracteres; cancela pendientes o aceptadas sin movimientos ni declaración de entrega. Estados económicos posteriores requieren reversión aún pendiente. |
| `POST /api/operations/:id/handoff` | Participantes: propone encuentro, acuerda/pide cambios o confirma entrega/devolución bilateral del piloto; requiere revisión vigente. |
| `GET/POST /api/operations/:id/calendar` | Participantes: disponibilidad privada opcional, ventana de siete días desde la aceptación y recomendaciones cronológicas por intersección. |
| `POST /api/operations/:id/payment-simulation` | Solo solicitante: `{confirm_simulation:true}` tras encuentro acordado; no tarjetas, cobro real ni custodia de garantías. |
| `POST /api/conversations/publication/:id` | Interesado verificado: abre/reutiliza chat privado con el oferente. |
| `POST /api/conversations/operation/:id` | Cualquiera de los participantes: abre/reutiliza el chat de esa publicación/interesado. |
| `GET /api/conversations` | Bandeja privada paginada (20 conversaciones). |
| `GET/POST /api/conversations/:id/messages` | Solo participantes: historial (50 mensajes, cursor `before`) y envío de texto con `client_id` para deduplicar. |
| `GET /api/admin/conversations` | Administrador activo/verificado: todas las conversaciones, 20 por página con `offset`; lectura de lista auditada. |
| `GET /api/admin/conversations/:id/messages` | Historial administrativo de solo lectura, 50 mensajes con cursor `before`; acceso auditado y sin caché. No concede escritura. |
| `GET /api/users/:id/profile` | Solo sesión activa y verificada: ficha de miembro con nombre, foto, contacto, puntuación y datos académicos autorizados. No disponible anónimamente; sin caché. |

Colas: `limit` 1–100 (20 por defecto), `offset` 0–100000. Perfil deriva condición académica del rol, universidad fija UCSM; métricas protegidas no prueban reputación completa. Evidencia de rol permite cuatro textos planos acotados: `documentType, institution, academicPeriod, note`; esa allowlist no detecta secretos dentro de sus valores de texto libre. La referencia HTTPS es opaca: no se carga un binario ni se controla privacidad del destino remoto. El titular conserva acceso a su propia evidencia. Para administradores, únicamente las colas devuelven referencias de evidencia y auditan cada lectura antes de responder. Las respuestas de decisión, iniciales y repetidas, nunca incluyen `evidence_ref`, `evidence_metadata` ni `provenance_evidence_ref`. Referencia inválida o metadatos ajenos se rechazan; segunda solicitud pendiente: 409 `ROLE_REQUEST_PENDING`. Misma decisión de rol devuelve resultado existente, aunque cambien administrador o motivo; opuesta: 409. Decisiones nuevas escriben auditoría/outbox sin evidencia ni motivo libre en esos registros; reintentos del mismo resultado no duplican efectos.

La sintaxis de autoridad de las URL de evidencia es intencionalmente conservadora: `https://`, etiquetas ASCII alfanuméricas con guiones internos separadas por puntos, sin credenciales, y puerto opcional de 1 a 65535. Rechaza IPv6 entre corchetes (por ejemplo, `https://[::1]/evidence`), aunque sea una URL HTTPS válida para otros consumidores; no acepta todas las formas permitidas por el estándar de URL.

Mutaciones de publicación aceptan `title, description, category, condition, modality, price, guarantee_amount, available_from, available_until, provenance_evidence_ref, images`. Acciones de ciclo reciben cuerpo vacío. Envío exige textos completos, modalidad explícita y 1–7 imágenes ordenadas, primera principal. El formulario sube archivos y envía las referencias locales que devuelve la API; esta conserva compatibilidad con imágenes HTTPS históricas. Las referencias locales deben pertenecer al usuario que guarda la publicación. Venta: precio positivo, garantía cero, sin fechas. Alquiler: precio positivo y fechas. Préstamo: precio cero y fechas. Garantía no negativa, PEN con máximo dos decimales, sin redondear. ISO con zona o `YYYY-MM-DD` a medianoche de Perú; inicio menor que fin.

El cargador de fotos está debajo del título: cuatro espacios cuadrados iniciales en una fila, selección múltiple, cámara del dispositivo mediante `capture="environment"` y vista previa. Al llenar los cuatro espacios aparece un quinto; al llenar el quinto aparece un sexto, y después un séptimo. Máximo siete fotos; se puede desplazar horizontalmente la fila. Las fotos se reordenan arrastrando horizontalmente con ratón o toque, o usando las flechas izquierda/derecha al enfocar una foto. La primera es la portada; al borrar una, las restantes se renumeran sin huecos. Cada foto se normaliza con `preparePhoto` antes de enviarla, hasta 2 MB. La cámara depende del navegador/dispositivo; se pueden repetir capturas. Si falla una foto, se conservan las cargas anteriores y se puede reintentar seleccionando las restantes. No se guarda el formulario mientras está subiendo fotos.

Antes de subir cada foto se abre «Acomodar foto»: arrastre con ratón/toque, movimiento mediante flechas, zoom 1×–3× y restauración del centro. Solo se codifica y sube el recorte cuadrado confirmado; vuelve a pasar por el límite de 2 MB. Cancelar detiene la selección restante y conserva las fotos previamente cargadas. Pulsar una miniatura permite recortarla otra vez sin cambiar su posición; arrastrarla sigue reordenando la galería. La referencia nueva se conserva al guardar el borrador. Para recuperar partes que quedaron fuera de un recorte anterior, seleccionar nuevamente el archivo original. Las imágenes HTTPS históricas solo pueden reajustarse si su servidor permite leerlas desde el navegador (CORS).

Los binarios se guardan fuera de Git en `server/uploads/publications` (o `RANTI_PUBLICATION_PHOTO_DIR`); respaldar ese directorio junto con PostgreSQL. El almacenamiento local está separado del registro de propiedad para poder sustituirlo por almacenamiento de objetos. Las fotos tienen URL pública aleatoria desde su carga: no subir documentos sensibles. Quitar una foto del formulario no borra inmediatamente el archivo; todavía falta una política de limpieza de fotos huérfanas/retención para producción. El piloto limita a 60 fotos sin asociar por cuenta. El servidor comprueba tamaño, MIME y firma básica; no sustituye decodificación segura ni análisis antimalware del lado servidor.

Política `pilot-v1`: exposición = máximo(precio, garantía).

| Exposición | Nivel | Envío |
|---|---|---|
| Menor que S/500 (499.99 incluido) | 1 | Activa. |
| Desde S/500 hasta menos de S/1000 (500 y 999.99 incluidos) | 2 | Pendiente de revisión. |
| Desde S/1000 (1000 incluido) | 3 | Boleta de procedencia (foto/PDF privado; referencias HTTPS históricas compatibles) y Pendiente de revisión. |

Falta de procedencia/datos completos: 422. Aprobar activa; rechazar devuelve Borrador. `submittedAt` debe coincidir con el ISO exacto del envío actual; decisión obsoleta/conflictiva: 409. Repetición idéntica requiere mismo administrador, motivo normalizado, decisión y envío, sin efectos duplicados.

Edición/cambio de estado se bloquea si alguna operación está fuera de `Pendiente`, `Cancelada`, `Rechazada`, `Expirada` o `Cerrada`; filas bloqueadas y reevaluadas tras esperar. Una edición que solo cambia imágenes conserva la aprobación y las solicitudes pendientes, incluso cuando el formulario envía todos los campos sin cambios contractuales. Retirada es terminal. Mutaciones efectivas, imágenes, auditoría y outbox comparten transacción: fallo implica rollback. Cola administrativa no revela filas si falla auditoría de acceso.

`contract_version` comienza en 1 y sube solo al cambiar título, descripción, categoría, condición, modalidad, precio, garantía o fechas de disponibilidad; una edición solo de imágenes no lo cambia. Pausa, retiro o edición contractual invalidan solicitudes pendientes bajo los mismos bloqueos y las dejan `Rechazada` (o `Expirada` si ya vencieron). Una operación aceptada impide cambios contractuales de la publicación.

## Solicitudes y reservas de Fase 3

La solicitud nace `Pendiente`, sin snapshot contractual, sin reserva, sin movimiento económico y sin OTP. `OPERATION_REQUEST_TTL_HOURS` admite 1–168 horas y vale 48 por defecto. Los términos enviados deben igualar precio, garantía y `requested_contract_version` vigentes; Venta no lleva fechas, Alquiler/Préstamo requieren inicio menor que fin dentro de disponibilidad y no pasado. La API rechaza solicitud propia (400), términos/fechas inválidos (400/422), cuenta suspendida/no verificada (403) y publicación no activa (409). Al solicitar, el servidor bloquea las cuentas vigentes y la publicación; al decidir, bloquea además operaciones y reservas.

El oferente puede aceptar o rechazar una `Pendiente`. La aceptación revalida titular, cuentas, estado, `contract_version`, importes, fechas y disponibilidad; solo entonces crea en la misma transacción el snapshot inmutable y una reserva `Reservada/Bloqueada`. Venta usa reserva sin intervalo y un índice único parcial; Alquiler/Préstamo usan intervalos semiabiertos `[inicio, fin)`: `[a,b)` y `[b,c)` son compatibles. Solo bloquean las reservas con estado exacto `Bloqueo Provisional`, `Reservada/Bloqueada` o `Activa/En uso`; `Disponible` no bloquea. El servicio bloquea filas y la base usa índice único/exclusión GiST como defensa final. Un conflicto de reserva devuelve 409 y revierte snapshot, auditoría y outbox; la prueba PostgreSQL de 100 aceptaciones incompatibles confirmó una sola reserva para Venta y Alquiler. Esto no sustituye una prueba de carga operativa más amplia.

Rechazar requiere motivo y deja `Rechazada` sin snapshot/reserva. Solicitud vencida pasa a `Expirada` al intentar decidir o cancelar (expiración perezosa): se confirma la transición y se devuelve 409. El comando de una sola ejecución `npm run expire:operations --prefix server` reclama hasta 100 pendientes vencidas con `FOR UPDATE SKIP LOCKED`; hay que programarlo externamente y repetirlo para agotar una cola mayor. Sin scheduler, la expiración perezosa protege decisiones/cancelaciones, pero no cambia automáticamente las filas no visitadas. Reintentos del mismo resultado de decisión/cancelación o del worker no duplican efectos; una decisión opuesta o estado obsoleto devuelve 409.

Cancelar `Pendiente` no libera nada porque no hay reserva. Cancelar `Aceptada` sin movimiento económico ni declaración de entrega marca `Cancelada` y libera su reserva como `Disponible`, incluso si la contraparte fue suspendida después de aceptar: el solicitante vigente no queda atrapado. Estados económicos posteriores no se cancelan por este servicio; requieren implementar la reversión y su confirmación. Las declaraciones de entrega impiden liberar el artículo mediante una cancelación. Toda mutación efectiva confirma operación/reserva, auditoría saneada y outbox juntas; fallo de auditoría/outbox revierte el negocio. Los motivos libres se conservan en la operación y no se copian a auditoría/outbox. El cliente ofrece acciones en `/operaciones`, con paginación de 20 por página y refresco tras la respuesta del servidor.

Filtros combinables: `search, category` (alias `faculty`), `modality, condition, minPrice, maxPrice, availableFrom, availableUntil`. Disponibilidad excluye ventas.

## Cliente e infraestructura

`/registro`: registrar/reenviar/confirmar; `/login`: sesión real; `/perfil`: edición de perfil con foto, facultad y carrera seleccionadas del catálogo UCSM; `/publicar`: borrador/envío; `/mis-publicaciones` y alias `/oferente`: edición/ciclo; `/admin`: ambas revisiones. Catálogo/detalle consumen API. Formularios manejan carga/error y serializan confirmación/refresco. El perfil muestra una explicación visible si falta el nombre o una selección académica obligatoria y el navegador bloquea el envío. Pruebas React con API simulada, sin browser E2E.

Para comprobar el guardado y la lectura posterior del perfil con PostgreSQL aislado: `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1 -TestArguments profile-persistence.integration.test.js`. No modifica `ranti_db`.

Las fotos de perfil se preparan en el navegador antes del envío: se decodifican, se convierten a WebP (PNG si el navegador no admite esa codificación), se limita el lado mayor a 2048 píxeles y se reduce calidad y resolución hasta obtener como máximo 2 MiB. El original no se sube y la conversión elimina los metadatos de la imagen. El servidor conserva el límite de 2 MiB y la comprobación del tipo de archivo. Los formatos que el navegador no pueda decodificar requieren conversión previa a JPEG, PNG o WebP; SVG y archivos que no sean fotos se rechazan. Si falla la preparación se conserva el formulario; si falla únicamente la subida, se informa de que los demás datos del perfil sí se guardaron.

Al guardar el perfil con éxito, incluida la foto si se seleccionó una, se vuelve al inicio y aparece el toast «Tu perfil se guardó correctamente.» durante 6 segundos, con cierre manual. El aviso permanece visible al cambiar de ruta y no se repite al recargar. Los errores de guardado o de subida mantienen al usuario en el formulario.

La cabecera y el menú lateral muestran la foto guardada, actualizada al editar el perfil y recuperada desde la API al iniciar sesión. Si no hay foto o no se puede cargar, aparece un icono local. Pulsar cualquiera de los dos abre las opciones de cuenta (perfil, operaciones, publicaciones y cierre de sesión; panel administrativo para administradores). El menú admite teclado, Escape y cierre al pulsar fuera. La foto y el nombre se sincronizan en la sesión conservando la preferencia «Recordarme»; los permisos siguen comprobándose en el servidor.

«Mis publicaciones» presenta las acciones de creación y actualización en una barra adaptable a móvil. Si la lista está vacía, ofrece un acceso a crear la primera publicación; los artículos existentes aparecen en tarjetas con su estado y acciones. Este cambio visual no modifica las reglas de edición ni las confirmaciones de cambio de estado.

Cada petición recibe `X-Request-Id`. Middleware final devuelve `{ error: { code, message, request_id } }`; controladores/middleware heredados conservan sus contratos. Auditoría/outbox rechazan claves sensibles recursivamente; no detectan secretos en texto libre.

`processOutboxBatch` reclama hasta 20 eventos con `FOR UPDATE SKIP LOCKED`, lease de 60 segundos y propietario único; handlers por nombre reciben `(payload, event)`. Reintento `min(2^attempts × 30 segundos, 1 hora)` (primer fallo 60 segundos). Usar Pool/Client en autocommit y confirmar reclamaciones antes de despachar. Entrega al menos una vez: handlers necesitan idempotencia; no hay renovación de lease ni garantía externa exactamente una vez.

Identidad, decisiones de rol, publicaciones y operaciones producen outbox. No hay scheduler/daemon de outbox ni productores conectados para notificaciones completas. `createInAppNotification`, lectura y marcado existen; no entrega automática de estos eventos ni correo. La expiración de solicitudes tiene comando one-shot separado, sin scheduler incluido.

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

Resultados frescos hasta Fase 3, 2026-10-02:

| Comando | Resultado |
|---|---|
| `npm test --prefix server` | 273 pruebas aprobadas, 249 omitidas por requerir PostgreSQL; 15 archivos aprobados, 10 omitidos. |
| `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1` | 522 pruebas aprobadas en 25 archivos, sin omitidas; clúster temporal detenido y limpiado. |
| `npm test --prefix client` | 77 pruebas aprobadas en 11 archivos. |
| `npm run lint --prefix client` | Salida 0. |
| `npm run build --prefix client` | Salida 0; frontend y service worker generados. |
| Validación BPMN | Nuevo archivo de Fase 3 válido: 4 procesos y 1 diagrama, sin advertencias del validador. |
| Render BPMN | SVG de Fase 3 generado; vista PNG derivada inspeccionada. |
| `git diff --check` | Sin errores. |

Cada suite PostgreSQL productora posee una base privada dentro del clúster temporal mediante `server/test/helpers/disposable-database.js`. Esto impide que un `TRUNCATE` o un worker de una suite reclame eventos de otra. La verificación actual pasó 522/522 en paralelo.

No hay proveedor institucional real ni almacén privado de objetos gestionado. Las boletas ya tienen carga binaria y almacenamiento local privado con autorización y auditoría; véase [procedencia](docs/publication-pricing-policy.md#boleta-de-procedencia). Por confirmar: alta operativa de administradores, gobierno de términos/proveedores, cifrado y retención de evidencia, análisis antimalware y despliegue del worker.

Fases posteriores pendientes: economía simulada/productiva, reversión, entrega vinculada a pagos y garantías, reputación, incidencias, moderación general, ARCO y notificaciones completas. `PAYMENT_PROVIDER=simulated` no habilita cobros ni OTP. El piloto incorpora [chat privado, coordinación y declaraciones bilaterales de entrega/devolución](docs/pilot-communications.md), sin acreditar pagos ni resolver discrepancias. La ruta heredada `POST /api/operations/:id/confirm` se rechaza para que no eluda ese acuerdo bilateral. Por confirmar: programación operativa de expiración, despliegue del worker outbox y pruebas de piloto. No se afirma cumplimiento RNF, SUS, disponibilidad, recuperación ni instalación PWA.

## 🛠️ Configuración de la Base de Datos y Datos de Prueba

1. Levanta la base de datos PostgreSQL.
2. Ejecuta las migraciones oficiales para crear las tablas y roles (`node server/src/db/migrate.js`).
3. **(Opcional para Desarrollo):** Para no empezar con la plataforma vacía, puedes poblar el catálogo ejecutando el script `server/src/db/seed.sql` directamente en tu gestor de base de datos (pgAdmin, DBeaver, etc.).
4. El script `seed.sql` creará perfiles de prueba (docentes, estudiantes, egresados) e inyectará 10 publicaciones de prueba con imágenes. La contraseña para todos los usuarios de prueba es: `123456`.
