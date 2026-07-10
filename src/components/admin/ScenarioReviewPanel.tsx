'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  validateAlternativeScenario,
  rejectAlternativeScenario,
  adjustScenarioCosts,
  convertScenarioToQuoteBase,
} from '@/app/actions/scenarios';
import { Button } from '@/components/ui/Button';
import { inputClass, textareaClass } from '@/components/ui/Field';
import { formatMoney } from '@/lib/formatMoney';
import { ScenarioRecommendationBadge } from '@/components/scenarios/ScenarioRecommendationBadge';
import {
  SCENARIO_KEY_LABELS,
  COURIER_ELIGIBILITY_LABELS,
  ALTERNATIVE_SCENARIO_STATUS_LABELS,
  type ScenarioKey,
  type CourierEligibility,
  type AlternativeScenarioStatus,
  type ScenarioRecommendation,
} from '@/types/scenarios';
import type { SimulationAlternativeScenarioRow } from '@/types/database';

export function ScenarioReviewPanel({
  scenarios,
  simulationId,
  requestId,
}: {
  scenarios: SimulationAlternativeScenarioRow[];
  simulationId: string;
  requestId: string | null;
}) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-slate-400">Todavía no se generaron escenarios alternativos para esta simulación.</p>;
  }

  return (
    <div className="space-y-4">
      {scenarios.map((scenario) => (
        <ScenarioReviewCard key={scenario.id} scenario={scenario} simulationId={simulationId} requestId={requestId} />
      ))}
    </div>
  );
}

function ScenarioReviewCard({
  scenario,
  simulationId,
  requestId,
}: {
  scenario: SimulationAlternativeScenarioRow;
  simulationId: string;
  requestId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [adjust, setAdjust] = useState({
    freight: String(scenario.freight),
    customsDuty: String(scenario.customs_duty),
    statisticalRate: String(scenario.statistical_rate),
    estimatedDaysMin: String(scenario.estimated_days_min),
    estimatedDaysMax: String(scenario.estimated_days_max),
  });

  const isBase = scenario.scenario_key === 'maritime_only';
  const costBreakdown = Array.isArray(scenario.cost_breakdown) ? (scenario.cost_breakdown as { category: string; label: string; amountUsd: number }[]) : [];
  const assumptions = scenario.assumptions && typeof scenario.assumptions === 'object' && 'notes' in scenario.assumptions ? ((scenario.assumptions as { notes: string[] }).notes ?? []) : [];

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setComment('');
      router.refresh();
    });
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{SCENARIO_KEY_LABELS[scenario.scenario_key as ScenarioKey]}</p>
          <p className="text-[11px] text-slate-500">{ALTERNATIVE_SCENARIO_STATUS_LABELS[scenario.status as AlternativeScenarioStatus]}</p>
        </div>
        <ScenarioRecommendationBadge recommendation={scenario.recommendation as ScenarioRecommendation} />
      </div>

      {scenario.scenario_key === 'maritime_courier' && scenario.eligibility && (
        <p className="text-xs font-semibold text-slate-600 mb-2">
          Elegibilidad: {COURIER_ELIGIBILITY_LABELS[scenario.eligibility as CourierEligibility]}
          {scenario.eligibility_reasons.length > 0 && ` — ${scenario.eligibility_reasons.join(', ')}`}
        </p>
      )}

      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-slate-100">
            {costBreakdown.map((c, i) => (
              <tr key={i}>
                <td className="py-1 pr-3 text-slate-500">{c.label}</td>
                <td className="py-1 text-right font-semibold text-slate-700">{formatMoney(c.amountUsd, scenario.currency)}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1 pr-3 font-bold text-slate-800">Caja necesaria</td>
              <td className="py-1 text-right font-bold text-slate-900">{formatMoney(scenario.cash_required, scenario.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {assumptions.length > 0 && (
        <ul className="text-[11px] text-slate-500 space-y-0.5 mb-3">
          {assumptions.map((a, i) => (
            <li key={i}>• {a}</li>
          ))}
        </ul>
      )}

      {!isBase && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            <input type="number" className={inputClass} placeholder="Flete" value={adjust.freight} onChange={(e) => setAdjust({ ...adjust, freight: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Derecho imp." value={adjust.customsDuty} onChange={(e) => setAdjust({ ...adjust, customsDuty: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Tasa estad." value={adjust.statisticalRate} onChange={(e) => setAdjust({ ...adjust, statisticalRate: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Días mín." value={adjust.estimatedDaysMin} onChange={(e) => setAdjust({ ...adjust, estimatedDaysMin: e.target.value })} />
            <input type="number" className={inputClass} placeholder="Días máx." value={adjust.estimatedDaysMax} onChange={(e) => setAdjust({ ...adjust, estimatedDaysMax: e.target.value })} />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            className="text-xs px-3 py-1.5 mb-3"
            onClick={() =>
              run(() =>
                adjustScenarioCosts(scenario.id, simulationId, {
                  freight: Number(adjust.freight),
                  customsDuty: Number(adjust.customsDuty),
                  statisticalRate: Number(adjust.statisticalRate),
                  estimatedDaysMin: Number(adjust.estimatedDaysMin),
                  estimatedDaysMax: Number(adjust.estimatedDaysMax),
                })
              )
            }
          >
            Guardar ajustes de costos/plazo
          </Button>

          <textarea
            rows={2}
            className={textareaClass + ' mb-2'}
            placeholder="Comentario técnico (obligatorio para validar o rechazar)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="text-xs text-rose-600 font-medium mb-2">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={isPending} className="text-xs px-3 py-1.5" onClick={() => run(() => validateAlternativeScenario(scenario.id, simulationId, comment))}>
              Validar escenario
            </Button>
            <Button type="button" variant="danger" disabled={isPending} className="text-xs px-3 py-1.5" onClick={() => run(() => rejectAlternativeScenario(scenario.id, simulationId, comment))}>
              Rechazar escenario
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              className="text-xs px-3 py-1.5"
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const res = await convertScenarioToQuoteBase(scenario.id, simulationId, requestId);
                  if ('error' in res) {
                    setError(res.error);
                    return;
                  }
                  router.refresh();
                })
              }
            >
              Convertir en base de cotización formal
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
