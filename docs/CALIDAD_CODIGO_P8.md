# Aseguramiento de calidad de RANTI — Práctica 8

Fecha local: 31/10/2026 (America/Lima). Repositorio: https://github.com/Pez51/Ranti. Carpeta: `C:\Ranti`. HEAD inicial: `d0f737ee9108ddbe8ef5344ad12be0276cb6a948`, rama `main`.

## Alcance y estado verificable

Se configuraron cobertura Vitest V8, ESLint del backend, comprobación de JavaScript con TypeScript (`allowJs`, `checkJs`, `noEmit`), SonarQube Cloud y GitHub Actions. Los hashes SHA-256 verificaron que los 81 archivos de pruebas existentes conservan exactamente su contenido. No se modificaron migraciones ni contratos funcionales para ocultar errores.

**Existen validaciones fallidas: no se puede afirmar que todas las pruebas, el Quality Gate o CI estén aprobados.** Crear un proyecto Sonar y escribir un workflow no equivale a ejecutarlos.

La copia local ya tenía cambios funcionales, eliminaciones y pruebas nuevas sin commit. Los resultados siguientes corresponden a esa copia local, no solamente a HEAD. Antes de atribuirlos a una ejecución remota debe verificarse que se evalúa el mismo contenido.

## Tecnologías observadas

| Capa | Evidencia real |
|---|---|
| Cliente | React 19.2.8, JavaScript/JSX, React Router 7.18.4, Vite 8.3.0, Tailwind CSS 3, PWA con vite-plugin-pwa |
| API | Node.js ESM, Express 5.2.1, JavaScript, PostgreSQL/pg, Zod, JWT, bcryptjs, Winston y node-cron |
| Pruebas | Vitest 5.0.2 cliente, 5.0.1 servidor; Testing Library/jsdom y Supertest |
| Entorno ejecutado | Node 24.14.1, npm 11.11.0, PostgreSQL 17.4 temporal |
| Instalación | Tres paquetes y lockfiles independientes: raíz, client y server. Sin npm workspaces |

La aplicación no está escrita en TypeScript. El nuevo typecheck analiza JavaScript sin convertir archivos ni generar salida. Excluye pruebas y artefactos del chequeo de tipos; Vitest sigue ejecutando todas las pruebas. No equivale a una migración con tipado estricto.

El PDF previo `Practica8 ranti.pdf` contiene otras tecnologías y métricas (incluye Jest y TypeScript); no demuestra el estado actual. No se reutilizaron sus cifras ni sus afirmaciones de aprobación. La guía exige análisis estático real y CI con pruebas por cambio; staging es opcional y no se configuró al no existir un destino indicado.

## Resultados locales reales

| Validación | Resultado | Salida |
|---|---|---:|
| ESLint cliente | Aprobado | 0 |
| Compilación Vite/PWA | Aprobada; dist, service worker y precache generados | 0 |
| Vitest cliente con V8 | 227 aprobadas, 0 fallidas, 0 omitidas; 36 archivos | 0 |
| ESLint servidor | 16 errores, 0 advertencias | 1 |
| Typecheck cliente | 28 diagnósticos TS tras corregir tipos de Vite y lib ES2024 | 2 |
| Typecheck servidor | 98 diagnósticos TS | 2 |
| Vitest servidor con PostgreSQL y V8 | 462 aprobadas, 160 fallidas, 0 omitidas; 45 archivos, 12 con fallos | 1 |
| Preparación LCOV | Ambos informes preparados con rutas relativas a la raíz | 0 |
| Instalación reproducible | npm run ci:install completó los tres npm ci en una carpeta temporal aislada | 0 |

Primera ejecución del servidor sin PostgreSQL: 274 aprobadas, 27 fallidas y 321 omitidas. Después se habilitaron las pruebas de integración en un clúster desechable; no quedaron omitidas. No confundir ambos resultados.

### Cobertura real V8

Incluye todo el código bajo client/src, server/src y server/server.js, incluso archivos no importados por las pruebas. Se excluyen pruebas y soporte. Se genera cobertura aunque fallen pruebas (`reportOnFailure: true`). Cobertura alta no demuestra corrección del comportamiento.

| Medida | Cliente | Servidor |
|---|---:|---:|
| Líneas | 82,57 % (1208/1463) | 86,75 % (1736/2001) |
| Sentencias | 76,23 % (1944/2550) | 83,23 % (2329/2798) |
| Funciones | 70,89 % (553/780) | 88,21 % (419/475) |
| Ramas | 73,22 % (1939/2648) | 82,96 % (1734/2090) |

