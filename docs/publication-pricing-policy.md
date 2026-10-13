# Publicación y resumen económico del piloto

La navegación del catálogo usa las mismas categorías que el formulario (`publicationCategories`). «Otros» está visible y «Más categorías» despliega las opciones restantes con una flecha. Elegir una categoría conserva la búsqueda y el filtro de estado físico; «Inicio» vuelve al catálogo sin filtros.

El formulario de creación tiene dos pasos: «Continuar publicación» guarda los detalles como borrador y consulta el resumen privado calculado por el servidor; desde allí se puede volver a editar o enviar. Guardar no publica ni cobra. La descripción tiene un máximo de 1000 caracteres, incluidos espacios y saltos de línea; el servidor también lo comprueba. El contador usa unidades UTF-16, como `maxlength` del navegador y la validación del servidor; algunos emojis cuentan como dos unidades. No existe un límite adicional de palabras. Las categorías incluyen «Otros», con un detalle adicional, y el estado físico es una autoevaluación del artículo de 1–5 estrellas, no una calificación de reputación.

## Galería y orientación de solicitudes

El detalle público permite ampliar cada foto en un visor y navegar con flechas, miniaturas o las teclas izquierda/derecha. Las fotos conservan su posición guardada. Si hay varias, cambian cada 5 segundos; el cambio automático se pausa al pasar el puntero, enfocar controles, abrir el visor o dejar la pestaña. Se puede pausar manualmente y se respeta la preferencia de movimiento reducido. Una foto única también se puede ampliar; la vista completa conserva sus proporciones.

«Mis operaciones» resalta la vista activa y explica quién inició la solicitud. Cada tarjeta y su detalle indican «Enviada por ti» o «Recibida · Tu artículo»; la contraparte se identifica como oferente o solicitante, respectivamente. Esto no cambia los permisos ni el ciclo de vida de la operación.

## Política vigente aprobada por el titular

Esta aclaración sustituye, para el resumen del piloto, el supuesto del informe original «5% neto + IGV adicional». El documento fuente se conserva sin modificar.

- Venta: el oferente ingresa el precio bruto. Se descuenta una tarifa **total** del 10% si el precio es menor de S/60, y del 5% desde S/60; no se suma otro descuento por IGV. Son dos tramos, no una interpolación: S/59.99 tiene tarifa S/6.00 y S/60 tiene tarifa S/3.00.
- Alquiler: mismo cálculo por la unidad elegida: hora, día, semana o mes fijo de 30 días. Las fechas de disponibilidad no determinan la duración contratada. La garantía es independiente, no es ganancia ni una indemnización automática.
- Préstamo solidario: precio de uso y comisión cero; puede declararse garantía, sin retención real en el piloto.
- Cargos de tarjeta/procesamiento: no se muestran ni se descuentan en el resumen del oferente. Su eventual tratamiento pertenece al checkout del comprador y al proveedor productivo, aún pendiente.

