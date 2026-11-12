# Operaciones, pagos, comisiones y constancias

## Alcance y arquitectura

### Recorrido de los wireframes en el piloto

1. En **Mi perfil → Configurar pagos y cobros**, el comprador guarda una preferencia de prueba. La tarjeta de ejemplo se valida en la pantalla y se muestra enmascarada. La aplicación conserva la referencia al método.
2. El oferente verifica un destino ficticio, elige qué medios admite y continúa a publicar. Al aceptar una solicitud de venta o alquiler, se fijan los métodos y el destino de esa operación. Los cambios del perfil se aplican a acuerdos nuevos.
3. Desde **Mis operaciones → Seguir operación**, ambas partes consultan la etapa y coordinan el encuentro. El comprador elige un método habilitado y confirma el desglose. La garantía obligatoria de un alquiler puede registrarse en la simulación local por separado del precio.
4. En el encuentro, con pago confirmado, el comprador genera un código de seis dígitos. El oferente lo valida para registrar la entrega. El código dura diez minutos y se bloquea después de cinco intentos incorrectos.
5. En el alquiler, el comprador registra la devolución. El oferente presenta el acta y el reparto propuesto. El comprador acepta el acta o abre una incidencia por desacuerdo. Administración puede resolver el reparto en el caso. La simulación acredita al comprador el saldo de garantía y asigna al oferente hasta el saldo registrado.
6. Al cierre se registra el abono de prueba al oferente. Cada destinatario confirma la recepción de su propio movimiento. Si se cancela antes de entregar o se aprueba la devolución de una compra, administración registra un reembolso de prueba en la incidencia y el comprador lo confirma en **Pagos y constancias**.
7. Administración consulta las referencias, concilia el registro y descarga constancias con motivo registrado. Las constancias sirven para el piloto académico. La emisión tributaria y la integración bancaria requieren canales externos.

Las migraciones 031–042 añaden perfiles de pago, códigos de entrega, plazos, evidencia, liquidaciones, reembolsos de prueba y los casos administrativos. Las operaciones históricas que se aceptaron sin la configuración de cobro conservan su flujo previo. Consulta la [verificación de las 68 láminas](verificacion-wireframes.md) para las rutas y los valores configurables del piloto.

La base de Venta y Alquiler reutiliza `operations`, participantes, publicación, snapshot contractual, auditoría y chat. Las incidencias se gestionan en el [flujo de comunicación e incidencias](operation-incidences.md) y bloquean el cierre y la elegibilidad del desembolso mientras estén pendientes. Préstamo conserva el piloto de pagos anterior.

Las migraciones 023–024 crean cotizaciones inmutables, eventos deduplicados y registros de transferencias. La 036 permite reintentar tras un fallo simulado comprobado y conserva los intentos anteriores. Los estados de pago (`pending`, `failed`, `simulated_succeeded`, `sandbox_succeeded`) son independientes de la operación y del desembolso.

El cierre económico requiere entrega de la venta, o devolución validada del alquiler, y ausencia de incidencias pendientes. El flujo local registra un abono de prueba cuando corresponde. Cada destinatario confirma la recepción de su movimiento. Culqi sandbox conserva la elegibilidad sin desembolso mientras falte un canal contratado.

## Comisión que se conserva

La migración 025 añade `guarantee_required` a publicaciones. En alquileres y préstamos, el checkbox «¿Quieres que el pago de garantía sea obligatorio?» guarda la condición y aclara que marcarlo es opcional; desmarcado significa importe referencial ante daños, sin exigencia por adelantado ni cobro automático. Las publicaciones anteriores quedan referenciales. Exigirla puede reducir el interés y las solicitudes; se advierte junto al checkbox. El importe declarado continúa contando para evaluar el riesgo. Una garantía obligatoria requiere importe positivo y no aplica a Venta. Cambiar la condición incrementa la versión contractual, y el snapshot aceptado la conserva. El desglose, el detalle público y las operaciones muestran la condición.

