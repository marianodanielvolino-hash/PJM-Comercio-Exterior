import { describe, expect, it } from 'vitest';
import {
  splitCargoForCourier,
  splitCargoForAir,
  checkCourierEligibility,
  calculateMaritimeOnlyScenario,
  calculateMaritimePlusCourierScenario,
  calculateMaritimePlusAirScenario,
  compareScenarios,
  rankScenariosByCost,
  rankScenariosBySpeed,
  generateScenarioWarnings,
  generateShipmentScenarios,
  isAirOnlySensible,
  type ScenarioCargoItem,
  type ShippingScenarioRules,
  type CourierRateBracket,
  type AirRateBracket,
} from './shipmentScenarioOptimizer';
import { calculateSimulationSummary } from './importCostCalculator';

const RULES: ShippingScenarioRules = {
  courierMaxUnitsSameSpecies: 3,
  courierMaxWeightPerPackageKg: 50,
  courierMaxFobUsd: 3000,
  courierDutyExemptionFobUsd: 400,
  courierRequiresNonCommercialUse: true,
  courierMaxUsesPerYear: 5,
};

const COURIER_RATES: CourierRateBracket[] = [
  { originCountry: 'China', destinationCountry: 'Argentina', weightFrom: 0, weightTo: 5, estimatedCostUsd: 45, estimatedDaysMin: 5, estimatedDaysMax: 9 },
  { originCountry: 'China', destinationCountry: 'Argentina', weightFrom: 5, weightTo: 20, estimatedCostUsd: 95, estimatedDaysMin: 5, estimatedDaysMax: 9 },
  { originCountry: '*', destinationCountry: '*', weightFrom: 0, weightTo: 50, estimatedCostUsd: 150, estimatedDaysMin: 6, estimatedDaysMax: 12 },
];

const AIR_RATES: AirRateBracket[] = [
  { origin: 'China', destination: 'Argentina', weightFrom: 0, weightTo: 1000, ratePerKg: 4.85, fuelSurcharge: 110, estimatedDaysMin: 4, estimatedDaysMax: 8 },
];

function divisibleItem(overrides: Partial<ScenarioCargoItem> = {}): ScenarioCargoItem {
  return {
    id: 'item-1',
    description: 'Repuestos electrónicos',
    quantity: 10,
    unitValueFob: 100,
    weightPerUnitKg: 2,
    isDivisible: true,
    minSeparableQty: 2,
    urgency: 'media',
    partialUrgentNeeded: false,
    urgentQtySuggested: 0,
    declaredUse: 'repuesto',
    hasNcmInterventionOrRestriction: false,
    ...overrides,
  };
}

const TAX_RATES = { importDuty: 16, statisticalRate: 3, iva: 10.5, ivaAdditional: 10, ganancias: 6, iibb: 2.5 };

function baseSummary() {
  return calculateSimulationSummary({
    fobValue: 1000,
    totalUnits: 10,
    transportMode: 'ocean_lcl',
    incoterm: 'FOB',
    cargoItems: [{ id: 'item-1', name: 'Repuestos', qty: 1, lengthCm: 100, widthCm: 100, heightCm: 100, weightKg: 20 }],
    containers: { cnt20: 0, cnt40: 0, cnt40hc: 0 },
    freightRates: { mainFreightRate: 85, bafFsc: 75 },
    insurancePercent: 0.35,
    originLocalCharges: 120,
    destinationLocalCharges: 180,
    customsBrokerFee: 250,
    internalFreight: 0,
    otherDefinitiveCosts: 0,
    taxRates: TAX_RATES,
  });
}

