'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireUser, requireAdmin } from '@/lib/dal';
import { mapDbError } from '@/lib/errorMessages';
import { logAuditEvent } from '@/lib/auditLog';
import { notifyAllAdmins } from '@/lib/notify';
import { normalizeNcmCode } from '@/lib/ncm/normalizeNcmCode';
import { matchInterventionRules, type MatchableInterventionRule } from '@/lib/ncm/matchInterventionRules';
import { getIncotermResponsibility, type SimulationCalculationResult } from '@/lib/calculations/importCostCalculator';
import {
  generateShipmentScenarios,
  type ScenarioCargoItem,
  type ShippingScenarioRules,
  type CourierRateBracket,
  type AirRateBracket,
} from '@/lib/calculations/shipmentScenarioOptimizer';
import type {
  SimulationRow,
  SimulationItemRow,
  ShippingScenarioRuleRow,
  CourierRateRow,
  AirRateRow,
  InterventionRuleRow,
  SimulationAlternativeScenarioRow,
  PjmRequestRow,
} from '@/types/database';
import type { DeclaredUse, Urgency } from '@/types/scenarios';
import type { Incoterm } from '@/types/simulation';

type ActionResult = { ok: true } | { error: string };

const DEFAULT_RULES: ShippingScenarioRules = {
  courierMaxUnitsSameSpecies: 3,
  courierMaxWeightPerPackageKg: 50,
  courierMaxFobUsd: 3000,
  courierDutyExemptionFobUsd: 400,
  courierRequiresNonCommercialUse: true,
  courierMaxUsesPerYear: 5,
};

function rulesFromRows(rows: ShippingScenarioRuleRow[]): ShippingScenarioRules {
  const byKey = new Map(rows.filter((r) => r.is_active).map((r) => [r.key, r.value]));
  return {
    courierMaxUnitsSameSpecies: (byKey.get('courier_max_units_same_species') as number) ?? DEFAULT_RULES.courierMaxUnitsSameSpecies,
    courierMaxWeightPerPackageKg: (byKey.get('courier_max_weight_per_package_kg') as number) ?? DEFAULT_RULES.courierMaxWeightPerPackageKg,
    courierMaxFobUsd: (byKey.get('courier_max_fob_usd') as number) ?? DEFAULT_RULES.courierMaxFobUsd,
    courierDutyExemptionFobUsd: (byKey.get('courier_duty_exemption_fob_usd') as number) ?? DEFAULT_RULES.courierDutyExemptionFobUsd,
    courierRequiresNonCommercialUse: (byKey.get('courier_requires_non_commercial_use') as boolean) ?? DEFAULT_RULES.courierRequiresNonCommercialUse,
    courierMaxUsesPerYear: (byKey.get('courier_max_uses_per_year') as number) ?? DEFAULT_RULES.courierMaxUsesPerYear,
  };
}

/**
 * Runs the optimizer for a simulation and persists the resulting scenarios.
 * Only meaningful for maritime bases with at least one divisible or
 * partially-urgent item — the caller (saveSimulation) is responsible for
 * that gate. Replaces any previously generated scenarios for this
 * simulation (a re-save produces a fresh comparison, not a growing list).
 */
