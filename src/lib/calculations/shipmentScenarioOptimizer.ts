/**
 * Automatización de escenarios alternativos de envío parcial.
 *
 * Cuando una operación marítima tiene mercadería divisible (o con una
 * porción urgente), este módulo compara el escenario marítimo completo
 * contra separar una parte por courier y/o por aéreo. Todo es estimativo:
 * ningún resultado de acá es una cotización formal ni un ahorro
 * garantizado — siempre queda sujeto a validación de PJM y a la normativa
 * courier vigente (parametrizada en `ShippingScenarioRules`, nunca
 * hardcodeada en este archivo).
 *
 * Reutiliza el motor de cálculo existente (`importCostCalculator.ts`) para
 * el tramo aéreo (régimen general completo) y para el remanente marítimo,
 * en vez de reimplementar la matemática de tributos. El tramo courier usa
 * una versión simplificada explícita: sólo derecho de importación y tasa
 * estadística sobre el excedente de la franquicia FOB (no se modelan IVA
 * ni percepciones sobre courier, ver ASSUMPTIONS más abajo) — la
 * normativa real de courier no cobra esos tributos sobre pequeños envíos
 * sin fin comercial, a diferencia del régimen general.
 *
 * Todas las funciones son puras (sin I/O): el llamador (server action) es
 * responsable de traer reglas/tarifas desde la base y de persistir el
 * resultado.
 */

import {
  calculateCIF,
  calculateCustomsDuty,
  calculateStatisticalRate,
  calculateVATBase,
  calculateVAT,
  calculateVATAdditional,
  calculateGananciasPerception,
  calculateIIBBPerception,
  calculateFiscalCredits,
  calculateInsurance,
  calculateDefinitiveCost,
  calculateCashRequired,
  calculateUnitCost,
  type SimulationCalculationResult,
} from './importCostCalculator';
import type {
  Urgency,
  DeclaredUse,
  ScenarioKey,
  CourierEligibility,
  CourierIneligibilityReason,
  ScenarioRecommendation,
} from '@/types/scenarios';

// ---------------------------------------------------------------------------
// Inputs: parametrized rules, rate tables, and the wizard's per-item data
// ---------------------------------------------------------------------------

export interface ShippingScenarioRules {
  courierMaxUnitsSameSpecies: number;
  courierMaxWeightPerPackageKg: number;
  courierMaxFobUsd: number;
  courierDutyExemptionFobUsd: number;
  courierRequiresNonCommercialUse: boolean;
  courierMaxUsesPerYear: number;
}

export interface ScenarioCargoItem {
  id: string;
  description: string;
  quantity: number;
  unitValueFob: number;
  weightPerUnitKg: number;
  isDivisible: boolean;
  minSeparableQty: number;
  urgency: Urgency;
  partialUrgentNeeded: boolean;
  urgentQtySuggested: number;
  declaredUse: DeclaredUse;
  /** True when the item's NCM has an active intervention/restriction rule (Sprint 2 data). */
  hasNcmInterventionOrRestriction: boolean;
}