describe('splitCargoForCourier', () => {
  it('splits a divisible item respecting minSeparableQty and package weight caps', () => {
    const result = splitCargoForCourier([divisibleItem()], RULES);
    expect(result.splitItems).toHaveLength(1);
    expect(result.splitItems[0].quantity).toBe(2); // minSeparableQty=2, weight 2*2=4kg well under 50kg cap
    expect(result.remainderItems[0].quantity).toBe(8);
  });

  it('leaves non-divisible items entirely in the remainder', () => {
    const result = splitCargoForCourier([divisibleItem({ isDivisible: false })], RULES);
    expect(result.splitItems).toHaveLength(0);
    expect(result.remainderItems[0].quantity).toBe(10);
  });

  it('flags items with missing weight/value data as insufficient, without fabricating a split', () => {
    const result = splitCargoForCourier([divisibleItem({ weightPerUnitKg: 0 })], RULES);
    expect(result.splitItems).toHaveLength(0);
    expect(result.insufficientDataItemIds).toEqual(['item-1']);
  });

  it('clips quantity down to stay within the courier FOB budget', () => {
    const result = splitCargoForCourier(
      [divisibleItem({ unitValueFob: 2000, minSeparableQty: 3, weightPerUnitKg: 1 })],
      RULES
    );
    // 3 units * 2000 = 6000 > 3000 budget -> clipped to 1 unit (floor(3000/2000))
    expect(result.splitItems[0].quantity).toBe(1);
  });

  it('caps quantity by courierMaxWeightPerPackageKg', () => {
    const result = splitCargoForCourier(
      [divisibleItem({ minSeparableQty: 10, weightPerUnitKg: 10, quantity: 10 })],
      RULES
    );
    // floor(50/10)=5 by weight, minSeparableQty=10, but courierMaxUnitsSameSpecies=3 is the tightest cap
    expect(result.splitItems[0].quantity).toBe(3);
  });
});

describe('splitCargoForAir', () => {
  it('splits only items flagged partialUrgentNeeded, by urgentQtySuggested', () => {
    const result = splitCargoForAir([divisibleItem({ partialUrgentNeeded: true, urgentQtySuggested: 3 })]);
    expect(result.splitItems[0].quantity).toBe(3);
    expect(result.remainderItems[0].quantity).toBe(7);
  });

  it('splits the entire cargo when fullCargo is set', () => {
    const result = splitCargoForAir([divisibleItem({ partialUrgentNeeded: false })], { fullCargo: true });
    expect(result.splitItems[0].quantity).toBe(10);
    expect(result.remainderItems).toHaveLength(0);
  });

  it('leaves non-urgent items in the remainder', () => {
    const result = splitCargoForAir([divisibleItem({ partialUrgentNeeded: false })]);
    expect(result.splitItems).toHaveLength(0);
  });
});

describe('checkCourierEligibility', () => {
  it('is eligible when a split satisfies every rule', () => {
    const split = splitCargoForCourier([divisibleItem()], RULES);
    const result = checkCourierEligibility({ split, rules: RULES });
    expect(result.status).toBe('courier_eligible');
    expect(result.reasons).toEqual([]);
  });

  it('is not eligible when declared use is commercial', () => {
    const split = splitCargoForCourier([divisibleItem({ declaredUse: 'comercial' })], RULES);
    const result = checkCourierEligibility({ split, rules: RULES });
    expect(result.status).toBe('courier_not_eligible');
    expect(result.reasons).toContain('declared_commercial_use');
  });

  it('requires PJM review when the NCM has an intervention/restriction', () => {
    const split = splitCargoForCourier([divisibleItem({ hasNcmInterventionOrRestriction: true })], RULES);
    const result = checkCourierEligibility({ split, rules: RULES });
    expect(result.status).toBe('courier_requires_pjm_review');
    expect(result.reasons).toContain('ncm_intervention_or_restriction');
  });

  it('is not eligible when nothing could be split (not divisible)', () => {
    const split = splitCargoForCourier([divisibleItem({ isDivisible: false })], RULES);
    const result = checkCourierEligibility({ split, rules: RULES });
    expect(result.status).toBe('courier_not_eligible');
    expect(result.reasons).toContain('cargo_not_divisible');
  });

  it('is not eligible with insufficient_information when data is missing', () => {
    const split = splitCargoForCourier([divisibleItem({ weightPerUnitKg: 0 })], RULES);
    const result = checkCourierEligibility({ split, rules: RULES });
    expect(result.status).toBe('courier_not_eligible');
    expect(result.reasons).toContain('insufficient_information');
  });

  it('flags exceeds_max_quantity_per_species when the split quantity is above the rule (bypassing the split cap)', () => {
    const split = splitCargoForCourier([divisibleItem({ minSeparableQty: 2 })], RULES);
    const tightRules: ShippingScenarioRules = { ...RULES, courierMaxUnitsSameSpecies: 1 };
    const result = checkCourierEligibility({ split, rules: tightRules });
    expect(result.reasons).toContain('exceeds_max_quantity_per_species');
  });
});

