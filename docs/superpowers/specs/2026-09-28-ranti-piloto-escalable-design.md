# Ranti: diseño del piloto académico escalable

Fecha: 2026-09-28  
Estado: propuesta aprobada conversacionalmente, pendiente de revisión del documento  
Fuente funcional: `Informe_Capitulo_1_Ranti.md` y `docs/revision-informe.md`

## 1. Objetivo

Completar Ranti como piloto académico funcional para la comunidad UCSM, sin procesar dinero real, conservando contratos técnicos que permitan sustituir identidad y pagos simulados por proveedores de producción sin reescribir el dominio, los flujos ni el cliente.

El piloto debe cubrir los requisitos RF-01 a RF-32 en el alcance descrito por el informe, producir evidencia para los RNF comprobables localmente y señalar con precisión aquello que solo puede validarse durante un piloto operativo o mediante contratos de terceros.

## 2. Alcance y límites

El piloto incluirá:

- registro, verificación de correo y administración de roles;
- perfiles y estado de cuenta;
- publicaciones, disponibilidad, riesgo, edición, pausa y retiro;
- solicitudes, aceptación, reservas, pagos y garantías simulados;
- entrega con OTP, devolución, conformidad y cierre;
- incidencias, moderación, reputación y notificaciones;
- solicitudes ARCO y auditoría;
- pruebas funcionales, de autorización, transaccionales y de concurrencia;
- BPMN y documentación sincronizados con el comportamiento implementado.

El piloto no incluirá:

- cobros o retenciones bancarias reales;
- almacenamiento de PAN, CVV u otros datos de tarjeta;
- SSO institucional real sin acceso formal al servicio UCSM;
- afirmaciones de custodia, SLA o cumplimiento de terceros no contratados;
- evidencia de disponibilidad de siete días o resultados SUS inventados.

## 3. Decisiones principales

1. Se mantendrá un monolito modular con Express y PostgreSQL.
2. Las integraciones externas usarán puertos y adaptadores.
3. PostgreSQL será la autoridad para estados, reservas, idempotencia y auditoría.
4. Las acciones críticas se resolverán en una sola transacción local.
5. Los efectos asíncronos usarán una tabla outbox.
6. Las migraciones serán incrementales; `001_init.sql` permanecerá como línea base histórica.
7. Los adaptadores reales estarán deshabilitados por defecto y exigirán configuración explícita.

## 4. Arquitectura modular

```text
HTTP route
  -> validation/authentication
  -> application use case
  -> domain policy/state transition
  -> repository or provider port
  -> PostgreSQL transaction
       -> domain data
       -> audit event
       -> outbox event
  -> sanitized HTTP response

Outbox worker
  -> notification adapter / simulated webhook delivery
```

### 4.1 Módulos

| Módulo | Responsabilidad |
|---|---|
| `identity` | Registro, verificación de correo, solicitud de rol y futuro SSO. |
| `users` | Perfil, condición académica, estado de cuenta y permisos. |
| `publications` | Publicación, disponibilidad, edición, riesgo, pausa y retiro. |
| `operations` | Solicitud, decisión, reserva, cancelación y máquina de estados. |
| `payments` | Pago, garantía, reversión, conciliación e idempotencia. |
| `delivery` | OTP, entrega, recepción, devolución y evidencias. |
| `incidents` | Reportes, disputas, evidencia y resolución. |
| `reputation` | Calificaciones permitidas y recálculo de reputación. |
| `notifications` | Bandeja, preferencias, archivo y despacho desde outbox. |
| `privacy` | Solicitudes ARCO y seguimiento. |
| `moderation` | Revisión de roles, publicaciones, usuarios e incidencias. |
| `audit` | Registro inmutable y consultable de acciones críticas. |

Los controladores serán adaptadores HTTP delgados. Las reglas de transición, autorización y cálculo no residirán en controladores ni componentes React.

## 5. Identidad y roles

### 5.1 Regla de correo

Un correo es institucional cuando su dominio termina en `ucsm.edu.pe` respetando límites de dominio. Son válidos `persona@ucsm.edu.pe` y `persona@estudiante.ucsm.edu.pe`; no es válido `persona@ucsm.edu.pe.otro.com`.

La validación se implementará detrás de `IdentityProvider`:

```text
requestVerification(email)
verifyChallenge(challengeId, code)
resolveInstitutionalIdentity(email)
```

