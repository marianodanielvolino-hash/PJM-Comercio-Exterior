import { formatMoney } from '@/lib/formatMoney';
import { ScenarioRecommendationBadge } from './ScenarioRecommendationBadge';
import { COURIER_ELIGIBILITY_LABELS, SCENARIO_KEY_LABELS, type CourierEligibility, type ScenarioKey, type ScenarioRecommendation } from '@/types/scenarios';
import type { SimulationAlternativeScenarioRow } from '@/types/database';

export function ScenarioCard({ scenario, isPreferred, children }: { scenario: SimulationAlternativeScenarioRow; isPreferred: boolean; children?: React.ReactNode }) {
  const isBase = scenario.scenario_key === 'maritime_only';
  const diffSign = scenario.diff_cash_required > 0 ? '+' : '';

  return (
    <div className={`bg-white border rounded-2xl p-5 space-y-3 ${isPreferred ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">{SCENARIO_KEY_LABELS[scenario.scenario_key as ScenarioKey]}</p>
          {isPreferred && <span className="text-[10px] font-bold text-indigo-600 uppercase">Preferido</span>}
        </div>
        <ScenarioRecommendationBadge recommendation={scenario.recommendation as ScenarioRecommendation} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <span className="text-slate-500">Costo económico definitivo</span>
        <span className="text-right font-semibold text-slate-800">{formatMoney(scenario.definitive_cost, scenario.currency)}</span>
        <span className="text-slate-500">Créditos fiscales</span>
        <span className="text-right font-semibold text-slate-800">{formatMoney(scenario.fiscal_credits, scenario.currency)}</span>
        <span className="text-slate-500">Costo unitario</span>
        <span className="text-right font-semibold text-slate-800">{formatMoney(scenario.unit_cost, scenario.currency)}</span>
        <span className="text-slate-500">Plazo estimado</span>
        <span className="text-right font-semibold text-slate-800">
          {scenario.estimated_days_min}–{scenario.estimated_days_max} días
        </span>
      </div>

      <div className="bg-indigo-600 text-white rounded-xl p-3 flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase">Caja necesaria</span>
        <span className="text-base font-black">{formatMoney(scenario.cash_required, scenario.currency)}</span>
      </div>

      {!isBase && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">{scenario.diff_cash_required > 0 ? 'Sobrecosto estimado vs. marítimo' : 'Ahorro estimado vs. marítimo'}</span>
          <span className={`font-bold ${scenario.diff_cash_required > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {diffSign}
            {formatMoney(scenario.diff_cash_required, scenario.currency)} ({diffSign}
            {scenario.diff_cash_required_percent.toFixed(1)}%)
          </span>
        </div>
      )}

      {scenario.scenario_key === 'maritime_courier' && scenario.eligibility && (
        <p className="text-[11px] font-semibold text-slate-500">
          {COURIER_ELIGIBILITY_LABELS[scenario.eligibility as CourierEligibility]}
        </p>
      )}

      {scenario.warnings.length > 0 && (
        <ul className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1">
          {scenario.warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}

      {children}
    </div>
  );
}