export async function generateAlternativeScenarios(simulationId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: simulation } = await supabase.from('simulations').select('*').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (!simulation) return { error: 'Simulación no encontrada.' };
  if (simulation.transport_mode !== 'ocean_fcl' && simulation.transport_mode !== 'ocean_lcl') {
    return { ok: true }; // scenarios only apply to maritime bases — silently no-op, not an error
  }

  const { data: items } = await supabase.from('simulation_items').select('*').eq('simulation_id', simulationId).returns<SimulationItemRow[]>();
  if (!items || items.length === 0) return { ok: true };

  const hasCandidate = items.some((i) => i.is_divisible || i.partial_urgent_needed);
  if (!hasCandidate) {
    await supabase.from('simulation_alternative_scenarios').delete().eq('simulation_id', simulationId);
    return { ok: true };
  }

  const [{ data: ruleRows }, { data: courierRows }, { data: airRows }, { data: interventionRows }] = await Promise.all([
    supabase.from('shipping_scenario_rules').select('*').returns<ShippingScenarioRuleRow[]>(),
    supabase.from('courier_rate_table').select('*').eq('is_active', true).returns<CourierRateRow[]>(),
    supabase.from('air_rate_table').select('*').eq('is_active', true).returns<AirRateRow[]>(),
    supabase.from('intervention_rules').select('*').eq('is_active', true).returns<InterventionRuleRow[]>(),
  ]);

  const rules = rulesFromRows(ruleRows ?? []);
  const courierRates: CourierRateBracket[] = (courierRows ?? []).map((r) => ({
    originCountry: r.origin_country,
    destinationCountry: r.destination_country,
    weightFrom: r.weight_from,
    weightTo: r.weight_to,
    estimatedCostUsd: r.estimated_cost_usd,
    estimatedDaysMin: r.estimated_days_min,
    estimatedDaysMax: r.estimated_days_max,
  }));
  const airRates: AirRateBracket[] = (airRows ?? []).map((r) => ({
    origin: r.origin,
    destination: r.destination,
    weightFrom: r.weight_from,
    weightTo: r.weight_to,
    ratePerKg: r.rate_per_kg,
    fuelSurcharge: r.fuel_surcharge,
    estimatedDaysMin: r.estimated_days_min,
    estimatedDaysMax: r.estimated_days_max,
  }));

  const interventionCandidates: MatchableInterventionRule[] = (interventionRows ?? []).map((r) => ({
    id: r.id,
    normalizedNcmCode: r.normalized_ncm_code,
    chapter: r.chapter,
    interventionType: r.intervention_type as MatchableInterventionRule['interventionType'],
    description: r.description,
    severity: r.severity,
    isActive: r.is_active,
  }));

  const scenarioItems: ScenarioCargoItem[] = items.map((item) => {
    const normalized = item.ncm_code ? normalizeNcmCode(item.ncm_code) : '';
    const interventionMatch = normalized ? matchInterventionRules(normalized, interventionCandidates) : { hasWarning: false };
    return {
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitValueFob: item.unit_value,
      weightPerUnitKg: item.weight_per_unit_kg,
      isDivisible: item.is_divisible,
      minSeparableQty: item.min_separable_qty,
      urgency: item.urgency as Urgency,
      partialUrgentNeeded: item.partial_urgent_needed,
      urgentQtySuggested: item.urgent_qty_suggested,
      declaredUse: item.declared_use as DeclaredUse,
      hasNcmInterventionOrRestriction: interventionMatch.hasWarning,
    };
  });

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalGrossWeightKg = items.reduce((sum, i) => sum + i.gross_weight, 0);

  // The scenario optimizer only needs the simulation's already-computed
  // totals (freight/insurance/duties depend on rate lookups the wizard
  // already resolved) — no need to re-run the full calculator pipeline
  // just to immediately discard most of its output.
  const base: SimulationCalculationResult = {
    cargoSummary: { totalGrossWeightKg, totalVolumeCbm: 0, volumetricWeightKg: 0, chargeableWeightKg: totalGrossWeightKg },
    incotermResponsibility: getIncotermResponsibility(simulation.incoterm as Incoterm),
    freight: simulation.freight,
    insurance: simulation.insurance,
    cif: simulation.cif_value,
    customsDuty: simulation.customs_duty,
    statisticalRate: simulation.statistical_rate,
    vatBase: simulation.cif_value + simulation.customs_duty + simulation.statistical_rate,
    iva: simulation.iva,
    ivaAdditional: simulation.iva_additional,
    ganancias: simulation.ganancias,
    iibb: simulation.iibb,
    fiscalCredits: simulation.fiscal_credits,
    localExpenses: simulation.local_costs,
    definitiveCost: simulation.definitive_cost,
    cashRequired: simulation.cash_required,
    unitCost: simulation.unit_cost,
    logisticsCostOverFobPercent: 0,
    taxesOverCifPercent: 0,
  };

  const generated = generateShipmentScenarios({
    items: scenarioItems,
    base,
    totalFobValue: simulation.fob_value,
    totalUnits,
    transportMode: simulation.transport_mode,
    taxRates: {
      importDuty: simulation.cif_value > 0 ? (simulation.customs_duty / simulation.cif_value) * 100 : 0,
      statisticalRate: simulation.cif_value > 0 ? (simulation.statistical_rate / simulation.cif_value) * 100 : 0,
      iva: simulation.cif_value > 0 ? (simulation.iva / simulation.cif_value) * 100 : 0,
      ivaAdditional: simulation.cif_value > 0 ? (simulation.iva_additional / simulation.cif_value) * 100 : 0,
      ganancias: simulation.cif_value > 0 ? (simulation.ganancias / simulation.cif_value) * 100 : 0,
      iibb: simulation.cif_value > 0 ? (simulation.iibb / simulation.cif_value) * 100 : 0,
    },
    insurancePercent: simulation.fob_value > 0 ? (simulation.insurance / (simulation.fob_value + simulation.freight)) * 100 : 0,
    rules,
    courierRates,
    airRates,
    originCountry: simulation.origin_country,
    destinationCountry: 'Argentina',
  });

  const serviceClient = createServiceRoleClient();
  await serviceClient.from('simulation_alternative_scenarios').delete().eq('simulation_id', simulationId);

  const rowsToInsert = generated.map((g) => ({
    simulation_id: simulationId,
    scenario_key: g.scenarioKey,
    status: 'generated' as const,
    eligibility: g.eligibility?.status ?? null,
    eligibility_reasons: g.eligibility?.reasons ?? [],
    recommendation: g.recommendation,
    currency: simulation.currency,
    fob_partial: g.computation.fobPartial,
    weight_partial_kg: g.computation.weightPartialKg,
    freight: g.computation.freight,
    insurance: g.computation.insurance,
    customs_duty: g.computation.customsDuty,
    statistical_rate: g.computation.statisticalRate,
    fiscal_credits: g.computation.fiscalCredits,
    local_costs: g.computation.localCosts,
    definitive_cost: g.computation.definitiveCost,
    cash_required: g.computation.cashRequired,
    unit_cost: g.computation.unitCost,
    estimated_days_min: g.computation.estimatedDaysMin,
    estimated_days_max: g.computation.estimatedDaysMax,
    diff_cash_required: g.comparisonVsBase.diffCashRequired,
    diff_cash_required_percent: g.comparisonVsBase.diffCashRequiredPercent,
    diff_taxes: g.comparisonVsBase.diffTaxes,
    diff_logistics: g.comparisonVsBase.diffLogistics,
    diff_days_min: g.comparisonVsBase.diffDaysMin,
    diff_days_max: g.comparisonVsBase.diffDaysMax,
    warnings: g.warnings,
    assumptions: { notes: g.computation.assumptions },
    items_split: g.itemsSplit ?? {},
    cost_breakdown: g.computation.costBreakdown,
  }));

  const { error } = await serviceClient.from('simulation_alternative_scenarios').insert(rowsToInsert);
  if (error) return { error: mapDbError(error.message) };

  await logAuditEvent({
    entityType: 'simulation',
    entityId: simulationId,
    simulationId,
    userId: simulation.user_id,
    action: 'alternative_scenarios_generated',
    newValue: { scenarioKeys: generated.map((g) => g.scenarioKey) },
  });

  const flaggedCourier = generated.find((g) => g.scenarioKey === 'maritime_courier' && g.eligibility && g.eligibility.status !== 'courier_eligible');
  if (flaggedCourier) {
    await logAuditEvent({
      entityType: 'simulation',
      entityId: simulationId,
      simulationId,
      userId: simulation.user_id,
      action: 'courier_scenario_flagged',
      newValue: { eligibility: flaggedCourier.eligibility?.status, reasons: flaggedCourier.eligibility?.reasons },
    });
  }

  revalidatePath(`/simulaciones/${simulationId}`);
  revalidatePath(`/admin/solicitudes/${simulationId}`);
  return { ok: true };
}

