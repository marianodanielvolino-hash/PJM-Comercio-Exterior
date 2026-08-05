'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { emptySimulationDraft } from '@/lib/emptySimulationDraft';
import { calculateSimulationSummary } from '@/lib/calculations/importCostCalculator';
import { merchandiseToCargoItem, totalFobValue, totalUnits } from '@/lib/adapters';
import { saveSimulation } from '@/app/actions/simulations';
import { OperationStep } from '@/components/simulation/OperationStep';
import { MerchandiseStep } from '@/components/simulation/MerchandiseStep';
import { NCMStep, type NCMStepValue } from '@/components/simulation/NCMStep';
import { InterventionsStep } from '@/components/simulation/InterventionsStep';
import { LogisticsStep, type LogisticsStepValue } from '@/components/simulation/LogisticsStep';
import { TaxesPreviewStep } from '@/components/simulation/TaxesPreviewStep';
import { ChecklistStep } from '@/components/simulation/ChecklistStep';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';

const STEP_LABELS = [
  'Operación',
  'Mercadería',
  'NCM',
  'Intervenciones',
  'Logística',
  'Tributos',
  'Autoevaluación',
];

export function SimulationWizard() {
  const router = useRouter();
  const [draft, setDraft] = useState(emptySimulationDraft());
  const [name, setName] = useState('Nueva simulación');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [ncmMeta, setNcmMeta] = useState<{ aec: number | null; catalogSource: string | null; validFrom: string | null; validTo: string | null }>({
    aec: null,
    catalogSource: null,
    validFrom: null,
    validTo: null,
  });

  const ncmValue: NCMStepValue = useMemo(
    () => ({
      code: draft.items[0]?.ncmCode ?? '',
      description: draft.items[0]?.ncmDescription ?? '',
      status: draft.items[0]?.ncmStatus ?? 'no_informado',
      positionId: draft.items[0]?.ncmPositionId ?? null,
      source: draft.items[0]?.ncmSource ?? 'manual',
      taxParameterId: draft.items[0]?.taxParameterId ?? null,
      aec: ncmMeta.aec,
      catalogSource: ncmMeta.catalogSource,
      validFrom: ncmMeta.validFrom,
      validTo: ncmMeta.validTo,
      taxRates: draft.taxRates,
    }),
    [draft.items, draft.taxRates, ncmMeta]
  );

  const logisticsValue: LogisticsStepValue = draft.logistics;

  const fobValue = totalFobValue(draft.items);
  const units = totalUnits(draft.items);
  const cargoItems = draft.items.map(merchandiseToCargoItem);

  const summary = useMemo(
    () =>
      calculateSimulationSummary({
        fobValue,
        totalUnits: units,
        transportMode: draft.operation.transportMode,
        incoterm: draft.operation.incoterm,
        cargoItems,
        containers: draft.containers,
        freightRates: { mainFreightRate: draft.logistics.mainFreightRate, bafFsc: draft.logistics.bafFsc },
        insurancePercent: draft.logistics.insurancePercent,
        originLocalCharges: draft.logistics.originLocalCharges,
        destinationLocalCharges: draft.logistics.destinationLocalCharges,
        customsBrokerFee: draft.logistics.customsBrokerFee,
        internalFreight: draft.logistics.internalFreight,
        otherDefinitiveCosts: draft.logistics.otherDefinitiveCosts,
        taxRates: draft.taxRates,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fobValue, units, draft]
  );

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveSimulation({ name, draft, asCompleted: true });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      router.push(`/simulaciones/${result.id}`);
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 w-full">
      <div className="mb-6">
        <Field label="Nombre de la simulación" htmlFor="sim-name">
          <input id="sim-name" className={inputClass + ' max-w-md'} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              i === step
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
            }`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {step === 0 && (
          <OperationStep value={draft.operation} onChange={(operation) => setDraft({ ...draft, operation })} />
        )}
        {step === 1 && <MerchandiseStep items={draft.items} onChange={(items) => setDraft({ ...draft, items })} />}
        {step === 2 && (
          <NCMStep
            value={ncmValue}
            onChange={(next) => {
              setDraft({ ...draft, taxRates: next.taxRates });
              setNcmMeta({ aec: next.aec, catalogSource: next.catalogSource, validFrom: next.validFrom, validTo: next.validTo });
            }}
            items={draft.items}
            onItemsChange={(items) => setDraft({ ...draft, items })}
            onInterventionMatch={(intervention) => setDraft({ ...draft, intervention })}
          />
        )}
        {step === 3 && (
          <InterventionsStep value={draft.intervention} onChange={(intervention) => setDraft({ ...draft, intervention })} />
        )}
        {step === 4 && (
          <LogisticsStep
            transportMode={draft.operation.transportMode}
            originPort={draft.operation.originPort}
            destinationPort={draft.operation.destinationPort}
            items={draft.items}
            containers={draft.containers}
            onContainersChange={(containers) => setDraft({ ...draft, containers })}
            value={logisticsValue}
            onChange={(logistics) => setDraft({ ...draft, logistics })}
          />
        )}
        {step === 5 && <TaxesPreviewStep summary={summary} fobValue={fobValue} currency={draft.operation.currency} />}
        {step === 6 && (
          <ChecklistStep value={draft.checklist} onChange={(checklist) => setDraft({ ...draft, checklist })} />
        )}
      </div>

      {error && <p className="mt-4 text-sm text-rose-600 font-medium">{error}</p>}

      <div className="flex justify-between mt-8">
        <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Anterior
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Siguiente
          </Button>
        ) : (
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Calculando…' : 'Calcular y guardar simulación'}
          </Button>
        )}
      </div>
    </div>
  );
}
