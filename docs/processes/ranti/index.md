# Procesos observados en Ranti

Inventario del commit `3d87e3c`, elaborado a partir de rutas, controladores, componentes y migración. Los BPMN describen el comportamiento programado; no representan procesos futuros del informe como si ya estuvieran implementados. Cada elemento BPMN incluye la fuente en `bpmn:documentation`.

> Nota de vigencia: estos BPMN y las observaciones de abajo son una fotografía histórica del commit citado, no del árbol de trabajo corregido. Cambiaron registro, autorización por cuenta verificada, catálogo, privacidad y transacciones de reserva/entrega. El checkout y la pantalla OTP ahora indican indisponibilidad. Consulta el [estado actualizado de las correcciones](../../revision-informe.md#estado-de-las-correcciones--2026-09-28) antes de utilizar estos diagramas como referencia.

| Proceso | Inicio y resultado observado | Artefactos |
|---|---|---|
| Registro | `POST /api/auth/register`; crea usuario y emite JWT. | [BPMN](registro.bpmn) · [SVG](registro.svg) |
| Inicio de sesión | `POST /api/auth/login`; valida contraseña y estado suspendido, luego emite JWT. | [BPMN](inicio-sesion.bpmn) · [SVG](inicio-sesion.svg) |
| Publicar bien | `POST /api/publications`; intenta guardar publicación e imágenes en una transacción. | [BPMN](publicar-bien.bpmn) · [SVG](publicar-bien.svg) |
| Crear operación | `POST /api/operations`; bloquea publicación, consulta reserva, crea operación y, según modalidad, reserva. | [BPMN](crear-operacion.bpmn) · [SVG](crear-operacion.svg) |
| Confirmar entrega | `POST /api/operations/:id/confirm`; verifica oferente, estado y OTP; actualiza operación. | [BPMN](confirmar-entrega.bpmn) · [SVG](confirmar-entrega.svg) |
| Leer notificaciones | `GET /api/notifications` y `PATCH /api/notifications/:id/read`; lista y marca propias. | [BPMN](leer-notificaciones.bpmn) · [SVG](leer-notificaciones.svg) |

## Evidencia esencial

| Elemento | Código que lo confirma | Estado |
|---|---|---|
| Registro y login | `server/src/routes/auth.routes.js`, `server/src/controllers/auth.controller.js` | API presente; interfaz de login simulada en `client/src/features/auth/Login.jsx`. |
| Publicación y catálogo | `server/src/routes/publication.routes.js`, `server/src/controllers/publication.controller.js` | API presente; inserción usa `faculty_category`, ausente en la migración (`category`). Catálogo del cliente usa `mockProducts`. |
| Reserva | `server/src/controllers/operation.controller.js::createOperation`, `server/src/db/migrations/001_init.sql` | Flujo parcial. Retornos 400/409 dejan la transacción abierta antes de liberar la conexión; falta validación de estado y fechas. |
| Entrega | `server/src/controllers/operation.controller.js::confirmDelivery` | Flujo parcial. Acepta `Pendiente de pago/garantía` y solo registra la acción del oferente. La pantalla compara un OTP fijo. |
| Notificaciones | `server/src/controllers/notification.controller.js`, `client/src/components/layout/NotificationDrawer.jsx` | Lectura y marcado presentes. No se encontró llamada a `createNotification` desde los procesos transaccionales. |

## Procesos del informe aún no demostrados por código

- Verificación de identidad y condición académica; aceptación o rechazo de solicitud.
- Procesamiento real de pagos y garantías; devolución, cierre y reputación.
- Moderación, incidencia, reporte de usuario y ejercicio ARCO en el servidor.
- Edición, pausa, retiro y cancelación de publicaciones u operaciones.

**Por confirmar:** proveedor económico, reglas de verificación de egresados y orden de los estados de pago, aceptación y entrega. Estas decisiones están descritas en el informe, pero no cuentan con rutas ni transiciones completas en el código actual.

## Inconsistencias que afectan los diagramas

- `registro.bpmn` muestra el JWT emitido al crear la cuenta, aunque el estado inicial de usuario es `Pendiente de verificación` y no se valida correo ni consentimiento.
- `publicar-bien.bpmn` muestra la ruta de éxito intentada; con la migración incluida, el `INSERT` falla porque `faculty_category` no existe.
- `crear-operacion.bpmn` representa el 400/409 observado. Esos retornos se ejecutan después de `BEGIN` sin `ROLLBACK` explícito.
- `confirmar-entrega.bpmn` muestra el estado `Entregada/Activa`, pero la reserva relacionada no cambia a `Activa/En uso`.
- `leer-notificaciones.bpmn` parte de la bandeja del cliente. La pantalla de login actual no guarda un token; sin obtenerlo por otra vía, la API responderá 401.

Para el diagnóstico completo frente a los 32 requisitos funcionales y 10 no funcionales, ver [revisión del informe](../../revision-informe.md).