export interface CourierRateBracket {
  originCountry: string;
  destinationCountry: string;
  weightFrom: number;
  weightTo: number;
  estimatedCostUsd: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

export interface AirRateBracket {
  origin: string;
  destination: string;
  weightFrom: number;
  weightTo: number;
  ratePerKg: number;
  fuelSurcharge: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

/** Documented, non-parametrized estimate — no rate table was requested for maritime transit times. */
const MARITIME_ESTIMATED_DAYS: Record<string, { min: number; max: number }> = {
  ocean_fcl: { min: 30, max: 40 },
  ocean_lcl: { min: 35, max: 45 },
};
const DEFAULT_MARITIME_DAYS = { min: 30, max: 45 };

/** Chargeable-weight ceiling used to gate the air-only scenario as "sensible". Documented assumption, not a DB rule (only courier limits were requested as parametrized). */
const AIR_ONLY_MAX_REASONABLE_WEIGHT_KG = 500;

// ---------------------------------------------------------------------------
// Cargo splitting
// ---------------------------------------------------------------------------

export interface CargoSplitLine {
  itemId: string;
  description: string;
  quantity: number;
  fobValue: number;
  weightKg: number;
}

export interface CargoSplitResult {
  splitItems: CargoSplitLine[];
  remainderItems: CargoSplitLine[];
  totalFobValue: number;
  totalWeightKg: number;
  maxUnitsSingleSpecies: number;
  hasAnyCommercialDeclaredUse: boolean;
  hasAnyInterventionOrRestriction: boolean;
  /** Items that were marked divisible/urgent but lack weight or FOB-per-unit data to estimate anything. */
  insufficientDataItemIds: string[];
}

function emptySplit(items: ScenarioCargoItem[]): CargoSplitResult {
  return {
    splitItems: [],
    remainderItems: items.map((i) => ({
      itemId: i.id,
      description: i.description,
      quantity: i.quantity,
      fobValue: i.quantity * i.unitValueFob,
      weightKg: i.quantity * i.weightPerUnitKg,
    })),
    totalFobValue: 0,
    totalWeightKg: 0,
    maxUnitsSingleSpecies: 0,
    hasAnyCommercialDeclaredUse: false,
    hasAnyInterventionOrRestriction: false,
    insufficientDataItemIds: [],
  };
}

/**
 * Picks, per item, the smallest sensible courier-eligible slice: at least
 * `minSeparableQty`, capped by how many units fit under the per-package
 * weight limit, by `courierMaxUnitsSameSpecies`, and — across the whole
 * split — by `courierMaxFobUsd` (the last item added is clipped down
 * rather than dropped, so the split uses as much of the budget as makes
 * sense instead of silently skipping it).
 */
export function splitCargoForCourier(items: ScenarioCargoItem[], rules: ShippingScenarioRules): CargoSplitResult {
  const result = emptySplit([]);
  const remainderItems: CargoSplitLine[] = [];
  let runningFobValue = 0;

  for (const item of items) {
    if (!item.isDivisible || item.minSeparableQty <= 0) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    if (item.weightPerUnitKg <= 0 || item.unitValueFob <= 0) {
      result.insufficientDataItemIds.push(item.id);
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    const maxByPackageWeight = Math.floor(rules.courierMaxWeightPerPackageKg / item.weightPerUnitKg);
    let candidateQty = Math.min(item.quantity, item.minSeparableQty, maxByPackageWeight, rules.courierMaxUnitsSameSpecies);
    candidateQty = Math.max(0, candidateQty);

    if (candidateQty > 0) {
      let candidateFob = candidateQty * item.unitValueFob;
      const remainingBudget = rules.courierMaxFobUsd - runningFobValue;
      if (candidateFob > remainingBudget) {
        candidateQty = Math.max(0, Math.floor(remainingBudget / item.unitValueFob));
        candidateFob = candidateQty * item.unitValueFob;
      }
    }

    if (candidateQty <= 0) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    const lineFob = candidateQty * item.unitValueFob;
    const lineWeight = candidateQty * item.weightPerUnitKg;
    runningFobValue += lineFob;

    result.splitItems.push({ itemId: item.id, description: item.description, quantity: candidateQty, fobValue: lineFob, weightKg: lineWeight });
    result.maxUnitsSingleSpecies = Math.max(result.maxUnitsSingleSpecies, candidateQty);
    if (item.declaredUse === 'comercial') result.hasAnyCommercialDeclaredUse = true;
    if (item.hasNcmInterventionOrRestriction) result.hasAnyInterventionOrRestriction = true;

    const remainderQty = item.quantity - candidateQty;
    if (remainderQty > 0) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: remainderQty,
        fobValue: remainderQty * item.unitValueFob,
        weightKg: remainderQty * item.weightPerUnitKg,
      });
    }
  }

  result.remainderItems = remainderItems;
  result.totalFobValue = result.splitItems.reduce((sum, l) => sum + l.fobValue, 0);
  result.totalWeightKg = result.splitItems.reduce((sum, l) => sum + l.weightKg, 0);
  return result;
}

/**
 * Splits out the urgent portion of items flagged `partialUrgentNeeded`
 * (or the entire cargo, for the "aéreo completo" scenario). Air has no
 * courier-style regulatory caps, only the same minimum-data guard so we
 * never fabricate a split from missing weight/value.
 */