El adaptador del piloto generará desafíos verificables localmente. Un adaptador SSO futuro implementará el mismo contrato.

### 5.2 Asignación de rol

- Una cuenta nueva obtiene el rol `Egresado` después de verificar el correo.
- `Estudiante` no puede autoasignarse.
- El usuario solicita el rol `Estudiante` y adjunta evidencia académica.
- Un administrador aprueba o rechaza la solicitud con motivo obligatorio.
- Cada decisión registra actor, fecha, estado anterior, estado nuevo y referencia de evidencia.
- Cuentas suspendidas o eliminadas pierden acceso efectivo aunque conserven un JWT no expirado.

## 6. Publicaciones y riesgo

Las publicaciones admitirán `Venta`, `Alquiler` y `Préstamo`. Las reglas de precio, garantía y fechas dependen de la modalidad.

El riesgo se calculará mediante una política versionada. Para el piloto:

- valor menor a S/ 500: controles básicos;
- valor desde S/ 500: revisión administrativa;
- valor desde S/ 1000: comprobante de procedencia obligatorio;
- una publicación no se activa si faltan controles exigidos por su nivel;
- el riesgo se recalcula cuando cambian precio, garantía o modalidad.

Una publicación con una operación activa no puede modificar condiciones contractuales. Puede editar información no contractual autorizada. Pausar impide nuevas solicitudes; retirar exige no tener operaciones incompatibles.

## 7. Operaciones y reservas

### 7.1 Estados

```text
Pendiente
  -> Aceptada
  -> Rechazada
  -> Cancelada
  -> Expirada

Aceptada
  -> Pendiente de pago/garantía
  -> Cancelada

Pendiente de pago/garantía
  -> Lista para entrega
  -> Cancelación en reversión
  -> Cancelada
  -> En incidencia

Lista para entrega
  -> Entregada/Activa
  -> Cancelación en reversión
  -> En incidencia

Entregada/Activa
  -> En cierre
  -> En incidencia

En cierre
  -> Pendiente de resolución económica
  -> Cerrada
  -> En incidencia

Pendiente de resolución económica
  -> Cerrada
  -> En incidencia

En incidencia
  -> estado resuelto autorizado
  -> Cerrada
  -> Cancelada
```

`Rechazada`, `Expirada` y `Cancelación en reversión` se añadirán mediante migración. Toda transición se validará en una tabla de reglas con actor permitido, estado origen, estado destino, precondiciones y efectos.

### 7.2 Momento de reserva

- Crear una solicitud `Pendiente` no bloquea definitivamente el bien.
- Aceptar adquiere bloqueo sobre la publicación, vuelve a comprobar disponibilidad y crea la reserva.
- Dos aceptaciones concurrentes incompatibles no pueden confirmar ambas.
- El snapshot contractual se crea al aceptar, no al solicitar.
- Cancelar, rechazar, expirar o resolver una operación libera reservas cuando corresponda.
- Se añadirá una restricción PostgreSQL para intervalos incompatibles de reservas vigentes, además del bloqueo transaccional.

## 8. Pagos y garantías

### 8.1 Puerto de proveedor

```text
createIntent(operation, movement, idempotencyKey)
queryIntent(providerReference)
reverseIntent(providerReference, amount, idempotencyKey)
verifyWebhook(headers, rawBody)
normalizeWebhook(event)
```

Implementaciones previstas:

- `SimulatedPaymentAdapter`, activa en el piloto;
- `CulqiPaymentAdapter`, desactivada hasta disponer de credenciales y contrato;
- `NiubizPaymentAdapter`, desactivada hasta disponer de credenciales y contrato.

El dominio no conocerá formatos propios de Culqi o Niubiz.

### 8.2 Simulador

El simulador empleará tokens o tarjetas de prueba deterministas. Debe producir `Pendiente`, `Aprobada`, `Rechazada`, `Expirada` y `Revertida`, entregar webhooks asíncronos, firmarlos y permitir pruebas de duplicación, demora y desorden.

### 8.3 Libro económico

- Venta: movimiento de pago.
- Alquiler: pago y garantía separados.
- Préstamo: garantía opcional sin precio de uso.
- Cada movimiento conserva importe, moneda, proveedor, referencia externa, idempotency key, estado y marcas de tiempo.
- `Lista para entrega` exige aprobación de todos los movimientos requeridos.
- El cierre libera, retiene parcialmente o somete a resolución la garantía.
- La interfaz del piloto siempre indica que los movimientos son simulados.

