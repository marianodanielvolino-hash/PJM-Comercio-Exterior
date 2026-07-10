import { formatMoney } from '@/lib/formatMoney';
import { ScenarioRecommendationBadge } from './ScenarioRecommendationBadge';
import { SCENARIO_KEY_LABELS, type ScenarioKey, type ScenarioRecommendation } from '@/types/scenarios';
import type { SimulationAlternativeScenarioRow } from '@/types/database';

export function ScenarioComparisonTable({ scenarios }: { scenarios: SimulationAlternativeScenarioRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
          <tr>
            <th className="py-2 pr-3">Escenario</th>
            <th className="py-2 pr-3 text-right">Plazo estimado</th>
            <th className="py-2 pr-3 text-right">FOB parcial</th>
            <th className="py-2 pr-3 text-right">Flete</th>
            <th className="py-2 pr-3 text-right">Seguro</th>
            <th className="py-2 pr-3 text-right">Tributos definitivos</th>
            <th className="py-2 pr-3 text-right">Créditos fiscales</th>
            <th className="py-2 pr-3 text-right">Gastos locales</th>
            <th className="py-2 pr-3 text-right">Caja necesaria</th>
            <th className="py-2 pr-3 text-right">Diferencia vs. base</th>
            <th className="py-2 pr-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {scenarios.map((s) => (
            <tr key={s.id}>
              <td className="py-2 pr-3 font-semibold text-slate-700">{SCENARIO_KEY_LABELS[s.scenario_key as ScenarioKey]}</td>
              <td className="py-2 pr-3 text-right">
                {s.estimated_days_min}–{s.estimated_days_max} d
              </td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.fob_partial, s.currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.freight, s.currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.insurance, s.currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.customs_duty + s.statistical_rate, s.currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.fiscal_credits, s.currency)}</td>
              <td className="py-2 pr-3 text-right">{formatMoney(s.local_costs, s.currency)}</td>
              <td className="py-2 pr-3 text-right font-bold">{formatMoney(s.cash_required, s.currency)}</td>
              <td className={`py-2 pr-3 text-right font-semibold ${s.diff_cash_required > 0 ? 'text-rose-600' : s.diff_cash_required < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                {s.scenario_key === 'maritime_only' ? '—' : `${s.diff_cash_required > 0 ? '+' : ''}${formatMoney(s.diff_cash_required, s.currency)}`}
              </td>
              <td className="py-2 pr-3">
                <ScenarioRecommendationBadge recommendation={s.recommendation as ScenarioRecommendation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