Ejemplo: precio bruto S/180.00, tarifa total S/9.00, neto estimado del oferente S/171.00. Internamente, para el modelo académico, la tarifa de S/9.00 se separa en S/7.63 de ingreso del servicio y S/1.37 de impuesto incluido. No confundir la tasa de comisión, una decisión de Ranti, con la [tasa total del 18% aplicable a operaciones gravadas según SUNAT](https://orientacion.sunat.gob.pe/3109-05-calculo-del-impuesto). La aplicación tributaria, facturación y obligaciones concretas requieren validación antes de producción; este cálculo no liquida impuestos del vendedor sobre el bien.

La política tiene identificador `pilot-fee-v3-tiered-inclusive-igv` y sustituye la tarifa plana de la versión anterior. Los montos se calculan en céntimos enteros con redondeo a dos decimales. La API del oferente devuelve precio, tarifa, porcentaje aplicado (`service_fee_percent`), neto, garantía y unidad; no devuelve el desglose contable interno ni acepta tarifas propuestas por el navegador. En alquiler el tramo se calcula sobre el precio publicado por unidad, no sobre la garantía ni sobre toda la disponibilidad. Ejemplo: S/5 implica tarifa S/0.50 y neto S/4.50; S/60 implica tarifa S/3.00 y neto S/57.00. El resumen no es un snapshot económico de una operación aceptada ni una instrucción de cobro; los adaptadores de producción deberán cotizar y congelar sus condiciones por separado.

Controles del informe conservados: exposición máxima entre precio y garantía; desde S/500 revisión administrativa, desde S/1000 evidencia de procedencia. Los toasts al entrar o cambiar modalidad recomiendan conservar registros y condiciones dentro del sistema y advierten que el piloto no cobra ni custodia fondos. No se promete escrow, seguro ni protección de pagos externos.

## Ofertas de precio

En Venta y Alquiler, «Hacer una oferta» permite proponer un monto positivo menor al precio publicado, con hasta dos decimales. El alquiler conserva la misma unidad, garantía y fechas seleccionadas. Préstamo no admite ofertas. `requested_price` sigue confirmando el precio publicado; `offered_price` guarda el monto propuesto aparte. El anuncio no cambia. La oferta no es editable: para negociar otro monto se envía otra solicitud, cancelando la anterior si corresponde. Existe un [chat privado para consultas y coordinación](pilot-communications.md), pero no rondas automáticas de contraofertas del oferente. Un mensaje no cambia el precio acordado.

El oferente ve las ofertas en «Mis operaciones → Recibidas», con precio original, monto propuesto y neto estimado después de la tarifa vigente. Puede aceptar o rechazar con motivo. El solicitante consulta la decisión en Enviadas; no se promete envío de correo ni notificaciones push. Un reintento idéntico devuelve la misma solicitud pendiente no vencida, distinguiendo ofertas de solicitudes a precio completo.

La aceptación valida ambas cuentas, versión/precio/garantía/unidad vigentes, vencimiento y disponibilidad dentro de una transacción. Guarda el precio ofertado en `contract_snapshot.agreed_price`, el precio original y la política de tarifa utilizada; crea una reserva. Dos aceptaciones incompatibles se serializan por publicación. Rechazar no reserva. Cancelar una solicitud pendiente no reserva; cancelar una aceptada sin movimientos económicos libera la reserva y conserva el snapshot. Estados económicos posteriores requieren el flujo de reversión pendiente, no se cancelan silenciosamente. No hay cobro, OTP, pago con tarjeta ni entrega productiva por aceptar una oferta.

Casos que impiden aceptar: oferta vencida, anuncio pausado/cambiado, cuenta no disponible, otro participante intentando decidir o reserva incompatible. La propuesta y su decisión son privadas para los participantes; la API pública del anuncio no expone ofertas. Migración 017 añade el campo con restricciones de monto/modalidad e impide cambiarlo después de enviado; no modifica solicitudes existentes.

## Disponibilidad y unidad de alquiler

En Alquiler, «Disponible desde» sigue siendo necesario para enviar la publicación; «Disponible hasta» es opcional y se señala en el formulario. Sin fecha de fin, el anuncio permanece disponible desde el inicio sin un límite superior de disponibilidad. Si se indica un fin, debe ser posterior al inicio. Esto no crea una reserva indefinida: el solicitante siempre debe indicar inicio y fin del período que necesita; las validaciones de solapamiento y las reservas mantienen intervalos finitos. Venta no lleva disponibilidad y Préstamo conserva su ventana con inicio y fin.

El formulario muestra «¿Cada cuánto se cobra este precio?» solo en Alquiler. `rental_unit` admite `hour`, `day`, `week` y `month`; mes significa 30 días, no mes calendario. La unidad aparece en catálogo, detalle, resumen del oferente, confirmación de solicitud y operaciones. El resumen de comisión/neto es por unidad, no por toda la disponibilidad. No se implementa débito recurrente, prorrateo ni liquidación del total de una reserva.

Cambiar la unidad incrementa `contract_version`; la solicitud guarda `requested_rental_unit` y valida coincidencia con la publicación vigente. La aceptación conserva la unidad en el contrato. Para alquileres por hora, el solicitante elige fecha/hora local de Perú y se envían instantes ISO con zona; las reservas continúan usando intervalos `[inicio,fin)`. Los alquileres anteriores conservan día como unidad. Pagos y entrega productiva siguen fuera del alcance.

## Boleta de procedencia

Para exposición desde S/1000, el formulario solicita una foto completa y legible de la boleta/comprobante, o un PDF, en lugar de pedir una URL. La foto se prepara con `preparePhoto` sin recorte para conservar el documento completo y se limita a 2 MB; PDF hasta 5 MB. Se puede fotografiar, adjuntar, reemplazar, descargar o quitar la referencia antes de guardar. Si falla un reemplazo, se conserva la referencia anterior. La revisión sigue siendo manual: subir un archivo no acredita automáticamente su autenticidad ni que corresponda al artículo.

Archivos nuevos en `server/uploads/private-provenance` o `RANTI_PROVENANCE_DIR`, fuera de Git y sin ruta estática pública. Respaldar el directorio y la base juntos. El titular puede descargarlos aun antes de asociarlos; un administrador verificado puede descargarlos solo después de asociarlos a una publicación. Cada descarga registra auditoría antes de devolver bytes; si falla la auditoría no se entrega el archivo. Se sirve como adjunto con `Cache-Control: private, no-store` y MIME controlado. La API pública de detalle no devuelve `provenance_evidence_ref`.

Se comprueban tamaño, tipo declarado y firma básica (incluyendo cabecera y fin de PDF), no se realiza decodificación segura de PDF, análisis antimalware ni detección de contenido activo. Para producción faltan esos controles, almacenamiento cifrado/gestionado, retención y limpieza de huérfanos. El piloto limita a 20 comprobantes sin asociar por cuenta. Quitar/reemplazar una referencia no borra físicamente el archivo antiguo de inmediato. Las referencias HTTPS históricas se conservan para compatibilidad; no pasan a ser privadas por esta migración. No se ofrece captura ni ingreso de nuevas URLs desde el formulario.

## Verificación

La solicitud confirmada de una operación usa las condiciones mostradas (`requested_price`, `requested_guarantee_amount`, `requested_contract_version`) y queda `Pendiente` con vencimiento configurado. El backend valida la versión vigente, ambas cuentas y la disponibilidad; un reintento idéntico vigente devuelve la misma solicitud. No genera OTP, cobro, snapshot aceptado ni reserva al solicitar. La vista de participante usa proyección segura y paginación. `operation-request-http.integration.test.js` y `operation-policy.test.js` cubren solicitudes, ofertas, aceptación/rechazo, competencia de reservas y cancelación antes de movimientos económicos; no acreditan pagos, reversión ni entrega del flujo heredado.

Cliente: `npm test --prefix client`, `npm run lint --prefix client`, `npm run build --prefix client`.

Servidor aislado, desde PowerShell en la raíz: `& .\tools\test-postgres.ps1 -TestArguments @('publication-photo-http.integration.test.js','publication-review-http.integration.test.js','publication-pricing.test.js','provenance-files-http.integration.test.js')`.

Ofertas y decisiones: `& .\tools\test-postgres.ps1 -TestArguments @('test/operation-request-http.integration.test.js','test/operation-policy.test.js')`.