Fuentes: coverage/coverage-summary.json de cada paquete, informes HTML coverage/index.html y JSON Vitest en reports/quality-p8. Las métricas Sonar pueden diferir: no sustituirlas por porcentajes de V8.

## Hallazgos y correcciones

| Hallazgo | Evidencia y tratamiento |
|---|---|
| Contratos desalineados | Varias pruebas esperan decideStudentRole, decidePublicationReview o processOutboxBatch que no están disponibles donde se importan. Pruebas conservadas |
| Errores HTTP | Las pruebas esperan un sobre error normalizado; varias respuestas actuales difieren. Controladores probados directamente también esperan next |
| Integración | Fallos en historial de migraciones, valores numéricos como string, códigos HTTP y flujos de roles/publicaciones. Pendiente decidir contrato correcto antes de cambiar negocio o expectativas |
| Lint servidor | no-unsafe-finally en migraciones, variables/argumentos sin usar y asignaciones inútiles. Lista completa en server-lint.log |
| Tipos | Propiedades de Error, argumentos/props obligatorios, Element.focus, EventTarget.src, FormData y unión HTMLImageElement/ImageBitmap. Sin ts-nocheck ni noCheck global |
| Entorno del typecheck | Se añadieron los tipos vite/client para import.meta.env y ES2024 para Object.groupBy, utilizado por el código real. Se repitió typecheck: cliente pasó de 30 a 28 diagnósticos; servidor conserva 98. No se añadieron polyfills ni se modificó lógica |
| Dependencias | npm audit: raíz 6 (5 moderadas, 1 crítica); cliente 26 (3 bajas, 18 moderadas, 5 altas); servidor 11 (7 moderadas, 4 altas). No sumar por duplicidades. Es auditoría de dependencias, distinta de Sonar. No se ejecutó audit fix --force |
| Cobertura antes ausente | Proveedores V8 con la versión exacta de cada Vitest; reportes HTML, LCOV y JSON; inclusión explícita de todo el código |
| LCOV en monorepo | tools/prepare-sonar-coverage.mjs genera sonar-lcov.info con prefijos client/ y server/, conserva contadores y original, y rechaza fuentes fuera del repositorio |
| Lanzador PostgreSQL Windows | La captura de salida bloqueaba el arranque. Se separaron streams de pg_ctl con Start-Process -WindowStyle Hidden y se esperó únicamente su proceso. La ejecución corregida completó pruebas y detuvo/limpió su clúster |
| Dialecto SQL en Sonar | El primer scanner clasificó los archivos PostgreSQL como Oracle PL/SQL y emitió errores de parsing. Se limitó PL/SQL a la extensión .plsql y se mantuvieron los .sql en inspección de texto/secretos. No se afirma análisis semántico PostgreSQL con un parser incompatible |
| Cambios anteriores | Se preservan. git diff --check global detecta espacios finales ajenos a esta configuración; no se limpiaron incidentalmente |

Distribución de las 160 pruebas fallidas por archivo:

| Archivo | Fallidas |
|---|---:|
| decision-privacy.test.js | 10 |
| http-foundations.test.js | 4 |
| migrations.integration.test.js | 4 |
| operation-lifecycle.integration.test.js | 35 |
| outbox.integration.test.js | 5 |
| outbox.repository.test.js | 7 |
| p0-regressions.test.js | 6 |
| phase2-migration.integration.test.js | 4 |
| phase3-migration.integration.test.js | 5 |
| postgres.integration.test.js | 13 |
| profile-and-role-review.integration.test.js | 9 |
| publication-lifecycle.integration.test.js | 58 |

La tabla incluye pruebas unitarias e integración; no significa que todas sean de integración. Los errores de negocio y contratos siguen pendientes: corregirlos excede modificar solamente configuración.

## Reproducción

Desde C:\Ranti, PowerShell. Usar npm.cmd si la política local bloquea npm.ps1:

```powershell
npm run ci:install
npm run lint --prefix client
npm run lint --prefix server
npm run typecheck --prefix client
npm run typecheck --prefix server
npm run test:coverage --prefix client -- --reporter=default --reporter=json --outputFile=coverage/vitest-results.json
& ./tools/test-postgres.ps1 -TestArguments @('--coverage','--reporter=default','--reporter=json','--outputFile=coverage/vitest-results.json','--maxWorkers=2')
npm run build --prefix client
npm run sonar:coverage
```

