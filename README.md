# 🚀 Ranti - Plataforma de Intercambio Universitario (UCSM)

Plataforma web colaborativa (P2P) diseñada para optimizar la gestión de préstamo, alquiler remunerado y venta de bienes especializados entre estudiantes y egresados de la Universidad Católica de Santa María (UCSM).

Este proyecto utiliza una arquitectura moderna estructurada en un **Monorepo**:
*   **Frontend:** React + Vite + Tailwind CSS (PWA).
*   **Backend:** Node.js + Express (API REST).
*   **Base de Datos:** PostgreSQL con soporte de bloqueos pesimistas (ACID).

---

## 📋 1. Requisitos Previos del Sistema

Asegúrate de tener instalado el siguiente software en tu dispositivo antes de comenzar:
*   [Node.js](https://nodejs.org/es/) (Versión 20.0.0 o superior).
*   [Git](https://git-scm.com/).
*   [PostgreSQL](https://www.postgresql.org/) (Versión 15 o 16).
*   *Recomendado:* pgAdmin 4 o DBeaver para administrar la base de datos visualmente.

---

## 🗄️ 2. Configuración de la Base de Datos

El núcleo transaccional de Ranti requiere una base de datos relacional para evitar reservas solapadas y mantener la bitácora de auditoría.

1. Abre tu gestor de base de datos (pgAdmin, DBeaver) o la terminal de PostgreSQL (`psql`).
2. Crea una base de datos vacía llamada `ranti_db`:
   ```sql
   CREATE DATABASE ranti_db;

1. Conéctate a la base de datos ranti_db.
2. Ejecuta el script de migración inicial. Abre el archivo ubicado en server/src/db/migrations/001_init_normalized.sql, copia todo su contenido y ejecútalo en la consola de consultas de tu base de datos. Esto creará automáticamente las 10 tablas y los tipos de datos (ENUMs) necesarios.   

## ⚙️ 3. Configuración del Monorepo (package.json raíz)
Para poder levantar el frontend y el backend al mismo tiempo con un solo comando, utilizamos la herramienta concurrently.Asegúrate de que en la raíz del proyecto exista un archivo llamado package.json con el siguiente contenido.
 Si no existe, créalo:
 JSON{
  "name": "ranti-monorepo",
  "version": "1.0.0",
  "private": true,
  "description": "Plataforma de intercambio seguro de bienes universitarios - UCSM",
  "scripts": {
    "setup": "npm install && npm install --prefix server && npm install --prefix client",
    "dev:server": "npm run dev --prefix server",
    "dev:client": "npm run dev --prefix client",
    "dev": "concurrently -c \"cyan.bold,green.bold\" \"npm run dev:server\" \"npm run dev:client\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
## 🔐 4. Variables de Entorno (Archivo .env)
Las credenciales de acceso y configuraciones sensibles nunca deben subirse a GitHub. Cada desarrollador debe crear su propio archivo local en el backend.Dirígete a la carpeta server/.Crea un archivo nuevo y llámalo exactamente .env (sin nombre antes del punto).Pega el siguiente contenido y reemplaza tu_usuario y tu_contraseña con las credenciales locales de tu PostgreSQL:
Fragmento de código# Configuración del servidor
PORT=3000
NODE_ENV=development

# Credenciales de Base de Datos PostgreSQL
# Formato: postgres://USUARIO:CONTRASEÑA@localhost:5432/ranti_db
DATABASE_URL=postgres://tu_usuario:tu_contraseña@localhost:5432/ranti_db

# Secreto para la generación de Tokens de Sesión (JWT)
JWT_SECRET=super_secreto_ranti_pfc_2026
## ⚡ 5. Instalación y Levantamiento del Proyecto
Gracias a la configuración del monorepo, puedes instalar y arrancar todo desde la raíz del proyecto.Paso A: Instalar todas las dependencias (Solo la primera vez o si hay paquetes nuevos)Abre la terminal en la raíz del proyecto y ejecuta:Bash
npm run setup
(Esto instalará concurrently y luego entrará a /client y /server para descargar sus respectivos node_modules).Paso B: Levantar Frontend y Backend juntosEn la misma terminal, ejecuta:Bash
npm run dev
Si todo está configurado correctamente, verás en tu terminal:
✅ Base de datos conectada exitosamente.
🚀 Backend (API): Escuchando en http://localhost:3000
💻 Frontend (React): Disponible en http://localhost:5173