export function splitCargoForAir(items: ScenarioCargoItem[], options?: { fullCargo?: boolean }): CargoSplitResult {
  const result = emptySplit([]);
  const remainderItems: CargoSplitLine[] = [];

  for (const item of items) {
    const wantsAir = options?.fullCargo || item.partialUrgentNeeded;
    if (!wantsAir) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    if (item.weightPerUnitKg <= 0 || item.unitValueFob <= 0) {
      result.insufficientDataItemIds.push(item.id);
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    const candidateQty = options?.fullCargo
      ? item.quantity
      : Math.max(0, Math.min(item.quantity, item.urgentQtySuggested > 0 ? item.urgentQtySuggested : item.quantity));

    if (candidateQty <= 0) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: item.quantity,
        fobValue: item.quantity * item.unitValueFob,
        weightKg: item.quantity * item.weightPerUnitKg,
      });
      continue;
    }

    const lineFob = candidateQty * item.unitValueFob;
    const lineWeight = candidateQty * item.weightPerUnitKg;
    result.splitItems.push({ itemId: item.id, description: item.description, quantity: candidateQty, fobValue: lineFob, weightKg: lineWeight });
    result.maxUnitsSingleSpecies = Math.max(result.maxUnitsSingleSpecies, candidateQty);

    const remainderQty = item.quantity - candidateQty;
    if (remainderQty > 0) {
      remainderItems.push({
        itemId: item.id,
        description: item.description,
        quantity: remainderQty,
        fobValue: remainderQty * item.unitValueFob,
        weightKg: remainderQty * item.weightPerUnitKg,
      });
    }
  }

  result.remainderItems = remainderItems;
  result.totalFobValue = result.splitItems.reduce((sum, l) => sum + l.fobValue, 0);
  result.totalWeightKg = result.splitItems.reduce((sum, l) => sum + l.weightKg, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Courier eligibility
// ---------------------------------------------------------------------------

export interface CourierEligibilityResult {
  status: CourierEligibility;
  reasons: CourierIneligibilityReason[];
}

const HARD_BLOCKING_REASONS: CourierIneligibilityReason[] = [
  'exceeds_max_value',
  'exceeds_max_weight_per_package',
  'exceeds_max_quantity_per_species',
  'declared_commercial_use',
  'cargo_not_divisible',
  'insufficient_information',
];

export function checkCourierEligibility(input: {
  split: CargoSplitResult;
  rules: ShippingScenarioRules;
  requiresDocumentaryValidation?: boolean;
}): CourierEligibilityResult {
  const { split, rules } = input;
  const reasons: CourierIneligibilityReason[] = [];

  if (split.splitItems.length === 0) {
    reasons.push(split.insufficientDataItemIds.length > 0 ? 'insufficient_information' : 'cargo_not_divisible');
  }
  if (split.totalFobValue > rules.courierMaxFobUsd) reasons.push('exceeds_max_value');
  if (split.splitItems.some((l) => l.weightKg > rules.courierMaxWeightPerPackageKg)) reasons.push('exceeds_max_weight_per_package');
  if (split.maxUnitsSingleSpecies > rules.courierMaxUnitsSameSpecies) reasons.push('exceeds_max_quantity_per_species');
  if (rules.courierRequiresNonCommercialUse && split.hasAnyCommercialDeclaredUse) reasons.push('declared_commercial_use');
  if (split.hasAnyInterventionOrRestriction) reasons.push('ncm_intervention_or_restriction');
  if (input.requiresDocumentaryValidation) reasons.push('requires_documentary_validation');

  const hasHardBlock = reasons.some((r) => HARD_BLOCKING_REASONS.includes(r));
  const status: CourierEligibility = hasHardBlock ? 'courier_not_eligible' : reasons.length > 0 ? 'courier_requires_pjm_review' : 'courier_eligible';

  return { status, reasons };
}

// ---------------------------------------------------------------------------
// Rate lookups (internal helpers — not part of the requested public API,
// but kept in this file so the module stays self-contained)
// ---------------------------------------------------------------------------

function findCourierRate(rates: CourierRateBracket[], origin: string, destination: string, weightKg: number): CourierRateBracket | null {
  const candidates = rates.filter(
    (r) =>
      (r.originCountry === origin || r.originCountry === '*') &&
      (r.destinationCountry === destination || r.destinationCountry === '*') &&
      weightKg >= r.weightFrom &&
      weightKg <= r.weightTo
  );
  if (candidates.length === 0) return null;
  const exact = candidates.find((r) => r.originCountry === origin && r.destinationCountry === destination);
  return exact ?? candidates[0];
}

function findAirRate(rates: AirRateBracket[], origin: string, destination: string, weightKg: number): AirRateBracket | null {
  const candidates = rates.filter(
    (r) => (r.origin === origin || r.origin === '*') && (r.destination === destination || r.destination === '*') && weightKg >= r.weightFrom && weightKg <= r.weightTo
  );
  if (candidates.length === 0) return null;
  const exact = candidates.find((r) => r.origin === origin && r.destination === destination);
  return exact ?? candidates[0];
}

// ---------------------------------------------------------------------------
// Per-scenario cost computation
// ---------------------------------------------------------------------------

export interface ScenarioCostBreakdownLine {
  category: 'fob' | 'freight' | 'insurance' | 'customs' | 'taxes' | 'local' | 'other';
  label: string;
  amountUsd: number;
}

export interface ScenarioComputation {
  scenarioKey: ScenarioKey;
  fobPartial: number;
  weightPartialKg: number;
  freight: number;
  insurance: number;
  customsDuty: number;
  statisticalRate: number;
  fiscalCredits: number;
  localCosts: number;
  definitiveCost: number;
  cashRequired: number;
  unitCost: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  costBreakdown: ScenarioCostBreakdownLine[];
  assumptions: string[];
}

export interface TaxRates {
  importDuty: number;
  statisticalRate: number;
  iva: number;
  ivaAdditional: number;
  ganancias: number;
  iibb: number;
}

export function calculateMaritimeOnlyScenario(input: {
  base: SimulationCalculationResult;
  totalFobValue: number;
  totalUnits: number;
  transportMode: string;
}): ScenarioComputation {
  const days = MARITIME_ESTIMATED_DAYS[input.transportMode] ?? DEFAULT_MARITIME_DAYS;
  const { base } = input;
  return {
    scenarioKey: 'maritime_only',
    fobPartial: input.totalFobValue,
    weightPartialKg: base.cargoSummary.totalGrossWeightKg,
    freight: base.freight,
    insurance: base.insurance,
    customsDuty: base.customsDuty,
    statisticalRate: base.statisticalRate,
    fiscalCredits: base.fiscalCredits,
    localCosts: base.localExpenses,
    definitiveCost: base.definitiveCost,
    cashRequired: base.cashRequired,
    unitCost: calculateUnitCost(base.cashRequired, input.totalUnits),
    estimatedDaysMin: days.min,
    estimatedDaysMax: days.max,
    costBreakdown: [
      { category: 'fob', label: 'Valor FOB', amountUsd: input.totalFobValue },
      { category: 'freight', label: 'Flete internacional', amountUsd: base.freight },
      { category: 'insurance', label: 'Seguro', amountUsd: base.insurance },
      { category: 'customs', label: 'Derecho de importación', amountUsd: base.customsDuty },
      { category: 'customs', label: 'Tasa estadística', amountUsd: base.statisticalRate },
      { category: 'local', label: 'Gastos locales y despacho', amountUsd: base.localExpenses },
    ],
    assumptions: ['Escenario base: régimen marítimo general con toda la mercadería en un único embarque.'],
  };
}

/**
 * Recomputes the tax/cost pipeline for whatever fraction of FOB value stays
 * on the maritime leg, reusing the existing engine's pure functions. Local
 * charges and freight scale with the FOB share that remains; the
 * customs-broker fee is treated as a flat per-operation cost that isn't
 * re-charged here (it's already counted once, on the base scenario).
 * Insurance re-derives the base scenario's implicit percentage
 * (insurance / (fob + freight)) so a zero-FOB remainder yields zero
 * insurance instead of the calculator's $50 floor.
 */
function computeRemainder(base: SimulationCalculationResult, remainderFobValue: number, freight: number, taxRates: TaxRates, fraction: number) {
  const insurance = remainderFobValue > 0 ? Math.max((remainderFobValue + freight) * insurancePercentFromBase(base), 0) : 0;
  const cif = calculateCIF(remainderFobValue, freight, insurance);
  const customsDuty = calculateCustomsDuty(cif, taxRates.importDuty);
  const statisticalRate = calculateStatisticalRate(cif, taxRates.statisticalRate);
  const vatBase = calculateVATBase(cif, customsDuty, statisticalRate);
  const iva = calculateVAT(vatBase, taxRates.iva);
  const ivaAdditional = calculateVATAdditional(vatBase, taxRates.ivaAdditional);
  const ganancias = calculateGananciasPerception(vatBase, taxRates.ganancias);
  const iibb = calculateIIBBPerception(vatBase, taxRates.iibb);
  const fiscalCredits = calculateFiscalCredits(iva, ivaAdditional, ganancias, iibb);
  const localExpenses = base.localExpenses * fraction;
  const definitiveCost = calculateDefinitiveCost({
    freight,
    insurance,
    localExpenses,
    customsDuty,
    statisticalRate,
    customsBrokerFee: 0,
    internalFreight: 0,
    otherDefinitiveCosts: 0,
  });
  return { freight, insurance, cif, customsDuty, statisticalRate, fiscalCredits, localExpenses, definitiveCost };
}

function insurancePercentFromBase(base: SimulationCalculationResult): number {
  const denominator = base.cif - base.insurance;
  if (denominator <= 0) return 0;
  return base.insurance / denominator;
}

export function calculateMaritimePlusCourierScenario(input: {
  items: ScenarioCargoItem[];
  base: SimulationCalculationResult;
  totalFobValue: number;
  totalUnits: number;
  transportMode: string;
  taxRates: TaxRates;
  rules: ShippingScenarioRules;
  courierRates: CourierRateBracket[];
  originCountry: string;
  destinationCountry: string;
  requiresDocumentaryValidation?: boolean;
}): { scenario: ScenarioComputation; eligibility: CourierEligibilityResult; split: CargoSplitResult } | null {
  const split = splitCargoForCourier(input.items, input.rules);
  if (split.splitItems.length === 0) return null;

  const eligibility = checkCourierEligibility({ split, rules: input.rules, requiresDocumentaryValidation: input.requiresDocumentaryValidation });

  const remainderFobValue = input.totalFobValue - split.totalFobValue;
  const remainder = computeRemainder(
    input.base,
    remainderFobValue,
    input.base.freight * (input.totalFobValue > 0 ? remainderFobValue / input.totalFobValue : 0),
    input.taxRates,
    input.totalFobValue > 0 ? remainderFobValue / input.totalFobValue : 0
  );

  const rateBracket = findCourierRate(input.courierRates, input.originCountry, input.destinationCountry, split.totalWeightKg);
  const courierFreight = rateBracket?.estimatedCostUsd ?? 0;
  const courierDaysMin = rateBracket?.estimatedDaysMin ?? 5;
  const courierDaysMax = rateBracket?.estimatedDaysMax ?? 12;

  const dutiableExcess = Math.max(0, split.totalFobValue - input.rules.courierDutyExemptionFobUsd);
  const courierDuty = dutiableExcess * (input.taxRates.importDuty / 100);
  const courierStatRate = dutiableExcess * (input.taxRates.statisticalRate / 100);

  const definitiveCost = remainder.definitiveCost + courierFreight + courierDuty + courierStatRate;
  const fiscalCredits = remainder.fiscalCredits;
  const cashRequired = calculateCashRequired(definitiveCost, fiscalCredits);

  const maritimeOnlyDays = MARITIME_ESTIMATED_DAYS[input.transportMode] ?? DEFAULT_MARITIME_DAYS;

  const assumptions = [
    `Franja courier estimada por tabla de referencia (no vinculante). Vigencia y disponibilidad sujetas a validación de PJM.`,
    `Sólo se estima derecho de importación y tasa estadística sobre el excedente de la franquicia FOB USD ${input.rules.courierDutyExemptionFobUsd} — no se modelan IVA ni percepciones sobre el tramo courier.`,
    `Gastos locales y flete del remanente marítimo se prorratean según la proporción de valor FOB que queda en ese tramo.`,
    `El régimen courier permite hasta ${input.rules.courierMaxUsesPerYear} usos por año por persona — no se verifica automáticamente el historial de uso.`,
  ];

  return {
    split,
    eligibility,
    scenario: {
      scenarioKey: 'maritime_courier',
      fobPartial: split.totalFobValue,
      weightPartialKg: split.totalWeightKg,
      freight: remainder.freight + courierFreight,
      insurance: remainder.insurance,
      customsDuty: remainder.customsDuty + courierDuty,
      statisticalRate: remainder.statisticalRate + courierStatRate,
      fiscalCredits,
      localCosts: remainder.localExpenses,
      definitiveCost,
      cashRequired,
      unitCost: calculateUnitCost(cashRequired, input.totalUnits),
      estimatedDaysMin: Math.min(courierDaysMin, maritimeOnlyDays.min),
      estimatedDaysMax: Math.max(courierDaysMax, maritimeOnlyDays.max),
      costBreakdown: [
        { category: 'fob', label: 'Valor FOB courier (parcial)', amountUsd: split.totalFobValue },
        { category: 'freight', label: 'Flete courier estimado', amountUsd: courierFreight },
        { category: 'freight', label: 'Flete marítimo (remanente)', amountUsd: remainder.freight },
        { category: 'insurance', label: 'Seguro (remanente marítimo)', amountUsd: remainder.insurance },
        { category: 'customs', label: 'Derecho de importación courier (sobre excedente)', amountUsd: courierDuty },
        { category: 'customs', label: 'Tasa estadística courier (sobre excedente)', amountUsd: courierStatRate },
        { category: 'customs', label: 'Derecho de importación (remanente marítimo)', amountUsd: remainder.customsDuty },
        { category: 'customs', label: 'Tasa estadística (remanente marítimo)', amountUsd: remainder.statisticalRate },
        { category: 'local', label: 'Gastos locales (remanente marítimo)', amountUsd: remainder.localExpenses },
      ],
      assumptions,
    },
  };
}

export function calculateMaritimePlusAirScenario(input: {
  items: ScenarioCargoItem[];
  base: SimulationCalculationResult;
  totalFobValue: number;
  totalUnits: number;
  transportMode: string;
  taxRates: TaxRates;
  insurancePercent: number;
  airRates: AirRateBracket[];
  origin: string;
  destination: string;
  fullCargo?: boolean;
}): { scenario: ScenarioComputation; split: CargoSplitResult } | null {
  const split = splitCargoForAir(input.items, { fullCargo: input.fullCargo });
  if (split.splitItems.length === 0) return null;

  const remainderFobValue = input.totalFobValue - split.totalFobValue;
  const remainderFraction = input.totalFobValue > 0 ? remainderFobValue / input.totalFobValue : 0;
  const remainder = computeRemainder(input.base, remainderFobValue, input.base.freight * remainderFraction, input.taxRates, remainderFraction);

  const rateBracket = findAirRate(input.airRates, input.origin, input.destination, split.totalWeightKg);
  const airFreight = rateBracket ? split.totalWeightKg * rateBracket.ratePerKg + rateBracket.fuelSurcharge : 0;
  const airDaysMin = rateBracket?.estimatedDaysMin ?? 4;
  const airDaysMax = rateBracket?.estimatedDaysMax ?? 9;

  // Full general regime on the air leg: same tax pipeline as the maritime engine, no franchise.
  const airInsurance = calculateInsurance(split.totalFobValue, airFreight, input.insurancePercent);
  const airCif = calculateCIF(split.totalFobValue, airFreight, airInsurance);
  const airCustomsDuty = calculateCustomsDuty(airCif, input.taxRates.importDuty);
  const airStatisticalRate = calculateStatisticalRate(airCif, input.taxRates.statisticalRate);
  const airVatBase = calculateVATBase(airCif, airCustomsDuty, airStatisticalRate);
  const airIva = calculateVAT(airVatBase, input.taxRates.iva);
  const airIvaAdditional = calculateVATAdditional(airVatBase, input.taxRates.ivaAdditional);
  const airGanancias = calculateGananciasPerception(airVatBase, input.taxRates.ganancias);
  const airIibb = calculateIIBBPerception(airVatBase, input.taxRates.iibb);
  const airFiscalCredits = calculateFiscalCredits(airIva, airIvaAdditional, airGanancias, airIibb);
  const airDefinitiveCost = calculateDefinitiveCost({
    freight: airFreight,
    insurance: airInsurance,
    localExpenses: 0,
    customsDuty: airCustomsDuty,
    statisticalRate: airStatisticalRate,
    customsBrokerFee: 0,
    internalFreight: 0,
    otherDefinitiveCosts: 0,
  });

  const definitiveCost = remainder.definitiveCost + airDefinitiveCost;
  const fiscalCredits = remainder.fiscalCredits + airFiscalCredits;
  const cashRequired = calculateCashRequired(definitiveCost, fiscalCredits);
  const maritimeOnlyDays = MARITIME_ESTIMATED_DAYS[input.transportMode] ?? DEFAULT_MARITIME_DAYS;

  const scenarioKey: ScenarioKey = input.fullCargo ? 'air_only' : 'maritime_air';
  const assumptions = [
    'El tramo aéreo mantiene el régimen general de importación completo (mismos tributos que el marítimo, sin franquicia courier).',
    'Tarifa aérea estimada por tabla de referencia (tarifa por kg + recargo combustible) — no vinculante.',
  ];
  if (!input.fullCargo) {
    assumptions.push('Gastos locales y flete del remanente marítimo se prorratean según la proporción de valor FOB que queda en ese tramo.');
  }

  return {
    split,
    scenario: {
      scenarioKey,
      fobPartial: split.totalFobValue,
      weightPartialKg: split.totalWeightKg,
      freight: remainder.freight + airFreight,
      insurance: remainder.insurance + airInsurance,
      customsDuty: remainder.customsDuty + airCustomsDuty,
      statisticalRate: remainder.statisticalRate + airStatisticalRate,
      fiscalCredits,
      localCosts: remainder.localExpenses,
      definitiveCost,
      cashRequired,
      unitCost: calculateUnitCost(cashRequired, input.totalUnits),
      estimatedDaysMin: input.fullCargo ? airDaysMin : Math.min(airDaysMin, maritimeOnlyDays.min),
      estimatedDaysMax: input.fullCargo ? airDaysMax : Math.max(airDaysMax, maritimeOnlyDays.max),
      costBreakdown: [
        { category: 'fob', label: 'Valor FOB aéreo (parcial)', amountUsd: split.totalFobValue },
        { category: 'freight', label: 'Flete aéreo estimado', amountUsd: airFreight },
        { category: 'insurance', label: 'Seguro (tramo aéreo)', amountUsd: airInsurance },
        { category: 'customs', label: 'Derecho de importación (tramo aéreo)', amountUsd: airCustomsDuty },
        { category: 'customs', label: 'Tasa estadística (tramo aéreo)', amountUsd: airStatisticalRate },
        ...(input.fullCargo
          ? []
          : [
              { category: 'freight' as const, label: 'Flete marítimo (remanente)', amountUsd: remainder.freight },
              { category: 'customs' as const, label: 'Derecho de importación (remanente marítimo)', amountUsd: remainder.customsDuty },
              { category: 'customs' as const, label: 'Tasa estadística (remanente marítimo)', amountUsd: remainder.statisticalRate },
              { category: 'local' as const, label: 'Gastos locales (remanente marítimo)', amountUsd: remainder.localExpenses },
            ]),
      ],
      assumptions,
    },
  };
}

/** True when the air-only scenario is "sensible enough" to compute/show at all, per the acceptance criteria (reasonable weight, medium/high urgency, or an explicit request). */
export function isAirOnlySensible(input: { items: ScenarioCargoItem[]; totalWeightKg: number; userRequested?: boolean }): boolean {
  if (input.userRequested) return true;
  const hasMediumOrHighUrgency = input.items.some((i) => i.urgency === 'media' || i.urgency === 'alta');
  return hasMediumOrHighUrgency && input.totalWeightKg > 0 && input.totalWeightKg <= AIR_ONLY_MAX_REASONABLE_WEIGHT_KG;
}

// ---------------------------------------------------------------------------
// Comparison, ranking, warnings
// ---------------------------------------------------------------------------

export interface ScenarioComparison {
  diffCashRequired: number;
  diffCashRequiredPercent: number;
  diffTaxes: number;
  diffLogistics: number;
  diffDaysMin: number;
  diffDaysMax: number;
}

export function compareScenarios(base: ScenarioComputation, alt: ScenarioComputation): ScenarioComparison {
  const diffCashRequired = alt.cashRequired - base.cashRequired;
  const diffCashRequiredPercent = base.cashRequired > 0 ? (diffCashRequired / base.cashRequired) * 100 : 0;
  const diffTaxes = alt.customsDuty + alt.statisticalRate - (base.customsDuty + base.statisticalRate);
  const diffLogistics = alt.freight + alt.insurance + alt.localCosts - (base.freight + base.insurance + base.localCosts);
  return {
    diffCashRequired,
    diffCashRequiredPercent,
    diffTaxes,
    diffLogistics,
    diffDaysMin: alt.estimatedDaysMin - base.estimatedDaysMin,
    diffDaysMax: alt.estimatedDaysMax - base.estimatedDaysMax,
  };
}

export function rankScenariosByCost<T extends { cashRequired: number }>(scenarios: T[]): T[] {
  return [...scenarios].sort((a, b) => a.cashRequired - b.cashRequired);
}

export function rankScenariosBySpeed<T extends { estimatedDaysMax: number; estimatedDaysMin: number }>(scenarios: T[]): T[] {
  return [...scenarios].sort((a, b) => a.estimatedDaysMax - b.estimatedDaysMax || a.estimatedDaysMin - b.estimatedDaysMin);
}

export function generateScenarioWarnings(input: {
  scenarioKey: ScenarioKey;
  eligibility?: CourierEligibilityResult;
  comparison?: ScenarioComparison;
}): string[] {
  const warnings: string[] = [
    'Escenario estimativo: no constituye cotización formal ni ahorro garantizado. Sujeto a validación de PJM y a la normativa aduanera vigente.',
  ];

  if (input.scenarioKey === 'maritime_courier' && input.eligibility) {
    if (input.eligibility.status === 'courier_not_eligible') {
      warnings.push('Courier no sugerido: supera el límite de valor/peso/cantidad o tiene finalidad comercial declarada.');
    } else if (input.eligibility.status === 'courier_requires_pjm_review') {
      warnings.push('Este escenario requiere validación PJM antes de confirmar la elegibilidad del régimen courier.');
    } else {
      warnings.push('Cumple los parámetros configurados de elegibilidad courier, pero igualmente requiere validación PJM antes de avanzar.');
    }
  }

  if (input.scenarioKey === 'maritime_air' || input.scenarioKey === 'air_only') {
    warnings.push('El tramo aéreo mantiene el régimen general de importación (no aplica franquicia courier).');
  }

  if (input.comparison && input.comparison.diffCashRequired > 0) {
    warnings.push('Este escenario implica un sobrecosto estimado frente al marítimo completo — evaluar si la anticipación de tiempo lo justifica.');
  }

  return warnings;
}

export function recommendationFor(scenarioKey: ScenarioKey, eligibility: CourierEligibilityResult | null | undefined, comparison: ScenarioComparison): ScenarioRecommendation {
  if (scenarioKey === 'maritime_courier') {
    if (!eligibility || eligibility.status === 'courier_not_eligible') return 'not_eligible';
    if (eligibility.status === 'courier_requires_pjm_review') return 'review';
    return comparison.diffCashRequired <= 0 ? 'recommended' : 'review';
  }
  // Air scenarios: "recommended" only when it's both faster and not a large overcost.
  if (comparison.diffDaysMax < 0 && comparison.diffCashRequiredPercent <= 15) return 'recommended';
  return 'review';
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface GenerateShipmentScenariosInput {
  items: ScenarioCargoItem[];
  base: SimulationCalculationResult;
  totalFobValue: number;
  totalUnits: number;
  transportMode: string;
  taxRates: TaxRates;
  insurancePercent: number;
  rules: ShippingScenarioRules;
  courierRates: CourierRateBracket[];
  airRates: AirRateBracket[];
  originCountry: string;
  destinationCountry: string;
  requiresDocumentaryValidation?: boolean;
  userRequestedAirOnly?: boolean;
}

export interface GeneratedScenario {
  scenarioKey: ScenarioKey;
  computation: ScenarioComputation;
  eligibility: CourierEligibilityResult | null;
  comparisonVsBase: ScenarioComparison;
  recommendation: ScenarioRecommendation;
  warnings: string[];
  itemsSplit: CargoSplitResult | null;
}

/**
 * Only runs for maritime bases (ocean_fcl/ocean_lcl) — callers should not
 * invoke this for other transport modes. Only maritime is a genuine "base"
 * that a courier/air portion could be split off from.
 */
export function generateShipmentScenarios(input: GenerateShipmentScenariosInput): GeneratedScenario[] {
  const baseComputation = calculateMaritimeOnlyScenario({
    base: input.base,
    totalFobValue: input.totalFobValue,
    totalUnits: input.totalUnits,
    transportMode: input.transportMode,
  });

  const scenarios: GeneratedScenario[] = [
    {
      scenarioKey: 'maritime_only',
      computation: baseComputation,
      eligibility: null,
      comparisonVsBase: { diffCashRequired: 0, diffCashRequiredPercent: 0, diffTaxes: 0, diffLogistics: 0, diffDaysMin: 0, diffDaysMax: 0 },
      recommendation: 'recommended',
      warnings: generateScenarioWarnings({ scenarioKey: 'maritime_only' }),
      itemsSplit: null,
    },
  ];

  const courierResult = calculateMaritimePlusCourierScenario({
    items: input.items,
    base: input.base,
    totalFobValue: input.totalFobValue,
    totalUnits: input.totalUnits,
    transportMode: input.transportMode,
    taxRates: input.taxRates,
    rules: input.rules,
    courierRates: input.courierRates,
    originCountry: input.originCountry,
    destinationCountry: input.destinationCountry,
    requiresDocumentaryValidation: input.requiresDocumentaryValidation,
  });
  if (courierResult) {
    const comparison = compareScenarios(baseComputation, courierResult.scenario);
    scenarios.push({
      scenarioKey: 'maritime_courier',
      computation: courierResult.scenario,
      eligibility: courierResult.eligibility,
      comparisonVsBase: comparison,
      recommendation: recommendationFor('maritime_courier', courierResult.eligibility, comparison),
      warnings: generateScenarioWarnings({ scenarioKey: 'maritime_courier', eligibility: courierResult.eligibility, comparison }),
      itemsSplit: courierResult.split,
    });
  }

  const airResult = calculateMaritimePlusAirScenario({
    items: input.items,
    base: input.base,
    totalFobValue: input.totalFobValue,
    totalUnits: input.totalUnits,
    transportMode: input.transportMode,
    taxRates: input.taxRates,
    insurancePercent: input.insurancePercent,
    airRates: input.airRates,
    origin: input.originCountry,
    destination: input.destinationCountry,
  });
  if (airResult) {
    const comparison = compareScenarios(baseComputation, airResult.scenario);
    scenarios.push({
      scenarioKey: 'maritime_air',
      computation: airResult.scenario,
      eligibility: null,
      comparisonVsBase: comparison,
      recommendation: recommendationFor('maritime_air', null, comparison),
      warnings: generateScenarioWarnings({ scenarioKey: 'maritime_air', comparison }),
      itemsSplit: airResult.split,
    });

    if (isAirOnlySensible({ items: input.items, totalWeightKg: input.base.cargoSummary.totalGrossWeightKg, userRequested: input.userRequestedAirOnly })) {
      const airOnlyResult = calculateMaritimePlusAirScenario({
        items: input.items,
        base: input.base,
        totalFobValue: input.totalFobValue,
        totalUnits: input.totalUnits,
        transportMode: input.transportMode,
        taxRates: input.taxRates,
        insurancePercent: input.insurancePercent,
        airRates: input.airRates,
        origin: input.originCountry,
        destination: input.destinationCountry,
        fullCargo: true,
      });
      if (airOnlyResult) {
        const airOnlyComparison = compareScenarios(baseComputation, airOnlyResult.scenario);
        scenarios.push({
          scenarioKey: 'air_only',
          computation: airOnlyResult.scenario,
          eligibility: null,
          comparisonVsBase: airOnlyComparison,
          recommendation: recommendationFor('air_only', null, airOnlyComparison),
          warnings: generateScenarioWarnings({ scenarioKey: 'air_only', comparison: airOnlyComparison }),
          itemsSplit: airOnlyResult.split,
        });
      }
    }
  }

  return scenarios;
}
