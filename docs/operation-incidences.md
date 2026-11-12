# Comunicación e incidencias vinculadas a operaciones

## Alcance y reglas verificadas

Se reutilizan `operations`, sus participantes y snapshot, `incidences`, el chat por publicación/interesado, auditoría, outbox y la base financiera existente. Las incidencias no generan reseñas ni habilitan cobros, reembolsos o transferencias reales. Las [evaluaciones de operaciones cerradas](operation-reviews.md) son un flujo separado: una incidencia pendiente impide enviar una evaluación nueva, sin cambiar pagos ni resolver casos. La conversación sigue siendo compartida por las operaciones de la misma publicación y pareja de usuarios; `operation_conversation_links` vincula cada operación al chat y cada aviso del flujo conserva su `operation_id`. Abrir el chat de una operación no crea una conversación duplicada.

Ambos participantes activos y verificados pueden abrir casos y aportar respuestas/evidencias. Los usuarios ajenos no pueden consultar, responder ni descargar archivos; reciben 404. Administración tiene rutas privadas separadas. Un administrador que participa en el trato no puede gestionar administrativamente su propio caso: debe hacerlo otro administrador. Cada participante puede tener un caso pendiente por operación; puede ampliar ese caso, en vez de abrir duplicados.

Estados del nuevo flujo: **Abierta → En revisión → Esperando respuesta → En revisión → Resuelta**. Administración puede iniciar revisión, solicitar información a cualquiera de los dos o resolver desde cualquier estado pendiente. Solo la respuesta del destinatario de una solicitud de información vuelve automáticamente a En revisión; las demás respuestas conservan el estado. Resuelta es terminal e impide nuevas respuestas, evidencias y actuaciones. Los casos legados Desestimada se siguen considerando terminales. Una revisión antigua produce 409, sin sobrescribir decisiones concurrentes.

Los motivos disponibles dependen de modalidad y etapa: comunicación y otros antes de aceptar; encuentro/entrega y pago tras aceptar; discrepancias del artículo y daños después de la entrega o cierre; devolución, demora y garantía en alquileres/préstamos entregados. El servidor valida los motivos; no basta con editar el formulario.

## Efecto sobre operación y dinero

Una incidencia pendiente bloquea el cierre, la cancelación por el participante y la elegibilidad del desembolso. Hay protección SQL adicional para cierres/cancelaciones y transferencias en estados pending/confirmed. La apertura, resolución, coordinación y base financiera serializan por publicación y operación. No se cambia el estado contractual a «En incidencia»: se conserva la etapa real y se muestra el bloqueo por separado. La devolución no puede cerrar el trato mientras haya casos pendientes; las partes pueden documentarla en el caso.

Resoluciones explícitas:

- `record_only`: registra la decisión y termina ese caso; no cambia la operación ni sus importes.
- `continue_operation`: termina ese caso y conserva las condiciones acordadas. No confirma entregas, no cierra y no desembolsa automáticamente.
- `cancel_operation`: cancela y libera la reserva solo si no hay pagos registrados (salvo un intento financiero fallido), entrega declarada, transferencias pendientes/confirmadas ni otros casos pendientes, y el estado admite cancelación. Se atribuye al administrador, no al comprador. No ejecuta reembolsos.
- `settle_guarantee`: resuelve una incidencia de garantía con acta de devolución registrada. Administración revisa el importe y los dos destinos. El reparto de prueba queda limitado a la garantía disponible y se cierra la operación cuando el resto de casos está resuelto.
- `refund_payment`: registra una devolución del pago simulado, total o parcial, en una venta cerrada o antes de la entrega. En una cancelación previa a la entrega se incluye la garantía de prueba y se libera la reserva al resolver el caso. El pago original conserva su referencia.

Resolver uno de varios casos no quita los bloqueos de los demás. Una vez resueltos todos, siguen vigentes los requisitos financieros y de recepción/devolución. Cumplirlos devuelve elegibilidad, **no** una transferencia ejecutada. La base de pagos actual sigue siendo simulación local/Culqi sandbox.

Si un desembolso ya figura `confirmed`, se muestran su situación y referencia: la incidencia no lo revierte ni promete recuperar el dinero. No se ofrece cancelación automática de operaciones con dinero o entrega registrados. Cualquier recuperación requiere actuación económica externa explícita y una integración futura, no editar el estado del caso.

## Plazo posterior al cierre

`INCIDENCE_REPORT_WINDOW_DAYS=7` es el valor predeterminado; admite enteros de 1 a 365. Configurarlo en el entorno del servidor y reiniciar la API. El cálculo usa `operations.closed_at`, no las últimas respuestas ni el `updated_at` del caso. Incluye el instante exacto del límite. Una configuración inválida rechaza la apertura de reportes; no amplía el plazo silenciosamente. Cambiar la configuración afecta a los nuevos reportes de todas las operaciones.

Para operaciones nuevas, `closed_at` se fija al pasar a Cerrada y no se altera con actualizaciones posteriores. Para cierres históricos se toma el `updated_at` existente al migrar, por falta de un registro más preciso: revisar esos casos si esa fecha no representaba el cierre real. Después del plazo no se pueden abrir nuevos casos; los ya abiertos siguen hasta su resolución.

## Evidencias y trazabilidad