/** Client-triggered but system-controlled write (only flips is_preferred), so it goes through the service-role client after verifying ownership — see the RLS comment in 0006_shipment_scenarios.sql. */
export async function markScenarioPreferred(scenarioId: string, simulationId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: simulation } = await supabase.from('simulations').select('user_id').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (!simulation || simulation.user_id !== user.id) return { error: 'No tenés permisos sobre esta simulación.' };

  const serviceClient = createServiceRoleClient();
  await serviceClient.from('simulation_alternative_scenarios').update({ is_preferred: false }).eq('simulation_id', simulationId);
  const { error } = await serviceClient.from('simulation_alternative_scenarios').update({ is_preferred: true }).eq('id', scenarioId);
  if (error) return { error: mapDbError(error.message) };

  await logAuditEvent({ entityType: 'alternative_scenario', entityId: scenarioId, simulationId, userId: user.id, action: 'alternative_scenario_selected' });

  revalidatePath(`/simulaciones/${simulationId}`);
  return { ok: true };
}

/** Requests PJM review of the client's preferred alternative scenario: attaches a summary to the request, notifies admins, marks scenario_review_status. Never converts anything into a formal quote by itself. */
export async function requestPjmScenarioReview(scenarioId: string, simulationId: string): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: simulation } = await supabase.from('simulations').select('*').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (!simulation || simulation.user_id !== user.id) return { error: 'No tenés permisos sobre esta simulación.' };

  const { data: scenario } = await supabase
    .from('simulation_alternative_scenarios')
    .select('*')
    .eq('id', scenarioId)
    .maybeSingle<SimulationAlternativeScenarioRow>();
  if (!scenario) return { error: 'Escenario no encontrado.' };

  const serviceClient = createServiceRoleClient();

  let { data: request } = await supabase.from('pjm_requests').select('*').eq('simulation_id', simulationId).maybeSingle<PjmRequestRow>();
  if (!request) {
    const { data: newRequest, error: insertError } = await serviceClient
      .from('pjm_requests')
      .insert({ simulation_id: simulationId, status: 'received' })
      .select('*')
      .single<PjmRequestRow>();
    if (insertError) return { error: mapDbError(insertError.message) };
    request = newRequest;
  }

  const { error: scenarioError } = await serviceClient.from('simulation_alternative_scenarios').update({ status: 'requested_review' }).eq('id', scenarioId);
  if (scenarioError) return { error: mapDbError(scenarioError.message) };

  const { error: requestError } = await serviceClient
    .from('pjm_requests')
    .update({ selected_scenario_id: scenarioId, scenario_review_status: 'requested', last_activity_at: new Date().toISOString() })
    .eq('id', request.id);
  if (requestError) return { error: mapDbError(requestError.message) };

  const summary = `Solicitud de análisis de escenario alternativo (${scenario.scenario_key}): caja necesaria estimada ${scenario.cash_required} ${scenario.currency}, diferencia vs. marítimo completo ${scenario.diff_cash_required >= 0 ? '+' : ''}${scenario.diff_cash_required.toFixed(2)} ${scenario.currency} (${scenario.diff_cash_required_percent.toFixed(1)}%). Elegibilidad courier: ${scenario.eligibility ?? 'n/a'}.`;
  await serviceClient.from('comments').insert({
    request_id: request.id,
    simulation_id: simulationId,
    user_id: user.id,
    comment: summary,
    comment_type: 'internal_note',
    visibility: 'internal',
  });

  await logAuditEvent({
    entityType: 'alternative_scenario',
    entityId: scenarioId,
    simulationId,
    requestId: request.id,
    userId: user.id,
    action: 'alternative_scenario_requested_for_review',
  });

  await notifyAllAdmins({
    type: 'alternative_scenario_review_requested',
    title: 'Análisis de escenario alternativo solicitado',
    message: `${simulation.name}: el cliente pidió que PJM analice un escenario alternativo de envío parcial.`,
    linkUrl: `/admin/solicitudes/${simulationId}`,
  });

  revalidatePath(`/simulaciones/${simulationId}`);
  revalidatePath(`/admin/solicitudes/${simulationId}`);
  revalidatePath('/admin');
  return { ok: true };
}

