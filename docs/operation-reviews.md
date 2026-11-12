# Evaluaciones de operaciones concretadas y cerradas

## Alcance

La migración 030 incorpora `operation_reviews` y restricciones de unicidad, participantes, modalidad/producto y solo adición. Se reutilizan operaciones, entrega/devolución bilateral, registros de pago, incidencias, perfiles, auditoría y chat. No se cambian comisiones, desembolsos, plazos de incidencias, reservas ni mecanismos de cierre.

Una evaluación corresponde al **otro participante** y a su rol en esa operación: `owner` (oferente) o `requester` (comprador/arrendatario; también solicitante en Préstamo). El servidor deriva identidades, rol, publicación y modalidad: no los recibe del formulario. Hay una sola fila por operación y autor, protegida por índice único y transacción con bloqueo publicación → operación. No hay edición, repetición ni eliminación de evaluaciones. Las decisiones concurrentes producen una sola evaluación válida; el otro intento devuelve 409.

Solo se evalúa cuando la operación está **Cerrada**, tiene aceptación y fecha de cierre, ambos confirmaron entrega y, en Alquiler/Préstamo, ambos confirmaron devolución. Venta/Alquiler deben tener pago confirmado de prueba/sandbox, registro de simulación existente o Cobro legado Aprobado. Préstamo no requiere pago. Una incidencia pendiente impide enviar nuevas evaluaciones. No basta con que una solicitud esté aceptada, entregada o haya vencido: rechazadas, abandonadas, canceladas y operaciones ajenas no admiten evaluaciones.

Las evaluaciones no abren ni cierran incidencias ni alteran un pago. Si se reporta posteriormente una incidencia, se conserva el historial de evaluaciones ya enviado; no se modifica su visibilidad, y siguen funcionando los bloqueos económicos existentes. No se ha añadido un cierre de ventas nuevo: una Venta solo es evaluable si el flujo existente la marca Cerrada y conserva las confirmaciones requeridas. La entrega de una venta que permanezca Entregada/Activa no habilita reseñas. Para probar todo el recorrido desde interfaz se puede usar Alquiler, cuyo cierre bilateral por devolución ya existe.

## Persona y producto separados

Cada participante asigna de 1 a 5 estrellas a la persona y puede dejar un comentario de hasta 1000 caracteres. Se promedian las evaluaciones publicadas por destinatario y rol, sin usar `users.reputation_score` ni mezclar el número de operaciones con el número de evaluaciones.

Solo el comprador/arrendatario/solicitante puede añadir, dentro de su misma evaluación, de 1 a 5 estrellas y comentario opcional del **producto**. Esta parte es opcional. El oferente no puede reseñar su propio producto. Un comentario de producto requiere sus estrellas. Promedio y número de reseñas del producto se calculan independientemente de la puntuación de la persona.

Una persona sin evaluaciones publicadas tiene `count: 0` y `score: null` para otros usuarios, no puntuación cero. Su propio perfil omite la propiedad `score` por completo. Los formularios distinguen comentario sobre la persona y reseña del artículo; no se trasladan comentarios de uno al otro.

## Publicación y privacidad

`REVIEW_PUBLICATION_DAYS=7` controla el plazo desde `operations.closed_at`, en días enteros de 1 a 365. Configurarlo en el entorno del servidor y reiniciar. La primera evaluación congela la fecha límite de esa operación; la segunda reutiliza esa fecha incluso si luego cambia la configuración. El cambio solo afecta operaciones que todavía no tienen evaluaciones. Una configuración inválida impide establecer un plazo nuevo.

Se publica cuando **ambas partes enviaron su evaluación o se alcanzó la fecha límite**. El mismo predicado SQL filtra agregados, comentarios y reseñas de producto: no hace falta un cron para publicar al vencer. La visibilidad se actualiza en la siguiente consulta. No existe un plazo máximo de envío adicional: una evaluación enviada después de la fecha límite se publica inmediatamente.

Mientras está oculta, ni siquiera su autor recibe contenido por la API. El endpoint de operación devuelve únicamente elegibilidad, indicador de envío/publicación, modalidad/rol y fecha prevista. Auditoría guarda la referencia de la evaluación, no estrellas ni comentarios. El aviso del chat es genérico. Los agregados no cuentan evaluaciones ocultas.

Reglas de audiencia:

- Usuario autenticado mirando **otro perfil**: puntuaciones y cantidades separadas «Como oferente» y «Como comprador/arrendatario». Los comentarios personales no se exponen a terceros; son para el destinatario.
- **Perfil propio**, incluso accedido como `/users/:miId/profile` o `/users/:miId/reviews`: cantidades y comentarios personales recibidos publicados, sin promedio ni puntuaciones individuales.
- **Publicación del artículo**: estrellas y comentarios publicados del producto, accesibles también sin sesión. No incluye comentarios personales ni reputación del oferente.
- Visitante sin sesión: no puede consultar puntuaciones de personas. Así no existe una variante anónima del perfil que el propietario pueda usar para obtener su puntuación.