## 9. Entrega, devolución y cierre

- El OTP se genera únicamente al alcanzar `Lista para entrega`.
- Se almacena un hash, nunca el código en claro.
- Tiene caducidad, contador de intentos y consumo único.
- Solo el demandante autenticado puede visualizar el código vigente.
- Solo el oferente participante puede validarlo.
- Superar intentos o detectar abuso bloquea el OTP y genera auditoría.
- La entrega captura confirmación y evidencia permitida.
- Alquiler y préstamo requieren devolución y conformidad antes del cierre.
- Venta requiere conformidad de recepción o vencimiento controlado.
- Una discrepancia abre incidencia y detiene la resolución económica automática.

## 10. Incidencias, moderación y reputación

Una incidencia identifica operación, reportante, contraparte, categoría, descripción, evidencia, estado, responsable y resolución. Solo participantes y administradores autorizados pueden verla.

Las decisiones administrativas requieren motivo y son idempotentes. No se permite resolver dos veces una incidencia ni decidir sobre una operación ya cerrada salvo reapertura auditada.

La calificación:

- solo se permite después de una operación cerrada;
- admite una calificación por participante y operación;
- no puede dirigirse al mismo usuario;
- recalcula reputación desde datos persistidos;
- puede ocultarse por moderación sin borrar la auditoría.

## 11. ARCO, notificaciones y auditoría

Las solicitudes ARCO conservarán tipo, solicitante, identidad verificada, fechas, estado, responsable y resolución. Los plazos se mostrarán como objetivos de seguimiento, no como cumplimiento automático.

Los eventos críticos se escribirán en outbox dentro de la transacción de negocio. Un trabajador los entregará a la bandeja interna y registrará reintentos. El fallo de notificación no deshará el cambio principal.

La auditoría cubrirá como mínimo:

- verificación, suspensión y cambios de rol;
- creación y moderación de publicaciones;
- transiciones de operación y reserva;
- movimientos económicos y webhooks;
- emisión, fallo y consumo de OTP;
- acceso o modificación de evidencias;
- incidencias, ARCO y decisiones administrativas.

Los registros no incluirán contraseñas, OTP, tokens, PAN ni CVV.

## 12. Seguridad y errores

- Validación Zod en entradas HTTP, comandos y webhooks.
- Autorización por rol, estado de cuenta, propiedad y participación.
- Rate limiting específico para login, verificación, OTP, reclamos y administración.
- Webhooks firmados e idempotentes.
- Evidencias con acceso privado y metadatos de autorización.
- Errores públicos sanitizados con identificador de correlación.
- Logs estructurados sin secretos.

Semántica HTTP:

| Código | Uso |
|---|---|
| 400 | Formato o datos inválidos. |
| 401 | Sesión ausente o inválida. |
| 403 | Cuenta o actor sin permiso. |
| 404 | Recurso no visible o inexistente. |
| 409 | Conflicto de estado, idempotencia o disponibilidad. |
| 422 | Petición válida que incumple una precondición del dominio. |

## 13. Escenarios alternativos obligatorios

| Escenario | Comportamiento esperado |
|---|---|
| Reserva propia | Rechazo sin cambios ni transacción abierta. |
| Cuenta suspendida/no verificada | Acceso denegado usando estado vigente de base de datos. |
| Publicación pausada durante solicitud | No se permite aceptar; solicitud se rechaza o cancela con motivo. |
| Dos aceptaciones incompatibles | Solo una confirma; la otra recibe conflicto y rollback. |
| Pago rechazado o expirado | No avanza; permite nuevo intento autorizado. |
| Webhook duplicado | Devuelve éxito idempotente sin repetir efectos. |
| Webhook fuera de orden | Conserva el estado más avanzado válido y audita el evento. |
| Proveedor primario indisponible | Mantiene estado pendiente; conmutación explícita sin doble movimiento. |
| Pago aprobado y garantía pendiente | Permanece pendiente de pago/garantía. |
| Cancelación posterior al pago | Inicia reversión; no declara cancelación final antes de confirmarla. |
| OTP erróneo/expirado/reutilizado | Rechazo, incremento de intento cuando aplique y auditoría. |
| Una parte no se presenta | Expiración o incidencia según etapa; nunca entrega automática. |
| Bien no coincide | Incidencia y bloqueo del cierre económico. |
| Devolución tardía, incompleta o dañada | Incidencia con evidencia y resolución de garantía. |
| Notificación falla | Reintento desde outbox sin revertir negocio. |
| Decisión administrativa repetida | Respuesta idempotente o conflicto sin duplicar efectos. |
| IdentityProvider no disponible | Estado pendiente y reintento; no se omite verificación. |