Esta elección no habilita custodia ni cobros reales. Una garantía referencial nunca entra en el total, incluso si una tarifa admite garantías reembolsables. Las garantías obligatorias tampoco se recaudan en los modos actualmente habilitados sin capacidad de custodia; el comprador recibe esa aclaración.

El formulario recalcula la exigencia de boleta al cambiar precio, garantía o modalidad: muestra la carga de comprobante solo cuando el mayor importe aplicable alcanza S/1000 (en Venta cuenta el precio; en Préstamo, la garantía; en Alquiler, el mayor de ambos). Por debajo del umbral indica que no se necesita boleta y oculta la carga, conservando cualquier comprobante ya adjunto sin borrarlo. Esta aclaración de interfaz no modifica la validación de riesgo del servidor.

`publicationPricing` descuenta al oferente 10% por unidad cuando el precio es menor que S/60; desde S/60 descuenta 5%. Redondea al céntimo, mitad hacia arriba. El IGV propio del servicio ya está incluido; no se agrega otra deducción. En alquiler se mantiene esa política por unidad y se multiplica por las unidades solicitadas, redondeando duración hacia arriba según hora/día/semana/mes fijo de 30 días. No se cambia el tramo porque la suma de varias unidades cruce S/60. Las condiciones aceptadas guardan también la política del oferente; los snapshots existentes que ya la contienen se respetan.

La cotización conserva bruto acordado, neto del oferente, ingreso Ranti previsto (con su impuesto incluido), ingreso neto de impuesto estimado, costo previsto del procesador, cargo de servicio, total y garantías. Solo administración recibe ese reparto y la tarifa completa. El comprador recibe el neto del artículo más un único cargo de servicio (comisión Ranti ya existente + costo del procesamiento). Esta presentación **no suma la comisión otra vez sobre el bruto publicado**. El oferente ve bruto, deducción vigente y neto, no el costo de Culqi ni el reparto interno.

No se copian los precios desde el navegador al registro de pago: el servidor calcula y el usuario acepta el total exacto de una cotización. Cambiar el medio crea otra cotización y requiere aceptación nueva; una cotización anterior ya no permite pagar. Caducidad: 10 minutos. El servidor vuelve a comparar las condiciones con el contrato.

## Modelo decimal y tarifas

Dinero: `BigInt` en céntimos, con texto decimal en respuestas y documentos. Porcentajes: enteros en partes por millón. Sin cálculos monetarios en coma flotante.

Para tarifa afín sin mínimos ni impuestos adicionales, el objetivo es `(neto oferente + ingreso Ranti + fijo)/(1-porcentaje)`. El motor no se limita a aplicar el porcentaje al precio del artículo: encuentra el mínimo céntimo cuyo total menos el costo del procesador conserva esos importes. Contempla mínimo de comisión, impuesto incluido/exclusivo y redondeo `ceil`, `floor` o `half_up`. En este modelo soportado, el impuesto exclusivo se aplica sobre la comisión sin redondear y se redondea una sola vez al final. Una tarifa de proveedor con otra secuencia de redondeos, componentes en otra moneda, cuotas o bases diferentes requiere otro modelo explícito; no debe configurarse como si fuera equivalente.

Campos de cada entrada de `RANTI_PROCESSOR_TARIFFS` (JSON server-side): `version`, `currency` (solo PEN soportado), `environment` (`sandbox` o `simulated`), `confirmed` (true), `percentage_ppm`, `fixed_cents`, `minimum_fee_cents`, `tax_ppm`, `tax_treatment` (`included`/`exclusive`), `rounding`, `min_total_cents`, `max_total_cents`, `fee_base` (`full_total`), `guarantee_policy`. Cada versión debe ser única y corresponder a condiciones confirmadas para ese medio; cambiar condiciones exige nueva versión. No copiar tarifas publicitarias o fixtures como tarifas contratadas. Un total inferior al mínimo del proveedor se rechaza, no se encarece artificialmente el precio.