Se retiró la reputación única legada de login, perfil propio/ajeno, contraparte de operación y detalle público de publicación. La columna histórica se conserva sin modificar datos, pero ya no se usa como reputación del producto ni se devuelve por esas APIs. La API deriva la identidad de la sesión, nunca de un `viewer_id` enviado por el cliente. Esto evita la consulta de puntuación propia con la misma identidad; no puede impedir que una persona acceda mediante otra cuenta real o que un tercero le comunique una puntuación.

## Interfaz y prueba con dos usuarios

Usar dos cuentas activas y verificadas: A oferente y B comprador/arrendatario. Aplicar migraciones con `npm run migrate --prefix server` (hasta 030); desarrollo también las aplica al arrancar.

1. Concretar un **alquiler** mediante el flujo existente: solicitud, aceptación, encuentro acordado, pago simulado, entrega confirmada por ambos y devolución confirmada por ambos. Comprobar estado Cerrada. Resolver cualquier incidencia pendiente por su flujo administrativo antes de evaluar.
2. En B → Mis operaciones → «Trato finalizado: comparte tu experiencia» → «Evaluar esta operación». Poner, por ejemplo, 4 estrellas al oferente y comentario personal; opcionalmente 2 estrellas al artículo y una reseña distinta. Enviar. Ver el mensaje de envío oculto: no se muestra el contenido enviado. Reintentar por API devuelve 409.
3. Antes de que A evalúe o venza el plazo, B abre el perfil ajeno de A y las reseñas del producto: esa evaluación aún no cuenta. A entra a su propio perfil: el comentario de B todavía no aparece. No deben filtrarse estrellas ni textos por las respuestas JSON.
4. A evalúa desde Recibidas, por ejemplo con 3 estrellas al arrendatario y comentario opcional. A no recibe la pregunta de reseñar el producto. Ambas evaluaciones quedan publicadas.
5. B abre el perfil de A: aparece el promedio **Como oferente**. A abre el perfil de B: aparece **Como comprador/arrendatario**. Ambos abren su propio perfil: ven sus comentarios recibidos y cantidades, no su puntuación ni estrellas personales. En la publicación → «Reseñas del producto», se muestran las 2 estrellas del artículo, no las 4 del oferente ni las 3 del arrendatario.
6. Para probar roles separados, realizar otra operación con papeles invertidos. La nueva evaluación debe afectar al rol correspondiente, sin reemplazar ni promediar con el otro rol.
7. Para vencimiento, usar otra operación cerrada y enviar solo una evaluación. Al cumplirse el plazo desde su cierre, refrescar perfil/reseñas: se publica sin exigir respuesta mutua. El test automatizado verifica el paso de oculto a publicado con una fixture temporal en una base desechable, sin esperar días ni manipular datos habituales.
8. Intentar evaluar una solicitud pendiente/rechazada/cancelada o un trato ajeno: se rechaza. Una tercera cuenta no puede consultar el estado privado de evaluación de esa operación. La puntuación ajena se puede consultar con sesión, pero el propietario no la recibe por login, `/users/me`, perfil por ID, `/users/:id/reviews` ni detalles públicos de publicación.

El perfil ajeno se abre haciendo clic en la persona en la publicación o el chat. Comentarios recibidos paginan de 50 en 50; reseñas de producto, de 20 en 20. Las invitaciones aparecen en las tarjetas Cerrada de Mis operaciones, sin habilitar formularios en solicitudes no concretadas.

## API y comprobaciones

- `GET /api/operations/:id/review`: estado privado sin contenido.
- `POST /api/operations/:id/review`: `{person_rating, person_comment?, product_rating?, product_comment?}`; datos de producto solo para quien lo recibió.
- `GET /api/users/:id/reviews?offset=0`: reputación ajena o comentarios propios, según sesión.
- `GET /api/publications/:id/reviews?offset=0`: promedio, cantidad y reseñas de producto publicadas, sin información de evaluaciones personales.

```powershell
& .\tools\test-postgres.ps1 -TestArguments @('test/operation-reviews-http.integration.test.js','test/review-policy.test.js','test/profile-and-role-review.test.js','test/operation-policy.test.js','test/incidence-http.integration.test.js','test/finance-http.integration.test.js')
npm test --prefix client -- --run
npm run lint --prefix client
npm run build --prefix client
```

No se añaden moderación de reseñas, eliminación/edición, importación de puntuaciones históricas, rankings, correos ni nuevos mecanismos de pago/cierre. La nueva reputación comienza sin evaluaciones hasta que se publiquen evaluaciones válidas. Las condiciones de pago e incidencias conservan su configuración independiente.