Se ejecutaron las validaciones por separado para obtener todos los resultados. Los scripts agregados de raíz lint, typecheck, test y test:coverage encadenan los paquetes y terminan al primer fallo. Para diagnóstico completo usar comandos separados o Actions. Las herramientas de tipos/lint backend están en la raíz: instalar solamente server no basta.

El helper PostgreSQL establece TEST_DATABASE_URL y RANTI_EPHEMERAL_DB=1, crea una instancia propia con puerto libre, usuario/base ranti_test y carpeta temporal única. Las suites crean bases privadas. Nunca apunta a ranti_db ni a la aplicación en localhost:5173. La modificación afecta únicamente al arranque de procesos; no cambia SQL ni reglas funcionales.

## SonarQube Cloud

Organización: pablogiaccomo. Project Key: pablogiaccomo_ranti. [Abrir proyecto privado](https://sonarcloud.io/project/overview?id=pablogiaccomo_ranti).

Se usa la cuenta GitHub existente; no se creó una contraseña independiente. La organización se inició con la opción gratuita sin tarjeta ni confirmación de pago. Revisar Billing y límites vigentes antes de utilizar funciones de pago.

El proyecto se creó manualmente porque la instalación de la cuenta personal no listaba Pez51/Ranti. Esto no vincula automáticamente el repositorio para decoraciones de PR: el administrador correspondiente deberá autorizar/vincular el repositorio para esa función. El análisis por token y claves se configura independientemente.

sonar-project.properties define fuentes, clasificación de pruebas, exclusiones de dependencias/artefactos y los dos LCOV preparados. Excluye node_modules, dist/build, coverage, reports, scannerwork, cargas y archivos minificados; las pruebas se excluyen de fuentes y se incluyen como tests. No se excluye negocio por tener cobertura baja.

La modalidad elegida es CI con GitHub Actions. No activar análisis automático simultáneo al análisis que importa cobertura. sonar.qualitygate.wait=true conserva el job fallido cuando Sonar rechaza el Quality Gate. Se reportarán bugs/fiabilidad, vulnerabilidades/seguridad, code smells/mantenibilidad, duplicación y cobertura conforme a perfiles/reglas activos. Los hotspots requieren revisión humana. No se inventan cifras de Sonar.

GitHub no tenía secretos existentes al comenzar. Se añadió SONAR_TOKEN en Settings → Secrets and variables → Actions y se verificó “Repository secret added”. No está en el código ni en este documento; no se modificaron secretos anteriores.

Variables públicas del workflow: SONAR_ORGANIZATION=pablogiaccomo y SONAR_PROJECT_KEY=pablogiaccomo_ranti. Estos identificadores también están en properties. Un scanner local debe recibir SONAR_TOKEN exclusivamente mediante su entorno, sin argumentos ni archivos versionados.

## GitHub Actions

Archivo: .github/workflows/calidad-p8.yml. Eventos: push a main, PR dirigido a main y ejecución manual. Node 24, npm ci con tres lockfiles y PostgreSQL 17 desechable. Las credenciales del servicio PostgreSQL son datos de prueba efímeros, sin conexión a una base real.

La matriz separa cliente/servidor y ejecuta lint, tipos y pruebas aunque un paso anterior falle; compila cliente; conserva cobertura y logs 14 días. No utiliza continue-on-error para convertir fallos en éxito. Acciones fijadas por SHA de tags comprobados en repositorios oficiales.

Sonar descarga los reportes e intenta analizar aunque fallen validaciones, siempre que haya cobertura. Si falta un reporte, secreto o variable, falla explícitamente. PR de forks y Dependabot ejecutan validaciones sin recibir token ni lanzar Sonar. Se usa pull_request, no pull_request_target, con permiso contents: read.

No hay despliegue configurado ni se afirma CD implementado.

## Archivos de esta implementación

- `.github/workflows/calidad-p8.yml`: ejecución automática y artefactos.
- `sonar-project.properties`: alcance, claves públicas y reportes LCOV.
- `package.json` y `package-lock.json`: herramientas compartidas y comandos.
- `client/package.json`, `client/package-lock.json`, `server/package.json`, `server/package-lock.json`: proveedores de cobertura y scripts de cada paquete.
- `client/vitest.config.js`, `server/vitest.config.js`: cobertura de fuentes completas.
- `client/eslint.config.js`: ignorar cobertura generada; reglas existentes conservadas.
- `server/eslint.config.js`: análisis del servidor y sus pruebas.
- `client/tsconfig.check.json`, `server/tsconfig.check.json`: typecheck JavaScript.
- `tools/prepare-sonar-coverage.mjs`: normalización de rutas, sin alterar contadores; se verificaron las 59 fuentes cliente y 78 servidor del LCOV local.
- `tools/test-postgres.ps1`: arranque oculto y captura fiable de PostgreSQL temporal en Windows.
- `.gitignore`: excluir informes, cobertura y scannerwork.
- `docs/CALIDAD_CODIGO_P8.md`: este informe.

Los cambios funcionales previos permanecen locales por indicación expresa del usuario; solamente se publicó esta configuración de calidad. Se validó YAML, instalación limpia de los tres paquetes y conservación de las 81 pruebas mediante SHA-256.

La revisión automática rechazó la limpieza de las carpetas temporales de instalación y de dos arranques de diagnóstico. No indicó un motivo específico. Permanecen fuera del repositorio; esas instancias PostgreSQL están detenidas. El clúster de la ejecución completa corregida sí fue detenido y limpiado por el helper.

## Capturas y evidencias para la rúbrica

1. Terminal con lint, tipos y resúmenes Vitest completos, mostrando fallos reales y omitidas.
2. Ambos coverage/index.html: totales y módulos sin cobertura.
3. GitHub Actions: URL de ejecución, SHA, rama, jobs, pasos, logs y artefactos. Un YAML local no acredita ejecución.
4. Sonar: proyecto, fecha/SHA, Overview/Quality Gate, Issues por seguridad/fiabilidad/mantenibilidad, Security Hotspots, cobertura y duplicación. Nunca capturar el token.
5. Hallazgo real con regla, archivo/línea y explicación. Las correcciones funcionales requieren un cambio posterior y repetir pruebas/scan antes de compararlas.
6. GitHub Settings: nombre SONAR_TOKEN oculto y variables públicas. Evidencia local: reports/quality-p8/github-sonar-secret.png.
7. Guardar JSON, LCOV y logs identificando la versión evaluada. reports, coverage y scannerwork están ignorados en Git: copiar o descargar artefactos para el informe.

## Fuentes oficiales

- [Cobertura JavaScript/TypeScript en Sonar](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/test-coverage/javascript-typescript-test-coverage): importa LCOV generado antes del scanner; no produce cobertura ejecutando Vitest.
- [Vitest Coverage](https://vitest.dev/guide/coverage.html): proveedor V8, inclusión de fuentes y reportes.
- [Acción SonarQube Scan](https://github.com/SonarSource/sonarqube-scan-action): escaneo CI y autenticación por entorno.
- [Secretos de GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets): alcance y restricciones en forks/Dependabot.
- [TypeScript checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html): comprobación de archivos JavaScript.

## Estado remoto al cierre

Se publicó únicamente configuración de calidad en main mediante el commit e325b04080f5f2a94f86e98cbe27ba139f128708. [Primera ejecución automática](https://github.com/Pez51/Ranti/actions/runs/41257406387): instalación y generación/publicación de los cuatro artefactos verificadas; jobs de validación fallidos por hallazgos de tipos/lint/pruebas del código publicado.

Se detectó que Sonar había creado master como principal y main como secundaria. Con confirmación expresa del usuario se eliminó exclusivamente esa rama secundaria de análisis y se renombró la principal a main, sin eliminar ramas ni código GitHub. Se repite el análisis después de corregir este ajuste, el dialecto SQL y los tipos de entorno del chequeo. El primer intento no se usa como evidencia del estado final.

Las variables públicas SONAR_ORGANIZATION y SONAR_PROJECT_KEY fueron guardadas y verificadas en GitHub. El token fue aceptado por el scanner al comunicarse con SonarQube Cloud. Los fallos locales documentados siguen pendientes de resolución funcional; no se afirma CI aprobado.

[Ejecución corregida número 2](https://github.com/Pez51/Ranti/actions/runs/41258080188), commit bb83882b0dd17fe8ed2d932017396ed8af81b879: instalación reproducible y carga de artefactos completadas en ambos jobs. En cliente, lint, Vitest y compilación aprobados; typecheck fallido. En servidor, lint, typecheck y Vitest fallidos. El job Sonar recibió ambos artefactos y validó claves/token. Estos estados se comprobaron en la API pública de GitHub y se conservaron en reports/quality-p8/remote-run-2.json y remote-jobs-2.json. Los datos remotos corresponden al código publicado, mientras las métricas locales anteriores incluyen los avances que el usuario decidió no publicar.

El registro del scanner corregido confirmó `Sensor JavaScript/TypeScript Coverage` y la lectura de los dos archivos sonar-lcov.info de cliente/servidor. También confirmó inspección de texto/secretos de 219 fuentes. SonarScanner CLI utilizado por la acción: 8.1.0.6389. En la primera ejecución, el frontend publicado ejecutó 195 pruebas aprobadas en 28 archivos, frente a las 227 pruebas/36 archivos de la copia local: son versiones diferentes, no una pérdida de pruebas.

### Resultado real de SonarQube Cloud

La ejecución 2 terminó con conclusión failure. El scanner generó y subió el informe, esperó su procesamiento y registró a las 00:52:36 UTC del 01/11/2026 (19:52:36 del 31/10 en Lima): `QUALITY GATE STATUS: FAILED`, `EXECUTION FAILURE`, salida 3. Esto es rechazo de la puerta de calidad después de analizar, no un fallo de autenticación ni ausencia de cobertura. Evidencia: reports/quality-p8/github-sonar-quality-gate-failed.png y el job Sonar de la ejecución enlazada.

| Medida del código publicado | Valor observado |
|---|---:|
| Cobertura Sonar, código total | 81,2 % |
| Líneas duplicadas, código total | 0,4 % |
| Incidencias distintas, código total | 30 |
| Incidencias con impacto en seguridad | 6; rating E |
| Incidencias con impacto en fiabilidad | 24; rating D |
| Incidencias con impacto en mantenibilidad | 5; rating A |
| Security hotspots | 0 |
| Riesgos de dependencias | 41; rating C |

Una incidencia puede afectar varias calidades: no sumar 6 + 24 + 5 como si fueran incidencias distintas. Los riesgos de dependencias tampoco equivalen a las cifras npm audit ni deben sumarse a ellas. Estas cifras pertenecen al commit publicado bb83882b, no a los cambios funcionales locales sin publicar.

Hallazgos concretos que se dejaron abiertos para revisión:

- Cinco hashes bcrypt incrustados en server/src/db/seed.sql, líneas 15–19, clasificados por Sonar como seguridad Blocker y etiquetados secret. No se reproducen los valores ni contraseñas. Revisar el aprovisionamiento de cuentas de demostración y evitar reutilizarlas en entornos reales. No se excluyó el archivo para ocultarlos ni se marcaron automáticamente como falsos positivos.
- `Path Traversal via unsanitized user input` en server/src/modules/publications/publication-photo.js, línea 21, impacto Security Blocker. [Abrir incidencia](https://sonarcloud.io/project/issues?open=AaGUl9_dwmll2o7CZrR2&id=pablogiaccomo_ranti). Revisar el flujo de identificadores y la contención de rutas antes de decidir una corrección. Es un hallazgo estático pendiente de validar, no una explotación demostrada durante estas pruebas.

No se modificaron reglas, severidades, exclusiones de negocio ni estados de las incidencias para conseguir un Gate verde. La interfaz Summary mostraba inicialmente Not computed y avisaba que el próximo análisis actualizaría el estado; el registro del scanner de esa ejecución sí informó FAILED. Conservar ambas evidencias si persiste la diferencia y comprobar nuevamente el panel en el siguiente análisis. La interfaz también informa que ignora cobertura/duplicación de código nuevo cuando hay menos de 20 líneas nuevas; esa política predeterminada no se cambió.

Capturas locales disponibles: sonar-summary-final.png (métricas), sonar-overview-final.png, sonar-main-configured.png, github-sonar-quality-gate-failed.png y github-sonar-secret.png, todas en reports/quality-p8. El resultado global de CI sigue fallido por hallazgos reales; esta implementación configura y verifica su detección, sin afirmar que el producto haya alcanzado calidad aprobada.

### Pasos manuales que pueden seguir siendo necesarios

- Para acceder a Sonar, usar el mismo inicio de sesión GitHub. No existe una contraseña nueva que entregar; el token permanece en GitHub Secrets.
- Para decoraciones de PR, el propietario de Pez51 debe autorizar la aplicación GitHub de SonarQube Cloud para Ranti y completar la vinculación en Sonar → Administration → General settings → Repository binding. La cuenta personal utilizada no ofrecía ese repositorio en la importación.
- Revisar los límites/condiciones del plan en Billing y la disponibilidad de análisis de PR. No se autorizaron pagos ni actualizaciones de plan.
- Resolver los hallazgos de código y contratos en cambios posteriores; repetir checks sin retirar pruebas ni desactivar reglas para forzar aprobación.
- Guardar las capturas enumeradas en este informe y descargar los artefactos desde Actions. La descarga automática de artefactos se bloqueó en el navegador durante esta sesión; los cuatro artefactos sí quedaron publicados en GitHub.