export async function validateAlternativeScenario(scenarioId: string, simulationId: string, comment: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!comment.trim()) {
    return { error: 'Dejá un comentario técnico explicando por qué se valida este escenario (obligatorio, en especial si recomendás courier).' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('simulation_alternative_scenarios')
    .update({ status: 'pjm_validated', reviewed_by: admin.id, reviewed_at: new Date().toISOString(), review_comment: comment })
    .eq('id', scenarioId);
  if (error) return { error: mapDbError(error.message) };

  await supabase.from('pjm_requests').update({ scenario_review_status: 'validated' }).eq('simulation_id', simulationId).eq('selected_scenario_id', scenarioId);

  await logAuditEvent({ entityType: 'alternative_scenario', entityId: scenarioId, simulationId, userId: admin.id, action: 'pjm_validated_alternative_scenario', newValue: { comment } });

  const { data: simulation } = await supabase.from('simulations').select('user_id, name').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (simulation) {
    const { notifyUser } = await import('@/lib/notify');
    await notifyUser({
      userId: simulation.user_id,
      type: 'alternative_scenario_validated',
      title: 'PJM validó tu escenario alternativo',
      message: `${simulation.name}: revisá el detalle en la pestaña "Cotización formal" / "Escenarios alternativos".`,
      linkUrl: `/simulaciones/${simulationId}`,
    });
  }

  revalidatePath(`/admin/solicitudes/${simulationId}`);
  revalidatePath(`/simulaciones/${simulationId}`);
  return { ok: true };
}

export async function rejectAlternativeScenario(scenarioId: string, simulationId: string, comment: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!comment.trim()) {
    return { error: 'Dejá un comentario técnico explicando por qué se rechaza este escenario.' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('simulation_alternative_scenarios')
    .update({ status: 'pjm_rejected', reviewed_by: admin.id, reviewed_at: new Date().toISOString(), review_comment: comment })
    .eq('id', scenarioId);
  if (error) return { error: mapDbError(error.message) };

  await supabase.from('pjm_requests').update({ scenario_review_status: 'rejected' }).eq('simulation_id', simulationId).eq('selected_scenario_id', scenarioId);

  await logAuditEvent({ entityType: 'alternative_scenario', entityId: scenarioId, simulationId, userId: admin.id, action: 'pjm_rejected_alternative_scenario', newValue: { comment } });

  const { data: simulation } = await supabase.from('simulations').select('user_id, name').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (simulation) {
    const { notifyUser } = await import('@/lib/notify');
    await notifyUser({
      userId: simulation.user_id,
      type: 'alternative_scenario_rejected',
      title: 'PJM rechazó el escenario alternativo',
      message: `${simulation.name}: ${comment}`,
      linkUrl: `/simulaciones/${simulationId}`,
    });
  }

  revalidatePath(`/admin/solicitudes/${simulationId}`);
  revalidatePath(`/simulaciones/${simulationId}`);
  return { ok: true };
}

export async function adjustScenarioCosts(
  scenarioId: string,
  simulationId: string,
  fields: { freight?: number; customsDuty?: number; statisticalRate?: number; estimatedDaysMin?: number; estimatedDaysMax?: number }
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: scenario } = await supabase.from('simulation_alternative_scenarios').select('*').eq('id', scenarioId).maybeSingle<SimulationAlternativeScenarioRow>();
  if (!scenario) return { error: 'Escenario no encontrado.' };

  const freight = fields.freight ?? scenario.freight;
  const customsDuty = fields.customsDuty ?? scenario.customs_duty;
  const statisticalRate = fields.statisticalRate ?? scenario.statistical_rate;
  const definitiveCost = scenario.definitive_cost - scenario.freight - scenario.customs_duty - scenario.statistical_rate + freight + customsDuty + statisticalRate;
  const cashRequired = definitiveCost + scenario.fiscal_credits;

  const { error } = await supabase
    .from('simulation_alternative_scenarios')
    .update({
      freight,
      customs_duty: customsDuty,
      statistical_rate: statisticalRate,
      estimated_days_min: fields.estimatedDaysMin ?? scenario.estimated_days_min,
      estimated_days_max: fields.estimatedDaysMax ?? scenario.estimated_days_max,
      definitive_cost: definitiveCost,
      cash_required: cashRequired,
    })
    .eq('id', scenarioId);
  if (error) return { error: mapDbError(error.message) };

  await logAuditEvent({ entityType: 'alternative_scenario', entityId: scenarioId, simulationId, userId: admin.id, action: 'alternative_scenario_costs_adjusted', newValue: fields });

  revalidatePath(`/admin/solicitudes/${simulationId}`);
  revalidatePath(`/simulaciones/${simulationId}`);
  return { ok: true };
}

/** Converts an alternative scenario into the base for a formal quote draft (Sprint 4): seeds the quote's cost breakdown from the scenario's own cost_breakdown instead of the simulation's. */
export async function convertScenarioToQuoteBase(scenarioId: string, simulationId: string, requestId: string | null): Promise<{ ok: true; quoteId: string } | { error: string }> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: scenario } = await supabase.from('simulation_alternative_scenarios').select('*').eq('id', scenarioId).maybeSingle<SimulationAlternativeScenarioRow>();
  if (!scenario) return { error: 'Escenario no encontrado.' };

  const { data: simulation } = await supabase.from('simulations').select('*').eq('id', simulationId).maybeSingle<SimulationRow>();
  if (!simulation) return { error: 'Simulación no encontrada.' };

  const { data: quote, error } = await supabase
    .from('formal_quotes')
    .insert({
      simulation_id: simulationId,
      request_id: requestId,
      currency: scenario.currency,
      snapshot: { ...simulation, alternative_scenario: scenario },
      created_by: admin.id,
    })
    .select('*')
    .single();
  if (error || !quote) return { error: mapDbError(error?.message ?? 'No se pudo crear el borrador.') };

  const { data: items } = await supabase.from('simulation_items').select('*').eq('simulation_id', simulationId).returns<SimulationItemRow[]>();
  if (items && items.length > 0) {
    await supabase.from('formal_quote_items').insert(
      items.map((item, index) => ({
        formal_quote_id: quote.id,
        description: item.description,
        ncm_code: item.ncm_code,
        quantity: item.quantity,
        unit_value: item.unit_value,
        total_value: item.total_value,
        sort_order: index,
      }))
    );
  }

  const costBreakdown = Array.isArray(scenario.cost_breakdown) ? (scenario.cost_breakdown as { category: string; label: string; amountUsd: number }[]) : [];
  const costRows = costBreakdown
    .filter((c) => c.category !== 'fob')
    .map((c, index) => ({
      formal_quote_id: quote.id,
      category:
        c.category === 'customs'
          ? 'customs'
          : c.category === 'taxes'
            ? 'taxes'
            : c.category === 'freight' || c.category === 'insurance' || c.category === 'local'
              ? 'logistics'
              : 'other',
      label: c.label,
      amount: c.amountUsd,
      sort_order: index,
    }));
  if (costRows.length > 0) {
    await supabase.from('formal_quote_costs').insert(costRows);
  }

  const subtotal = (items ?? []).reduce((sum, i) => sum + i.total_value, 0);
  const total = subtotal + costRows.reduce((sum, c) => sum + c.amount, 0);
  await supabase.from('formal_quotes').update({ subtotal, total }).eq('id', quote.id);

  await logAuditEvent({
    entityType: 'formal_quote',
    entityId: quote.id,
    simulationId,
    requestId,
    userId: admin.id,
    action: 'formal_quote_draft_created',
    newValue: { fromAlternativeScenario: scenarioId },
  });

  revalidatePath(`/admin/solicitudes/${simulationId}`);
  return { ok: true, quoteId: quote.id };
}
