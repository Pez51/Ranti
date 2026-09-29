# 🚀 Ranti - Plataforma de Intercambio Universitario (UCSM)

Plataforma web colaborativa (P2P) diseñada para optimizar la gestión de préstamo, alquiler remunerado y venta de bienes especializados entre estudiantes y egresados de la Universidad Católica de Santa María (UCSM).

Este proyecto utiliza una arquitectura moderna estructurada en un **Monorepo**:
*   **Frontend:** React + Vite + Tailwind CSS (PWA).
*   **Backend:** Node.js + Express (API REST).
*   **Base de Datos:** PostgreSQL con soporte de bloqueos pesimistas (ACID).

El sistema sigue en desarrollo. Las pantallas de pago y entrega muestran indisponibilidad: no procesan cobros, garantías ni confirmaciones. El [seguimiento de correcciones](docs/revision-informe.md) distingue lo implementado de los requisitos pendientes.

---

## 📋 1. Requisitos Previos del Sistema

Asegúrate de tener instalado el siguiente software en tu dispositivo antes de comenzar:
*   [Node.js](https://nodejs.org/es/) 24.x (comprobado con 24.14.1). Node 20 no cumple los requisitos de la versión instalada de Vitest.
*   [Git](https://git-scm.com/).
*   [PostgreSQL](https://www.postgresql.org/) (integración comprobada con la versión 17).
*   *Recomendado:* pgAdmin 4 o DBeaver para administrar la base de datos visualmente.

---

## 🗄️ 2. Configuración de la Base de Datos

Ranti utiliza PostgreSQL para publicaciones, operaciones y reservas. El esquema por sí solo no garantiza todavía la prevención de todos los solapamientos; consulta `docs/revision-informe.md` antes de probar operaciones reales.

1. Abre tu gestor de base de datos (pgAdmin, DBeaver) o la terminal de PostgreSQL (`psql`).
2. Crea una base de datos vacía llamada `ranti_db`:
   ```sql
   CREATE DATABASE ranti_db;
   ```

3. Instala las dependencias y configura `server/.env` como se indica abajo.
4. Desde la raíz ejecuta `npm run migrate --prefix server`. El runner aplica los archivos SQL numerados de `server/src/db/migrations` y registra su checksum SHA-256 en `schema_migrations`.

Las migraciones se serializan con un bloqueo advisory de sesión y cada archivo se aplica en una transacción junto a su historial. Repetir el comando omite archivos ya aplicados; modificar sus bytes (incluidos los finales de línea) produce `MIGRATION_CHECKSUM_MISMATCH` antes de aplicar archivos pendientes. Conserva los bytes originales de las migraciones desplegadas, especialmente `001_init.sql`, y añade cambios en archivos nuevos con prefijos numéricos de tres dígitos crecientes.

Para una base inicializada manualmente con la línea base histórica `001_init.sql`, usa explícitamente `npm run migrate --prefix server -- --adopt-baseline`. Haz respaldo y verifica la base de destino antes de ejecutar el comando: valida las 10 tablas, columnas, defaults, constraints y 14 enums históricos en `public`, registra el checksum real de 001 sin ejecutarla y aplica 002 conservando los datos. Una línea base incompleta o incompatible se rechaza con `BASELINE_ADOPTION_VALIDATION_FAILED`; no hay adopción automática. La validación toma bloqueos de tablas durante la adopción. Repetir el comando usa el historial y omite las migraciones ya aplicadas.

`.gitattributes` fija LF en los SQL para que Windows y Linux calculen los mismos checksums. Cualquier historial experimental creado antes de esta política (por ejemplo, con CRLF) requiere conciliación explícita y respaldada con los bytes que se ejecutaron; el runner nunca modifica checksums guardados silenciosamente. La migración `002` añade metadatos y protección contra UPDATE/DELETE a auditoría, además del esquema de outbox. Los repositorios de auditoría/outbox y la función de procesamiento por lotes ya están implementados; su integración en los módulos de negocio corresponde a fases posteriores.

## ⚙️ 3. Instalación

El `package.json` de la raíz ya contiene los scripts para cliente y servidor. Desde la raíz:

```bash
npm run setup
```

## 🔐 4. Variables de entorno

Crea `server/.env` localmente. El archivo está excluido de Git. Usa tus credenciales de PostgreSQL y genera un secreto JWT largo y aleatorio; no copies un secreto de ejemplo a un despliegue.

```dotenv
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://USUARIO:CONTRASEÑA@localhost:5432/ranti_db
JWT_SECRET=REEMPLAZAR_POR_UN_SECRETO_ALEATORIO
FRONTEND_URL=http://localhost:5173
PAYMENT_PROVIDER=simulated
```

La configuración se valida al cargar la API: `DATABASE_URL` es obligatoria y `JWT_SECRET` debe tener al menos 32 caracteres fuera de pruebas. Se aceptan los nombres `simulated`, `culqi` y `niubiz`, pero esto no implementa ni habilita adaptadores de pago. El piloto no procesa dinero real.

El cliente usa `http://localhost:3000/api` por defecto. Para otra API, crea `client/.env.local`:

```dotenv
VITE_API_URL=https://api.ejemplo.test/api
```

## ⚡ 5. Desarrollo y pruebas

Desde la raíz, ejecuta primero `npm run migrate --prefix server` y después `npm run dev` para iniciar la API y el cliente. Por defecto se sirven en `http://localhost:3000` y `http://localhost:5173`. La API necesita una base de datos configurada y no empieza a escuchar si PostgreSQL no responde. `npm start --prefix server` inicia solo la API; ninguno de los comandos de arranque ejecuta migraciones automáticamente.

Verificación de Fase 1 ejecutada el 2026-09-28, desde la raíz:

| Comando | Resultado |
|---|---|
| `npm test --prefix server` | 65 pruebas aprobadas; 68 de PostgreSQL omitidas; 7 archivos aprobados y 4 omitidos. |
| `powershell -ExecutionPolicy Bypass -File tools/test-postgres.ps1` | 133 pruebas aprobadas en 11 archivos, sin omitidas. |
| `npm test --prefix client` | 7 pruebas aprobadas en 1 archivo. |
| `npm run lint --prefix client` | Salida 0. |
| `npm run build --prefix client` | Salida 0; frontend y service worker generados. |
| `git diff --check` | Sin errores. |

En Windows, ejecuta desde la raíz para comprobar la API contra PostgreSQL real:

```powershell
.\tools\test-postgres.ps1
# Si PostgreSQL está instalado en otra carpeta:
.\tools\test-postgres.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\16\bin'
```

El script crea una instancia exclusiva en una carpeta temporal, usa un puerto local libre y ejecuta toda la suite del servidor. Las pruebas aplican las migraciones mediante el runner y verifican su repetición, concurrencia, checksums y rollback, además de catálogo, autorización, pagos pendientes y concurrencia de reservas/entregas. Detiene y elimina esa instancia al terminar; no modifica las bases de datos existentes ni usa sus credenciales.

### Fundamentos disponibles

Las rutas `/publicar`, `/checkout/:id`, `/entrega/:id`, `/perfil`, `/oferente`, `/reclamaciones` y `/privacidad` requieren sesión; `/admin` requiere además el rol `Administrador`. Una sesión corrupta se trata como ausente. Estos controles del cliente complementan la autorización del servidor.

Cada petición recibe un UUID generado por el servidor en `X-Request-Id`. Los errores que alcanzan el middleware final, las rutas desconocidas y el JSON malformado usan `{ error: { code, message, request_id } }`; las respuestas explícitas de controladores y middleware heredados conservan sus contratos.

`appendAudit(db, event)` inserta auditoría con metadatos y snapshots JSON de objeto; `enqueueOutboxEvent(db, event)` inserta un evento o devuelve el original de la misma `deduplicationKey`. Ambas funciones aceptan un Pool o el cliente de la transacción de negocio. Rechazan claves `password`, `token`, `otp`, `pan` y `cvv` de forma recursiva y sin distinguir mayúsculas. Esto comprueba nombres de claves, no identifica secretos ocultos en texto libre.

`processOutboxBatch({ db, handlers, workerId })` reclama hasta 20 eventos mediante una sentencia atómica con `FOR UPDATE SKIP LOCKED`, invoca handlers registrados por el nombre exacto del evento y confirma cada resultado únicamente para su propietario actual. Los fallos, incluidos eventos sin handler, incrementan `attempts`, guardan un diagnóstico fijo sin texto crudo de la excepción y reprograman `min(2^attempts × 30 segundos, 1 hora)`; el primer fallo espera 60 segundos. El handler recibe `(payload, event)`.

El worker debe recibir un Pool o un Client en autocommit, fuera de una transacción del llamador. Las reclamaciones pueden usarse con clientes transaccionales, pero deben confirmarse antes de despachar handlers. El lease por defecto es de 60 segundos; todos los reclamadores de la misma cola deben usar la misma duración y cada ejecución concurrente debe tener un `workerId` único. Un lease vencido puede recuperarse; un propietario reemplazado no puede completar ni fallar la fila. La entrega de efectos es **al menos una vez**: una caída después del efecto y antes de confirmar, o un handler que supera el lease, puede repetirlo. Los handlers deben aplicar idempotencia usando el ID/clave del evento; no se garantiza ejecución externa exactamente una vez ni renovación automática del lease.

`createInAppNotification(db, payload)` ofrece la frontera de creación de notificaciones; se registra como `payload => createInAppNotification(db, payload)`. La lectura y el marcado como leída permanecen disponibles. No hay daemon, scheduler ni productores de eventos conectados todavía; las fases posteriores deben integrar y ejecutar esta infraestructura y deduplicar los efectos de cada handler.

## 6. Acceso y operaciones pendientes

La Fase 1 aporta fundamentos técnicos. Siguen pendientes los RF posteriores de identidad/verificación, perfiles, riesgo y edición de publicaciones, aceptación y cancelación, economía simulada, entrega/cierre completo, incidencias, moderación, ARCO, reputación, notificaciones completas y evidencia operativa de RNF. La infraestructura no declara esos requisitos terminados.

El registro público crea estudiantes pendientes de verificación. El JWT permite consultar la sesión, pero publicar y realizar operaciones exige `status = 'Activa'` y `verification_status = 'Verificado'`. El servidor consulta esos valores y el rol vigente en cada petición; una suspensión o cambio de rol se aplica también a tokens emitidos previamente.

El flujo administrativo/institucional de verificación aún está pendiente. La entrega por API requiere `Lista para entrega`, consume el OTP y actualiza operación, reserva y auditoría en una transacción. Aún faltan aceptación, validación económica, caducidad y hash del OTP y confirmaciones separadas de ambas partes. No existe una ruta pública que salte esos pasos para habilitar una entrega.

La creación de operaciones requiere una publicación activa. Alquiler y préstamo requieren inicio y fin válidos, con fin posterior al inicio; venta no admite fechas de reserva. Las fechas aceptan ISO 8601 con zona horaria o `YYYY-MM-DD` (medianoche de Perú, UTC−05:00); se normalizan a UTC antes de persistir.