describe('calculateMaritimeOnlyScenario / calculateMaritimePlusCourierScenario', () => {
  it('produces a courier scenario cheaper than the base when only a small, exempt slice is split off', () => {
    const summary = baseSummary();
    const base = calculateMaritimeOnlyScenario({ base: summary, totalFobValue: 1000, totalUnits: 10, transportMode: 'ocean_lcl' });
    const result = calculateMaritimePlusCourierScenario({
      items: [divisibleItem({ quantity: 10, unitValueFob: 100, minSeparableQty: 2, weightPerUnitKg: 1 })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      rules: RULES,
      courierRates: COURIER_RATES,
      originCountry: 'China',
      destinationCountry: 'Argentina',
    });
    expect(result).not.toBeNull();
    expect(result!.eligibility.status).toBe('courier_eligible');
    // 2 units * 100 = 200 FOB, under the 400 franchise -> no courier duty/stat rate
    expect(result!.scenario.customsDuty).toBeLessThan(base.customsDuty);
    expect(result!.scenario.cashRequired).toBeGreaterThan(0);
  });

  it('returns null when nothing is divisible (no false-savings scenario is fabricated)', () => {
    const summary = baseSummary();
    const result = calculateMaritimePlusCourierScenario({
      items: [divisibleItem({ isDivisible: false })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      rules: RULES,
      courierRates: COURIER_RATES,
      originCountry: 'China',
      destinationCountry: 'Argentina',
    });
    expect(result).toBeNull();
  });
});

describe('calculateMaritimePlusAirScenario', () => {
  it('applies the full general tax regime (no franchise) on the air leg', () => {
    const summary = baseSummary();
    const result = calculateMaritimePlusAirScenario({
      items: [divisibleItem({ partialUrgentNeeded: true, urgentQtySuggested: 2, unitValueFob: 100, weightPerUnitKg: 1 })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      insurancePercent: 0.35,
      airRates: AIR_RATES,
      origin: 'China',
      destination: 'Argentina',
    });
    expect(result).not.toBeNull();
    // 2 units * 100 = 200 FOB on air leg; duty applies on the full CIF, no exemption
    expect(result!.scenario.customsDuty).toBeGreaterThan(0);
  });

  it('returns null when nothing is flagged urgent and fullCargo is not set', () => {
    const summary = baseSummary();
    const result = calculateMaritimePlusAirScenario({
      items: [divisibleItem({ partialUrgentNeeded: false })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      insurancePercent: 0.35,
      airRates: AIR_RATES,
      origin: 'China',
      destination: 'Argentina',
    });
    expect(result).toBeNull();
  });
});

describe('compareScenarios / rankScenariosByCost / rankScenariosBySpeed', () => {
  const summary = baseSummary();
  const base = calculateMaritimeOnlyScenario({ base: summary, totalFobValue: 1000, totalUnits: 10, transportMode: 'ocean_lcl' });

  it('computes positive diff when the alternative costs more', () => {
    const alt = { ...base, cashRequired: base.cashRequired + 100, customsDuty: base.customsDuty + 10, statisticalRate: base.statisticalRate, freight: base.freight, insurance: base.insurance, localCosts: base.localCosts, estimatedDaysMin: base.estimatedDaysMin - 5, estimatedDaysMax: base.estimatedDaysMax - 5 };
    const comparison = compareScenarios(base, alt);
    expect(comparison.diffCashRequired).toBe(100);
    expect(comparison.diffDaysMax).toBe(-5);
  });

  it('ranks scenarios ascending by cost', () => {
    const cheap = { cashRequired: 100 };
    const expensive = { cashRequired: 500 };
    expect(rankScenariosByCost([expensive, cheap])).toEqual([cheap, expensive]);
  });

  it('ranks scenarios ascending by speed (estimatedDaysMax, tie-break min)', () => {
    const slow = { estimatedDaysMax: 40, estimatedDaysMin: 30 };
    const fast = { estimatedDaysMax: 10, estimatedDaysMin: 5 };
    expect(rankScenariosBySpeed([slow, fast])).toEqual([fast, slow]);
  });
});

describe('generateScenarioWarnings', () => {
  it('always includes the non-guaranteed / PJM-validation disclaimer', () => {
    const warnings = generateScenarioWarnings({ scenarioKey: 'maritime_only' });
    expect(warnings[0]).toMatch(/no constituye cotización formal ni ahorro garantizado/);
  });

  it('adds the "not suggested" message for ineligible courier scenarios', () => {
    const warnings = generateScenarioWarnings({
      scenarioKey: 'maritime_courier',
      eligibility: { status: 'courier_not_eligible', reasons: ['exceeds_max_value'] },
    });
    expect(warnings.some((w) => w.includes('Courier no sugerido'))).toBe(true);
  });

  it('never affirms the savings as guaranteed (only ever negates it)', () => {
    const warnings = generateScenarioWarnings({
      scenarioKey: 'maritime_courier',
      eligibility: { status: 'courier_eligible', reasons: [] },
    });
    expect(warnings.join(' ')).not.toMatch(/es un ahorro garantizado|garantizamos|ahorro seguro/i);
  });
});

describe('isAirOnlySensible', () => {
  it('is sensible when urgency is high and weight is reasonable', () => {
    expect(isAirOnlySensible({ items: [divisibleItem({ urgency: 'alta' })], totalWeightKg: 100 })).toBe(true);
  });

  it('is not sensible for low urgency and no explicit request', () => {
    expect(isAirOnlySensible({ items: [divisibleItem({ urgency: 'baja' })], totalWeightKg: 100 })).toBe(false);
  });

  it('is sensible when explicitly requested regardless of urgency/weight', () => {
    expect(isAirOnlySensible({ items: [divisibleItem({ urgency: 'baja' })], totalWeightKg: 5000, userRequested: true })).toBe(true);
  });

  it('is not sensible when weight is unreasonably high even with high urgency', () => {
    expect(isAirOnlySensible({ items: [divisibleItem({ urgency: 'alta' })], totalWeightKg: 5000 })).toBe(false);
  });
});

describe('generateShipmentScenarios (orchestrator)', () => {
  it('always includes the maritime-only baseline', () => {
    const summary = baseSummary();
    const scenarios = generateShipmentScenarios({
      items: [divisibleItem({ isDivisible: false, partialUrgentNeeded: false })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      insurancePercent: 0.35,
      rules: RULES,
      courierRates: COURIER_RATES,
      airRates: AIR_RATES,
      originCountry: 'China',
      destinationCountry: 'Argentina',
    });
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].scenarioKey).toBe('maritime_only');
  });

  it('adds a courier scenario when cargo is divisible with complete data', () => {
    const summary = baseSummary();
    const scenarios = generateShipmentScenarios({
      items: [divisibleItem()],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      insurancePercent: 0.35,
      rules: RULES,
      courierRates: COURIER_RATES,
      airRates: AIR_RATES,
      originCountry: 'China',
      destinationCountry: 'Argentina',
    });
    expect(scenarios.some((s) => s.scenarioKey === 'maritime_courier')).toBe(true);
  });

  it('adds an air-only scenario only when urgency/weight make it sensible', () => {
    const summary = baseSummary();
    const scenarios = generateShipmentScenarios({
      items: [divisibleItem({ partialUrgentNeeded: true, urgentQtySuggested: 2, urgency: 'alta' })],
      base: summary,
      totalFobValue: 1000,
      totalUnits: 10,
      transportMode: 'ocean_lcl',
      taxRates: TAX_RATES,
      insurancePercent: 0.35,
      rules: RULES,
      courierRates: COURIER_RATES,
      airRates: AIR_RATES,
      originCountry: 'China',
      destinationCountry: 'Argentina',
    });
    expect(scenarios.some((s) => s.scenarioKey === 'air_only')).toBe(true);
  });
});