Sin tarifas externas existe solo `simulated`: procesamiento ficticio cero, versión `simulation-only-zero-processor-v1`, claramente etiquetado. **No es una tarifa real de Culqi.** Los porcentajes y costos de los tests son fixtures, no recomendaciones comerciales.

Las garantías son pasivos reembolsables separados del ingreso. La simulación local del recorrido nuevo registra la garantía obligatoria en el total de prueba. La simulación histórica y Culqi sandbox muestran la garantía declarada y cobro cero. La capacidad de custodia bancaria sigue pendiente para sandbox y producción.

## Culqi: disponible y pendiente de configuración

Se consultaron las páginas oficiales de [cargos](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos/), [webhooks](https://docs.culqi.com/es/documentacion/pagos-online/webhooks/) e [integración/producción](https://docs.culqi.com/es/documentacion/pagos-online/integracion-vs-produccion/). El flujo token → cargo se realiza en backend, en céntimos. El adaptador `culqiSandbox` usa únicamente `https://api.culqi.com/v2/`, llave `CULQI_TEST_SECRET_KEY` con prefijo `sk_test_` y token de prueba `tkn_test_…`; rechaza llaves y referencias live. Nunca ingresa ni almacena PAN, CVV o llaves privadas en el frontend. El token de prueba se puede introducir en la vista técnica después de obtenerlo con la herramienta de tokenización de prueba de la cuenta; no se incorporó Checkout ni un formulario de tarjetas.

Faltan las credenciales, tarifas contratadas, métodos habilitados y validación del esquema de eventos/refencias de la cuenta. Por eso las pruebas externas se ejecutan con el adaptador **mockeado**, no se ha efectuado una transacción remota con Culqi. El modo local sí se verifica extremo a extremo con PostgreSQL descartable. No existe modo live ni se habilita con una llave real.

Antes de POST al proveedor se persiste el intento. Repetir la misma cotización y clave recupera su estado. Ante un resultado ambiguo se conserva el intento pendiente y su reserva hasta conciliarlo. Un fallo definitivo del simulador permite otra cotización e intento con historial. El adaptador sandbox consulta el cargo original.

El receptor `POST /api/finance/events/culqi` usa solo el ID para consultar el evento y cargo con la llave secreta de prueba. No confía en estado, importe o referencia enviados por el webhook. Verifica cargo test, metadatos de pago/cotización, moneda e importe exacto antes de confirmar. Duplicados no duplican pagos ni entrega. El adaptador exige prefijos `evt_test_` / `chr_test_`; referencias diferentes se rechazan hasta verificar su contrato en la cuenta. No se inventó una firma HMAC que Culqi no hubiera documentado. Requiere URL HTTPS pública de webhook para integración remota; localhost por sí solo no recibe eventos del proveedor.

La confirmación de prueba alimenta el registro académico ya existente para conservar la coordinación de entrega, sin crear una fila de dinero real en `transactions`. Un pago pendiente bloquea cancelar/liberar la reserva y reprogramar el acuerdo. Un pago confirmado no habilita una cancelación con reembolso automático. Préstamos y operaciones históricas del flujo anterior permanecen en su simulación previa; no se reconstruyen constancias financieras retroactivas.

## Conciliación y pérdidas

Administración: «Ver control económico». Ve tarifas, importes internos, estado y resultado de conciliación. En simulación introduce costo ficticio en céntimos y una referencia; en sandbox el costo se consulta al cargo verificado y se obtiene de `fee_details.total_amount` en PEN. Si no está disponible, no se declara conciliado. El reparto no se entrega a participantes ni siquiera agregando parámetros a su API.

Ingreso real **de prueba** = total − neto oferente − garantía cobrada − costo de procesador conciliado − costos no recuperables. Se compara con el ingreso previsto y se alerta si el margen baja. Nunca se cobra esa diferencia automáticamente al cliente. Se conservan versión tarifaria y referencia de conciliación. El importe actual sustituye el costo estimado, no se suma a este.

`POST /api/admin/finance/:operationId/reconciliation` admite `loss:{kind:'refund_cost'|'chargeback_cost',amount_cents:'…',reference:'…'}` para costos no recuperables. La referencia deduplica el registro. El control económico permite consultar los movimientos, registrar el caso de contracargo de prueba y dejar constancia de su decisión y recuperación.

## Constancias

Desde «Pagos y constancias», cada participante descarga **su propio** documento HTML imprimible (puede guardarse como PDF usando impresión del navegador). Comprador: participantes, bien, fechas/período, precio base, cargo de servicio, garantía separada, total aceptado/pagado de prueba, moneda, estado, referencia y explicación. Oferente: bruto, deducción vigente, neto, estado/condición de transferencia y referencia/fecha solo cuando existieran. No recibe el reparto Ranti/Culqi. Los importes vienen del mismo snapshot inmutable del pago, no de la publicación editada después. Pendiente/fallido muestran pagado cero; no son recibos de éxito.

Son **constancias operativas de prueba**, no boletas/facturas ni prueba de dinero real. No hay emisión SUNAT. Todas las lecturas tienen autenticación, autorización por participante/rol, no-store y auditoría de descarga. El HTML escapa contenido de usuarios y no contiene scripts ni recursos remotos.

## Probar paso a paso

1. Reiniciar `npm run dev` desde la raíz; en desarrollo se aplican 023–024. En despliegues usar `npm run migrate --prefix server` explícitamente. Respaldar antes de migrar. Los archivos aplicados no se modifican.
2. Crear una publicación de Venta o Alquiler y solicitarla desde otra cuenta. En «Mis operaciones → Pagos y constancias», el solicitante puede revisar una cotización antes de que el oferente acepte. El oferente ve su neto. No hay cobro al solicitar/aceptar.
3. Aceptar la operación, proponer lugar/hora y confirmar desde la contraparte. Para alquiler, el encuentro debe ser anterior al inicio del período.
4. En «Pagos y constancias» o burbuja de pago del chat, elegir «Simulación local», calcular y revisar precio base + un cargo de servicio + garantía cobrada cero = total. Marcar aceptación y confirmar «Pago de prueba». Cambiar de medio requiere recalcular y aceptar de nuevo.
5. Repetir con otras operaciones seleccionando «Fallo simulado» y «Pendiente simulado». Verificar estados y constancias con pagado cero. No reintentar automáticamente una operación pendiente ni marcarla como cobrada por un error de red.
6. Descargar constancia desde comprador y liquidación desde oferente. Verificar mismo ID, coherencia de total/neto y ausencia de reparto interno.
7. En administración abrir «Ver control económico», conciliar el registro simulado y registrar un costo mayor para observar alerta de margen. Desde una cuenta común, `/api/admin/finance` debe dar 403 y documentos de la otra parte 404.
8. Confirmar recepción bilateral en Venta: el cierre queda elegible pero sin mecanismo de transferencia. En Alquiler, confirmar la entrega no basta: debe existir devolución bilateral. Una incidencia pendiente bloquea elegibilidad. No inventar una transferencia para continuar.
9. Para sandbox real de la cuenta (no dinero real), configurar localmente la llave secreta test y las tarifas confirmadas en JSON, reiniciar, obtener un token de prueba y usarlo en el medio correspondiente. No se ejecutó este paso sin las credenciales. Validar primero los formatos/estados de esa cuenta y la URL HTTPS de eventos. Cualquier modelo o capacidad no soportado debe permanecer bloqueado.

Pruebas reproducibles aisladas (PowerShell, raíz del repo):

```powershell
& .\tools\test-postgres.ps1 -TestArguments @('test/finance-policy.test.js','test/culqi-sandbox-adapter.test.js','test/finance-http.integration.test.js','test/chat-and-handoff-http.integration.test.js','test/operation-request-http.integration.test.js')
npm test --prefix client
npm run lint --prefix client
npm run build --prefix client
```

Las suites históricas generales del servidor ya tenían fallos fuera de este alcance (interfaces antiguas de publicaciones, privacidad y outbox). No se presentan como corregidas por esta entrega.