Hasta cinco archivos por caso: JPEG/PNG/WebP hasta 2 MB (el cliente ajusta fotos con la utilidad existente), PDF hasta 5 MB. El servidor valida firma, tipo y tamaño mediante la validación de comprobantes existente. No acepta URLs arbitrarias como evidencia nueva. Los bytes se almacenan en PostgreSQL, no en una ruta pública. Solo participantes y administración pueden descargarlos con sesión vigente; la respuesta es adjunto con `private, no-store` y `nosniff`. Descargas auditadas. No se envían archivos ni descripciones privadas a los avisos del chat.

Actuaciones y archivos son de solo adición: no hay edición/borrado del historial. Cada actuación registra actor, fecha, estado y decisión; las respuestas usan revisión optimista. El historial pagina las actuaciones anteriores y la cola administrativa pagina 20 casos, pendientes primero.

La carga se hace después de abrir el caso. Un fallo de archivo no elimina el reporte ni los archivos que ya se subieron; revisar la lista antes de reintentar. No hay antivirus, OCR, validación forense ni política automatizada de retención/depuración. La validación de firma no garantiza que un archivo sea inocuo. Para producción se requiere análisis antimalware y una política de conservación de evidencias; no almacenar información personal innecesaria.

## Prueba manual: comprador, oferente y administrador

Preparar dos cuentas activas/verificadas y una cuenta administrativa independiente. Aplicar migraciones con `npm run migrate --prefix server` (hasta 029); en desarrollo también se aplican al arrancar. Iniciar Ranti con el flujo habitual de desarrollo.

1. **Comprador:** solicitar una venta o alquiler y esperar aceptación. En Mis operaciones → Ver detalle, usar «Hablar con la otra persona». Volver al detalle → «Reportar un problema», elegir un motivo disponible y describir al menos 10 caracteres. Abrir incidencia y adjuntar una foto/PDF. Comprobar estado Abierta, archivo descargable e indicación del bloqueo.
2. **Oferente:** entrar al mismo trato desde Recibidas, abrir el detalle y el seguimiento. Ver descripción y evidencia, enviar una respuesta y, si corresponde, abrir su propio reporte. Comprobar que no aparece un control para resolver. Revisar el aviso del chat y su enlace «Ver seguimiento del problema».
3. **Administrador independiente:** Portal administrativo → Gestionar incidencias. Abrir el caso, escribir una actuación, pasar a revisión y solicitar información al comprador u oferente. La persona destinataria responde desde el seguimiento; debe volver a En revisión. Resolver con una decisión explícita y explicación de al menos 10 caracteres. Con «Registrar resolución» o «Continuar» comprobar que no cambia el precio, no se inventa un reembolso y no se cierra ni desembolsa. Si queda otro caso pendiente, el bloqueo continúa.
4. **Cancelación administrativa:** usar otra operación aceptada, sin pago ni entrega y sin otro caso pendiente. Resolver seleccionando «Cancelar operación sin pagos ni entrega». Comprobar Cancelada y reserva liberada. Repetir con pago/entrega registrados: debe rechazarse sin resolver el caso.
5. **Bloqueo financiero:** en una venta de prueba coordinada, completar pago simulado y recepción por ambas partes. Abrir incidencia por daños: la elegibilidad del desembolso queda bloqueada. Resolver sin cancelar: vuelven los requisitos normales, pero no aparece transferencia confirmada. En alquiler, intentar confirmar la devolución con un caso pendiente: no debe cerrar el trato.
6. **Reporte posterior al cierre:** cerrar un alquiler por el flujo existente de devolución bilateral; abrir un caso dentro del plazo. El seguimiento debe conservar el estado Cerrada y mostrar el reporte. La prueba automatizada cubre también expiración del plazo y un desembolso previamente registrado mediante una fixture; no registrar una transferencia ficticia en la base habitual para probarlo.
7. **Permisos:** una tercera cuenta no debe ver el caso ni descargar sus archivos al copiar las URLs. Un participante no puede usar las rutas administrativas para resolver, aunque cambie el cuerpo enviado. Cerrar sesión debe impedir consultas privadas. Un administrador participante en el trato necesita otro administrador para resolverlo.

## API y pruebas automatizadas

Participantes:

- `GET/POST /api/operations/:id/incidences`: política, casos, efectos / abrir reporte.
- `GET /api/incidences/:id?before=...`: caso, historial, evidencias y efecto.
- `POST /api/incidences/:id/replies`: `{revision,body}`.
- `POST /api/incidences/:id/evidence`: bytes con Content-Type admitido y X-File-Name codificado con encodeURIComponent.
- `GET /api/incidences/:id/evidence/:fileId`: descarga privada.

Administración: `GET /api/admin/incidences?offset=0`, `GET /:id`, `POST /:id/actions` con `{revision,action,body,target_id? ,decision?}`, y rutas equivalentes de respuestas/evidencias bajo `/api/admin/incidences`.

Desde la raíz, PowerShell:

```powershell
& .\tools\test-postgres.ps1 -TestArguments @('test/incidence-http.integration.test.js','test/incidence-policy.test.js','test/finance-http.integration.test.js','test/chat-and-handoff-http.integration.test.js','test/operation-request-http.integration.test.js')
npm test --prefix client -- --run
npm run lint --prefix client
npm run build --prefix client
```

La primera orden usa una base PostgreSQL desechable, sin tocar cuentas ni datos habituales. Cubre ambas partes, acceso ajeno, evidencias privadas y límites, estados/revisiones, decisiones concurrentes, bloqueo SQL, resolución sin efectos económicos implícitos, cancelación administrativa acotada, alquiler, plazo posterior al cierre y desembolso previamente registrado. No llama a un proveedor real.