## 14. Migraciones y compatibilidad

Las migraciones posteriores a `001_init.sql` añadirán, en orden:

1. estados y restricciones de operaciones/reservas;
2. desafíos de identidad, solicitudes de rol y evidencias;
3. idempotencia, movimientos económicos y webhooks;
4. OTP seguro, confirmaciones y eventos de entrega/devolución;
5. calificaciones y reputación;
6. incidencias, moderación y ARCO;
7. outbox, preferencias y ampliación de auditoría.

Cada migración tendrá prueba sobre base vacía y sobre una base creada con la línea base. Los cambios destructivos requerirán migración de datos explícita.

## 15. Estrategia de pruebas

- Unitarias: políticas, transiciones, permisos, riesgo, importes y caducidad.
- Integración PostgreSQL: transacciones, rollback, constraints, auditoría y outbox.
- Contrato de adaptadores: mismos casos para simulador, Culqi y Niubiz.
- Webhooks: firma inválida, duplicado, demora, repetición y desorden.
- Concurrencia: 100 intentos incompatibles sobre la misma disponibilidad.
- Autorización: anónimo, usuario ajeno, propietario, participante y administrador.
- Recorridos completos: camino feliz y cada escenario de la sección 13.
- Cliente: rutas protegidas, formularios, carga, vacío, error y permisos.
- Operación: migración limpia, respaldo, restauración y build reproducible.

Los RNF que requieren tiempo real de piloto, contrato externo o usuarios humanos se reportarán como pendientes de evidencia, no como aprobados por una prueba local.

## 16. Fases de implementación

### Fase 1: fundamentos

Guardas del cliente, estructura modular, migrador incremental, errores normalizados, auditoría y outbox.

### Fase 2: identidad y publicaciones

Verificación simulada, roles, perfiles, riesgo, evidencia, edición, pausa y retiro.

### Fase 3: solicitudes y reservas

Máquina de estados, aceptación/rechazo, snapshot, cancelación, expiración y concurrencia.

### Fase 4: economía simulada

Puerto de pago, simulador, webhooks, garantía, reversiones y conciliación.

### Fase 5: entrega y cierre

OTP seguro, entrega, devolución, conformidad, cierre y calificaciones.

### Fase 6: gobierno

Incidencias, moderación, ARCO, paneles reales y notificaciones completas.

### Fase 7: aceptación

Pruebas RNF automatizables, respaldo/restauración, PWA, BPMN, documentación y preparación del piloto.

Cada fase debe terminar con pruebas verdes y documentación sincronizada antes de iniciar la siguiente.

## 17. Transición a producción

La transición no cambiará los casos de uso ni los estados. Consistirá en:

1. implementar y certificar `CulqiPaymentAdapter` y `NiubizPaymentAdapter`;
2. configurar secretos en un gestor seguro;
3. verificar contratos, medios habilitados, tarifas, SLA, reversos y conciliación;
4. sustituir `SimulatedIdentityProvider` por SSO o servicio institucional;
5. habilitar proveedores reales solo mediante configuración de despliegue;
6. ejecutar las mismas pruebas de contrato en sandbox oficial;
7. realizar pruebas de conmutación sin doble cobro;
8. completar revisión jurídica, privacidad, seguridad y operación antes de activar dinero real.

## 18. Criterios de aceptación del piloto

- Ninguna pantalla presenta datos o éxitos ficticios como reales.
- Todos los RF tienen implementación o una limitación externa documentada.
- Las transiciones inválidas y accesos ajenos son rechazados.
- Una disponibilidad no puede reservarse dos veces bajo concurrencia.
- Los webhooks y decisiones administrativas son idempotentes.
- El OTP es secreto, temporal y de un solo uso.
- Cada acción crítica es auditable.
- El pago y la garantía están claramente identificados como simulados.
- Cliente y servidor pasan lint, build y pruebas reproducibles.
- BPMN, README y matriz RF/RNF coinciden con el código verificado.
