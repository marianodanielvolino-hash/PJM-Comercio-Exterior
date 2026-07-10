'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/dal';
import { calculateSimulationSummary } from '@/lib/calculations/importCostCalculator';
import { merchandiseToCargoItem, totalFobValue, totalUnits } from '@/lib/adapters';
import { mapDbError } from '@/lib/errorMessages';
import { normalizeNcmCode } from '@/lib/ncm/normalizeNcmCode';
import { matchTaxParameters, type MatchableTaxParameter } from '@/lib/ncm/matchTaxParameters';
import { matchInterventionRules, type MatchableInterventionRule } from '@/lib/ncm/matchInterventionRules';
import { logAuditEvent } from '@/lib/auditLog';
import { notifyAllAdmins } from '@/lib/notify';
import { createDefaultChecklistForSimulation } from '@/app/actions/checklist';
import type { SimulationDraft } from '@/types/simulation';
import type { TaxParameterRow, InterventionRuleRow } from '@/types/database';

export interface SaveSimulationPayload {
  id?: string;
  name: string;
  draft: SimulationDraft;
  asCompleted?: boolean;
}

export async function saveSimulation(
  payload: SaveSimulationPayload
): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { draft } = payload;

  const fobValue = totalFobValue(draft.items);
  const units = totalUnits(draft.items);
  const cargoItems = draft.items.map(merchandiseToCargoItem);

  const summary = calculateSimulationSummary({
    fobValue,
    totalUnits: units,
    transportMode: draft.operation.transportMode,
    incoterm: draft.operation.incoterm,
    cargoItems,
    containers: draft.containers,
    freightRates: {
      mainFreightRate: draft.logistics.mainFreightRate,
      bafFsc: draft.logistics.bafFsc,
      fclRates: undefined,
    },
    insurancePercent: draft.logistics.insurancePercent,
    originLocalCharges: draft.logistics.originLocalCharges,
    destinationLocalCharges: draft.logistics.destinationLocalCharges,
    customsBrokerFee: draft.logistics.customsBrokerFee,
    internalFreight: draft.logistics.internalFreight,
    otherDefinitiveCosts: draft.logistics.otherDefinitiveCosts,
    taxRates: draft.taxRates,
  });

  const { data: company } = await supabase.from('companies').select('id').eq('user_id', user.id).maybeSingle();

  const ncmStatuses = draft.items.map((i) => i.ncmStatus);
  const overallNcmStatus = ncmStatuses.includes('requiere_revision')
    ? 'requiere_revision'
    : ncmStatuses.includes('pendiente_validacion')
      ? 'pendiente_validacion'
      : ncmStatuses.includes('propuesto_cliente')
        ? 'propuesto_cliente'
        : ncmStatuses.every((s) => s === 'validado_pjm') && ncmStatuses.length > 0
          ? 'validado_pjm'
          : 'no_informado';

  const documentStatus = 'incomplete';

  // Resolve tax/intervention warnings against the real, active catalog
  // (Sprint 2) for every distinct NCM code used in this simulation.
  const distinctCodes = Array.from(new Set(draft.items.map((i) => normalizeNcmCode(i.ncmCode)).filter(Boolean)));
  let hasTaxWarning = distinctCodes.length === 0;
  let hasInterventionWarning = false;
  let hasBlockingIntervention = false;

  if (distinctCodes.length > 0) {
    const [{ data: taxRows }, { data: ruleRows }] = await Promise.all([
      supabase.from('tax_parameters').select('*').eq('is_active', true).in('normalized_ncm_code', distinctCodes).returns<TaxParameterRow[]>(),
      supabase.from('intervention_rules').select('*').eq('is_active', true).returns<InterventionRuleRow[]>(),
    ]);

    const taxCandidates: MatchableTaxParameter[] = (taxRows ?? []).map((t) => ({
      id: t.id,
      normalizedNcmCode: t.normalized_ncm_code,
      isActive: t.is_active,
      importDuty: t.import_duty,
      statisticalRate: t.statistical_rate,
      iva: t.iva,
      ivaAdditional: t.iva_additional,
      ganancias: t.ganancias,
      iibb: t.iibb,
      otherTax: t.other_tax,
    }));
    const interventionCandidates: MatchableInterventionRule[] = (ruleRows ?? []).map((r) => ({
      id: r.id,
      normalizedNcmCode: r.normalized_ncm_code,
      chapter: r.chapter,
      interventionType: r.intervention_type as MatchableInterventionRule['interventionType'],
      description: r.description,
      severity: r.severity,
      isActive: r.is_active,
    }));

    for (const code of distinctCodes) {
      if (!matchTaxParameters(code, taxCandidates)) hasTaxWarning = true;
      const interventionMatch = matchInterventionRules(code, interventionCandidates);
      if (interventionMatch.hasWarning) hasInterventionWarning = true;
      if (interventionMatch.hasBlocking) hasBlockingIntervention = true;
    }
  }

  const hasNcmWarning = ncmStatuses.some((s) => s === 'no_informado' || s === 'propuesto_cliente' || s === 'requiere_revision');

  const simulationRow = {
    user_id: user.id,
    company_id: company?.id ?? null,
    name: payload.name || 'Simulación sin nombre',
    operation_type: draft.operation.operationType,
    transport_mode: draft.operation.transportMode,
    incoterm: draft.operation.incoterm,
    origin_country: draft.operation.originCountry,
    origin_port: draft.operation.originPort,
    destination_port: draft.operation.destinationPort,
    final_destination: draft.operation.finalDestination,
    currency: draft.operation.currency,
    exchange_rate: draft.operation.exchangeRate,
    supplier: draft.operation.supplier,
    buyer: draft.operation.buyer,
    shipment_date: draft.operation.shipmentDate,
    arrival_date: draft.operation.arrivalDate,
    fob_value: fobValue,
    freight: summary.freight,
    insurance: summary.insurance,
    cif_value: summary.cif,
    customs_duty: summary.customsDuty,
    statistical_rate: summary.statisticalRate,
    iva: summary.iva,
    iva_additional: summary.ivaAdditional,
    ganancias: summary.ganancias,
    iibb: summary.iibb,
    local_costs: summary.localExpenses,
    definitive_cost: summary.definitiveCost,
    fiscal_credits: summary.fiscalCredits,
    cash_required: summary.cashRequired,
    total_cost: summary.cashRequired,
    unit_cost: summary.unitCost,
    status: payload.asCompleted ? 'completed' : 'draft',
    ncm_status: overallNcmStatus,
    document_status: documentStatus,
    raw_data: draft as unknown as Record<string, unknown>,
    has_ncm_warning: hasNcmWarning,
    has_tax_warning: hasTaxWarning,
    has_intervention_warning: hasInterventionWarning,
    has_blocking_intervention: hasBlockingIntervention,
  };

  let simulationId = payload.id;

  if (simulationId) {
    const { error } = await supabase.from('simulations').update(simulationRow).eq('id', simulationId);
    if (error) return { error: mapDbError(error.message) };
    await supabase.from('simulation_items').delete().eq('simulation_id', simulationId);
  } else {
    const { data, error } = await supabase.from('simulations').insert(simulationRow).select('id').single();
    if (error) return { error: mapDbError(error.message) };
    simulationId = data.id;
  }

  if (draft.items.length > 0) {
    const itemRows = draft.items.map((item) => ({
      simulation_id: simulationId,
      description: item.description,
      technical_description: item.technicalDescription,
      brand_model: item.brandModel,
      intended_use: item.intendedUse,
      quantity: item.quantity,
      unit_value: item.unitValue,
      total_value: item.quantity * item.unitValue,
      gross_weight: item.grossWeightKg,
      net_weight: item.netWeightKg,
      length_cm: item.lengthCm,
      width_cm: item.widthCm,
      height_cm: item.heightCm,
      cbm: (item.lengthCm * item.widthCm * item.heightCm) / 1_000_000 * (item.packages || 1),
      packages: item.packages,
      packaging_type: item.packagingType,
      country_of_origin: item.countryOfOrigin,
      ncm_code: item.ncmCode,
      ncm_description: item.ncmDescription,
      ncm_status: item.ncmStatus,
      ncm_position_id: item.ncmPositionId,
      ncm_source: item.ncmSource,
      tax_parameter_id: item.taxParameterId,
      is_divisible: item.isDivisible,
      min_separable_qty: item.minSeparableQty,
      weight_per_unit_kg: item.weightPerUnitKg,
      urgency: item.urgency,
      partial_urgent_needed: item.partialUrgentNeeded,
      urgent_qty_suggested: item.urgentQtySuggested,
      declared_use: item.declaredUse,
    }));
    const { error: itemsError } = await supabase.from('simulation_items').insert(itemRows);
    if (itemsError) return { error: mapDbError(itemsError.message) };
  }

  const logisticsRow = {
    simulation_id: simulationId,
    freight: summary.freight,
    insurance: summary.insurance,
    baf: draft.logistics.bafFsc,
    fsc: 0,
    origin_charges: draft.logistics.originLocalCharges,
    destination_charges: draft.logistics.destinationLocalCharges,
    internal_freight: draft.logistics.internalFreight,
    customs_broker_fee: draft.logistics.customsBrokerFee,
    terminal: 0,
    warehouse: 0,
    desconsolidation: 0,
    handling: 0,
    verification: 0,
    scan: 0,
    storage: 0,
    pickup: 0,
    empty_return: 0,
    management_fee: 0,
    bank_expenses: 0,
    documentation_expenses: 0,
    other_expenses: draft.logistics.otherDefinitiveCosts,
  };
  await supabase.from('logistic_costs').upsert(logisticsRow, { onConflict: 'simulation_id' });

  if (payload.asCompleted && (draft.operation.transportMode === 'ocean_fcl' || draft.operation.transportMode === 'ocean_lcl')) {
    const { generateAlternativeScenarios } = await import('@/app/actions/scenarios');
    await generateAlternativeScenarios(simulationId!);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/simulaciones/${simulationId}`);

  return { id: simulationId! };
}

export async function requestFormalQuote(simulationId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: simulation, error: fetchError } = await supabase
    .from('simulations')
    .select('id, user_id')
    .eq('id', simulationId)
    .maybeSingle();

  if (fetchError) return { error: mapDbError(fetchError.message) };
  if (!simulation || simulation.user_id !== user.id) {
    return { error: 'No se encontró la simulación o no tenés permisos para solicitarla.' };
  }

  const { data: company } = await supabase.from('companies').select('id').eq('user_id', user.id).maybeSingle();
  if (!company) {
    return {
      error: 'Antes de solicitar una cotización formal, completá los datos de tu empresa en la sección "Perfil".',
    };
  }

  const { error: updateError } = await supabase
    .from('simulations')
    .update({ status: 'sent_to_pjm' })
    .eq('id', simulationId);
  if (updateError) return { error: mapDbError(updateError.message) };

  // Insert-if-missing rather than upsert: once a pjm_requests row exists,
  // only admin_pjm can update it (see RLS), so re-requesting must be a no-op
  // for the client rather than attempting (and failing) an update.
  const { data: existingRequest } = await supabase
    .from('pjm_requests')
    .select('id')
    .eq('simulation_id', simulationId)
    .maybeSingle();

  let requestId = existingRequest?.id as string | undefined;
  if (!existingRequest) {
    const { data: newRequest, error: requestError } = await supabase
      .from('pjm_requests')
      .insert({ simulation_id: simulationId, status: 'received' })
      .select('id')
      .single();
    if (requestError) return { error: mapDbError(requestError.message) };
    requestId = newRequest.id;
  }

  await createDefaultChecklistForSimulation(simulationId);

  await logAuditEvent({
    entityType: 'pjm_request',
    entityId: requestId ?? null,
    simulationId,
    requestId: requestId ?? null,
    userId: user.id,
    action: 'formal_quote_requested',
  });

  await notifyAllAdmins({
    type: 'new_request',
    title: 'Nueva solicitud recibida',
    message: `Se envió a revisión una nueva simulación.`,
    linkUrl: `/admin/solicitudes/${simulationId}`,
  });

  revalidatePath('/dashboard');
  revalidatePath(`/simulaciones/${simulationId}`);
  revalidatePath('/admin');

  return { ok: true };
}
