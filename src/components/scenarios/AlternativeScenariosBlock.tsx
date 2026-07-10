'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markScenarioPreferred, requestPjmScenarioReview } from '@/app/actions/scenarios';
import { Button } from '@/components/ui/Button';
import { ScenarioCard } from './ScenarioCard';
import { ScenarioComparisonTable } from './ScenarioComparisonTable';
import { rankScenariosByCost, rankScenariosBySpeed } from '@/lib/calculations/shipmentScenarioOptimizer';
import { SCENARIO_REVIEW_STATUS_LABELS, type ScenarioReviewStatus } from '@/types/scenarios';
import type { SimulationAlternativeScenarioRow } from '@/types/database';

export function AlternativeScenariosBlock({
  scenarios,
  simulationId,
  scenarioReviewStatus,
}: {
  scenarios: SimulationAlternativeScenarioRow[];
  simulationId: string;
  scenarioReviewStatus: ScenarioReviewStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (scenarios.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No se generaron escenarios alternativos para esta simulación. Esto pasa cuando el transporte no es marítimo,
        o cuando ningún ítem de mercadería fue marcado como divisible o con una porción urgente en el paso
        &ldquo;Mercadería&rdquo; del wizard.
      </p>
    );
  }

  const preferredId = scenarios.find((s) => s.is_preferred)?.id ?? null;
  const cheapestId = rankScenariosByCost(scenarios.map((s) => ({ id: s.id, cashRequired: s.cash_required })))[0]?.id;
  const fastestId = rankScenariosBySpeed(scenarios.map((s) => ({ id: s.id, estimatedDaysMin: s.estimated_days_min, estimatedDaysMax: s.estimated_days_max })))[0]?.id;

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ('error' in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        Comparativo estimativo entre alternativas de envío. Ningún escenario alternativo constituye una cotización
        formal ni un ahorro garantizado: todo queda sujeto a validación de PJM y a la normativa aduanera vigente.
      </div>

      <div className="text-xs text-slate-500">
        Estado del análisis PJM: <span className="font-semibold text-slate-700">{SCENARIO_REVIEW_STATUS_LABELS[scenarioReviewStatus]}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenarios.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} isPreferred={scenario.id === preferredId}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {scenario.id === cheapestId && scenario.scenario_key !== 'maritime_only' && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Más económico</span>
              )}
              {scenario.id === fastestId && scenario.scenario_key !== 'maritime_only' && (
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">Más rápido</span>
              )}
            </div>
            {scenario.scenario_key !== 'maritime_only' && scenario.recommendation !== 'not_eligible' && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant={scenario.id === preferredId ? 'secondary' : 'ghost'}
                  disabled={isPending}
                  onClick={() => run(() => markScenarioPreferred(scenario.id, simulationId))}
                  className="text-xs px-3 py-1.5"
                >
                  {scenario.id === preferredId ? 'Preferido' : 'Marcar como preferido'}
                </Button>
                <Button
                  type="button"
                  disabled={isPending || scenarioReviewStatus !== 'none'}
                  onClick={() => run(() => requestPjmScenarioReview(scenario.id, simulationId))}
                  className="text-xs px-3 py-1.5"
                >
                  Solicitar análisis PJM de escenario alternativo
                </Button>
              </div>
            )}
          </ScenarioCard>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

      <div>
        <h3 className="text-xs font-bold text-slate-900 uppercase mb-3">Comparativo detallado</h3>
        <ScenarioComparisonTable scenarios={scenarios} />
      </div>
    </div>
  );
}
