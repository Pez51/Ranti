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

`.gitattributes` fija LF en los SQL para que Windows y Linux calculen los mismos checksums. Cualquier historial experimental creado antes de esta política (por ejemplo, con CRLF) requiere conciliación explícita y respaldada con los bytes que se ejecutaron; el runner nunca modifica checksums guardados silenciosamente. La migración `002` añade metadatos y protección contra UPDATE/DELETE a auditoría, además del esquema de outbox. Los repositorios y el trabajador outbox corresponden a tareas posteriores.

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
```

El cliente usa `http://localhost:3000/api` por defecto. Para otra API, crea `client/.env.local`:

```dotenv
VITE_API_URL=https://api.ejemplo.test/api
```

## ⚡ 5. Desarrollo y pruebas

Desde la raíz, `npm run dev` inicia la API y el cliente. Por defecto se sirven en `http://localhost:3000` y `http://localhost:5173`. La API necesita una base de datos configurada y no empieza a escuchar si PostgreSQL no responde.

Desde `server`, `npm test` ejecuta las pruebas unitarias. Las pruebas de integración se omiten si no se suministra la instancia temporal. Desde `client`, `npm run lint` comprueba el código y `npm run build` genera el frontend.

En Windows, ejecuta desde la raíz para comprobar la API contra PostgreSQL real:

```powershell
.\tools\test-postgres.ps1
# Si PostgreSQL está instalado en otra carpeta:
.\tools\test-postgres.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\16\bin'
```

El script crea una instancia exclusiva en una carpeta temporal, usa un puerto local libre y ejecuta toda la suite del servidor. Las pruebas aplican las migraciones mediante el runner y verifican su repetición, concurrencia, checksums y rollback, además de catálogo, autorización, pagos pendientes y concurrencia de reservas/entregas. Detiene y elimina esa instancia al terminar; no modifica las bases de datos existentes ni usa sus credenciales.

## 6. Acceso y operaciones pendientes

El registro público crea estudiantes pendientes de verificación. El JWT permite consultar la sesión, pero publicar y realizar operaciones exige `status = 'Activa'` y `verification_status = 'Verificado'`. El servidor consulta esos valores y el rol vigente en cada petición; una suspensión o cambio de rol se aplica también a tokens emitidos previamente.

El flujo administrativo/institucional de verificación aún está pendiente. La entrega por API requiere `Lista para entrega`, consume el OTP y actualiza operación, reserva y auditoría en una transacción. Aún faltan aceptación, validación económica, caducidad y hash del OTP y confirmaciones separadas de ambas partes. No existe una ruta pública que salte esos pasos para habilitar una entrega.

La creación de operaciones requiere una publicación activa. Alquiler y préstamo requieren inicio y fin válidos, con fin posterior al inicio; venta no admite fechas de reserva. Las fechas aceptan ISO 8601 con zona horaria o `YYYY-MM-DD` (medianoche de Perú, UTC−05:00); se normalizan a UTC antes de persistir.
