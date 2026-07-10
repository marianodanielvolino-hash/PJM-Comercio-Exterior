# QA — Automatización de escenarios alternativos de envío parcial

Pruebas manuales contra un proyecto Supabase con `0001_init.sql` a
`0006_shipment_scenarios.sql` + `supabase/seed.sql` aplicados. Ver también
`QA_CHECKLIST.md`, `SPRINT_2_QA.md`…`SPRINT_5_QA.md`.

Preparación:
- [ ] Migración `0006_shipment_scenarios.sql` aplicada sin errores;
      `shipping_scenario_rules` tiene 6 filas, `courier_rate_table` y
      `air_rate_table` tienen filas de ejemplo (China→Argentina y `*`/`*`
      de fallback).
- [ ] `npm run test` pasa en local (94 tests, incluye las 31 de
      `shipmentScenarioOptimizer.test.ts`).

## Wizard — paso "Mercadería"

- [ ] Cada ítem tiene un bloque nuevo "Envío parcial (courier/aéreo) —
      opcional" con: ¿Es divisible?, Cantidad mínima separable, Peso por
      unidad (kg), Uso declarado, Urgencia, ¿Una parte necesita llegar
      antes?, Cantidad urgente sugerida.
- [ ] "Cantidad mínima separable" y "Cantidad urgente sugerida" están
      deshabilitados hasta tildar "Sí" en divisible / "Sí" en llegada
      anticipada respectivamente.
- [ ] Guardar una simulación **marítima** (LCL o FCL) con al menos un
      ítem `isDivisible=Sí`, `minSeparableQty` > 0, peso y valor unitario
      > 0 → al entrar a `/simulaciones/[id]`, la pestaña "Escenarios
      alternativos" muestra al menos 2 tarjetas (Marítimo completo +
      Marítimo + courier parcial).
- [ ] Guardar la misma simulación con transporte **aéreo** o **terrestre**
      → la pestaña "Escenarios alternativos" no genera nada (mensaje "No
      se generaron escenarios…"); confirmar que el resto de la simulación
      (cálculo, PDF, etc.) sigue funcionando igual que antes de este
      cambio.
- [ ] Un ítem divisible sin peso por unidad cargado (0) → no aparece un
      escenario courier fabricado con datos falsos; en su lugar, o no se
      genera el escenario, o queda con menos ítems separados (ver
      `insufficientDataItemIds` en el motivo `insufficient_information`
      si se consulta `eligibility_reasons` en Supabase).

## Cliente — pestaña "Escenarios alternativos"

- [ ] El bloque de disclaimer ("Comparativo estimativo… ahorro
      garantizado… sujeto a validación de PJM") aparece siempre arriba de
      todo, antes de cualquier tarjeta.
- [ ] Cada tarjeta muestra: costo económico definitivo, créditos
      fiscales, caja necesaria, costo unitario, plazo estimado, y (salvo
      la de marítimo completo) ahorro/sobrecosto vs. base en monto y
      porcentaje.
- [ ] La tarjeta de courier muestra el estado de elegibilidad
      ("Elegible para courier" / "No elegible para courier" / "Requiere
      revisión PJM").
- [ ] Con un ítem de uso declarado "Comercial" en el tramo separado →
      la tarjeta de courier queda en estado "No elegible" y muestra el
      mensaje "Courier no sugerido: supera el límite de valor/peso/
      cantidad o tiene finalidad comercial declarada."
- [ ] Con un ítem cuya posición NCM tiene una intervención/restricción
      activa (Sprint 2) en el tramo separado → la tarjeta de courier
      queda en "Requiere revisión PJM" (no "No elegible").
- [ ] Etiquetas "Más económico" / "Más rápido" aparecen sobre la tarjeta
      correspondiente cuando hay más de un escenario alternativo.
- [ ] "Marcar como preferido" en una tarjeta no-base → el borde de la
      tarjeta cambia y aparece la etiqueta "Preferido"; sólo una tarjeta
      puede estar marcada a la vez.
- [ ] "Solicitar análisis PJM de escenario alternativo" → el botón queda
      deshabilitado después del primer click (estado del análisis pasa de
      "Sin solicitar" a "Análisis solicitado"); un admin recibe
      notificación in-app.
- [ ] La tarjeta de un escenario "No elegible" no muestra los botones de
      acción (marcar preferido / solicitar análisis) — no tiene sentido
      pedir revisión de algo ya descartado por parámetro.

## Panel PJM — pestaña "Escenarios alternativos"

- [ ] `/admin/solicitudes/[id]`, pestaña "Escenarios alternativos" lista
      todos los escenarios generados, con su desglose de costos completo
      y los supuestos (assumptions) usados para calcularlo.
- [ ] "Validar escenario" sin comentario → bloqueado con mensaje claro.
- [ ] "Validar escenario" con comentario → el estado pasa a "Validado por
      PJM"; el cliente recibe notificación in-app.
- [ ] "Rechazar escenario" con comentario → estado "Rechazado por PJM";
      notificación al cliente con el motivo.
- [ ] Ajustar flete/derecho de importación/tasa estadística/plazo desde
      los inputs numéricos y "Guardar ajustes" → la caja necesaria
      mostrada se recalcula con los nuevos valores (ver también en la
      pestaña del cliente tras refrescar).
- [ ] "Convertir en base de cotización formal" sobre un escenario
      validado → crea un borrador en la pestaña "Cotización" (Sprint 4)
      con los ítems de la simulación y el desglose de costos **del
      escenario**, no de la simulación marítima original.

## Auditoría

- [ ] `audit_logs` registra, en orden: `alternative_scenarios_generated`
      (al guardar la simulación), `courier_scenario_flagged` (sólo si el
      courier no quedó `courier_eligible`), `alternative_scenario_selected`
      (al marcar preferido), `alternative_scenario_requested_for_review`,
      `pjm_validated_alternative_scenario` / `pjm_rejected_alternative_scenario`.

## RLS

- [ ] Un cliente puede `select` los escenarios de su propia simulación
      pero no los de otra (probar con dos usuarios).
- [ ] Un cliente **no puede** hacer `update` directo sobre
      `simulation_alternative_scenarios` por SQL — no hay policy de
      `update` para clientes; "marcar preferido" y "solicitar revisión"
      sólo funcionan a través de las Server Actions (que validan
      ownership y escriben con `service_role`).
- [ ] `shipping_scenario_rules`, `courier_rate_table`, `air_rate_table`:
      cualquier usuario autenticado puede `select`; sólo `admin_pjm`
      puede `insert`/`update`/`delete`.

## No romper lo existente

- [ ] Simulaciones ya guardadas antes de esta migración (sin las
      columnas nuevas en `simulation_items`) siguen abriendo y mostrando
      su resultado correctamente (las columnas nuevas tienen default:
      `is_divisible=false`, por lo que nada se genera para ellas).
- [ ] El motor de cálculo principal (`importCostCalculator.ts`) no fue
      modificado — sus tests siguen en verde sin cambios.
- [ ] `npm run build`, `npm run lint`, `npm run test` sin errores.

## Decisiones de alcance / simplificaciones documentadas

- El tramo courier sólo modela derecho de importación y tasa estadística
  sobre el excedente de la franquicia FOB — no se modelan IVA ni
  percepciones sobre ese tramo (la normativa real de courier sin fin
  comercial no las cobra igual que el régimen general).
- El límite de "usos de courier por año por persona" está parametrizado
  y se muestra como advertencia informativa, pero no se verifica
  automáticamente (no existe todavía un historial de uso courier por
  cliente en el sistema).
- El remanente marítimo y los gastos locales se prorratean linealmente
  según la proporción de valor FOB que queda en ese tramo — es una
  estimación, no un recálculo exacto de embalaje/CBM por ítem separado.
- Los plazos marítimos (30–45 días según modalidad) son una constante
  documentada en el código, no una tabla parametrizada — sólo se pidió
  parametrizar las reglas y tarifas de courier/aéreo.
