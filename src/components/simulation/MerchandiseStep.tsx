'use client';

import { Plus, Trash2, Info } from 'lucide-react';
import type { MerchandiseItem } from '@/types/simulation';
import { Card } from '@/components/ui/Card';
import { Field, inputClass, textareaClass, selectClass } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { emptyMerchandiseItem } from '@/lib/emptySimulationDraft';
import { URGENCY_LABELS, DECLARED_USE_LABELS, type Urgency, type DeclaredUse } from '@/types/scenarios';

export function MerchandiseStep({
  items,
  onChange,
}: {
  items: MerchandiseItem[];
  onChange: (next: MerchandiseItem[]) => void;
}) {
  function updateItem(id: string, patch: Partial<MerchandiseItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([...items, emptyMerchandiseItem(`item-${Date.now()}`)]);
  }

  function removeItem(id: string) {
    if (items.length <= 1) return;
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <Card step={2} title="Mercadería">
      <div className="flex items-start gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-6 text-xs text-indigo-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>La descripción técnica es clave para clasificar correctamente la posición arancelaria.</span>
      </div>

      <div className="space-y-6">
        {items.map((item, index) => (
          <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase">Ítem #{index + 1}</span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Descripción comercial" htmlFor={`desc-${item.id}`}>
                <input
                  id={`desc-${item.id}`}
                  className={inputClass}
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                />
              </Field>
              <Field label="Marca / modelo" htmlFor={`brand-${item.id}`}>
                <input
                  id={`brand-${item.id}`}
                  className={inputClass}
                  value={item.brandModel}
                  onChange={(e) => updateItem(item.id, { brandModel: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Descripción técnica" htmlFor={`tech-${item.id}`}>
                <textarea
                  id={`tech-${item.id}`}
                  rows={2}
                  className={textareaClass}
                  value={item.technicalDescription}
                  onChange={(e) => updateItem(item.id, { technicalDescription: e.target.value })}
                />
              </Field>
              <Field label="Uso previsto" htmlFor={`use-${item.id}`}>
                <textarea
                  id={`use-${item.id}`}
                  rows={2}
                  className={textareaClass}
                  value={item.intendedUse}
                  onChange={(e) => updateItem(item.id, { intendedUse: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Field label="Cantidad de unidades" htmlFor={`qty-${item.id}`}>
                <input
                  id={`qty-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.quantity}
                  onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Valor unitario (FOB)" htmlFor={`unitval-${item.id}`}>
                <input
                  id={`unitval-${item.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClass}
                  value={item.unitValue}
                  onChange={(e) => updateItem(item.id, { unitValue: Number(e.target.value) })}
                />
              </Field>
              <Field label="Valor total FOB" htmlFor={`totalval-${item.id}`}>
                <input
                  id={`totalval-${item.id}`}
                  disabled
                  className={inputClass + ' bg-slate-100 text-slate-500'}
                  value={(item.quantity * item.unitValue).toFixed(2)}
                />
              </Field>
              <Field label="País de fabricación" htmlFor={`origin-${item.id}`}>
                <input
                  id={`origin-${item.id}`}
                  className={inputClass}
                  value={item.countryOfOrigin}
                  onChange={(e) => updateItem(item.id, { countryOfOrigin: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              <Field label="Peso bruto (kg)" htmlFor={`gw-${item.id}`}>
                <input
                  id={`gw-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.grossWeightKg}
                  onChange={(e) => updateItem(item.id, { grossWeightKg: Number(e.target.value) })}
                />
              </Field>
              <Field label="Peso neto (kg)" htmlFor={`nw-${item.id}`}>
                <input
                  id={`nw-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.netWeightKg}
                  onChange={(e) => updateItem(item.id, { netWeightKg: Number(e.target.value) })}
                />
              </Field>
              <Field label="Largo (cm)" htmlFor={`l-${item.id}`}>
                <input
                  id={`l-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.lengthCm}
                  onChange={(e) => updateItem(item.id, { lengthCm: Number(e.target.value) })}
                />
              </Field>
              <Field label="Ancho (cm)" htmlFor={`w-${item.id}`}>
                <input
                  id={`w-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.widthCm}
                  onChange={(e) => updateItem(item.id, { widthCm: Number(e.target.value) })}
                />
              </Field>
              <Field label="Alto (cm)" htmlFor={`h-${item.id}`}>
                <input
                  id={`h-${item.id}`}
                  type="number"
                  min={0}
                  className={inputClass}
                  value={item.heightCm}
                  onChange={(e) => updateItem(item.id, { heightCm: Number(e.target.value) })}
                />
              </Field>
              <Field label="Cant. de bultos" htmlFor={`pkg-${item.id}`}>
                <input
                  id={`pkg-${item.id}`}
                  type="number"
                  min={1}
                  className={inputClass}
                  value={item.packages}
                  onChange={(e) => updateItem(item.id, { packages: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Tipo de embalaje" htmlFor={`pkgtype-${item.id}`}>
                <input
                  id={`pkgtype-${item.id}`}
                  className={inputClass}
                  placeholder="Ej: Pallet, caja de cartón, bolsón"
                  value={item.packagingType}
                  onChange={(e) => updateItem(item.id, { packagingType: e.target.value })}
                />
              </Field>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase block mb-3">
                Envío parcial (courier/aéreo) — opcional
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <Field label="¿Es divisible en envíos parciales?" htmlFor={`divisible-${item.id}`}>
                  <select
                    id={`divisible-${item.id}`}
                    className={selectClass}
                    value={item.isDivisible ? 'si' : 'no'}
                    onChange={(e) => updateItem(item.id, { isDivisible: e.target.value === 'si' })}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </Field>
                <Field label="Cantidad mínima separable" htmlFor={`minqty-${item.id}`}>
                  <input
                    id={`minqty-${item.id}`}
                    type="number"
                    min={0}
                    disabled={!item.isDivisible}
                    className={inputClass + (item.isDivisible ? '' : ' bg-slate-100 text-slate-400')}
                    value={item.minSeparableQty}
                    onChange={(e) => updateItem(item.id, { minSeparableQty: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Peso por unidad (kg)" htmlFor={`unitweight-${item.id}`}>
                  <input
                    id={`unitweight-${item.id}`}
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    value={item.weightPerUnitKg}
                    onChange={(e) => updateItem(item.id, { weightPerUnitKg: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Uso declarado" htmlFor={`use-declared-${item.id}`}>
                  <select
                    id={`use-declared-${item.id}`}
                    className={selectClass}
                    value={item.declaredUse}
                    onChange={(e) => updateItem(item.id, { declaredUse: e.target.value as DeclaredUse })}
                  >
                    {Object.entries(DECLARED_USE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Urgencia" htmlFor={`urgency-${item.id}`}>
                  <select
                    id={`urgency-${item.id}`}
                    className={selectClass}
                    value={item.urgency}
                    onChange={(e) => updateItem(item.id, { urgency: e.target.value as Urgency })}
                  >
                    {Object.entries(URGENCY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="¿Una parte necesita llegar antes?" htmlFor={`urgent-${item.id}`}>
                  <select
                    id={`urgent-${item.id}`}
                    className={selectClass}
                    value={item.partialUrgentNeeded ? 'si' : 'no'}
                    onChange={(e) => updateItem(item.id, { partialUrgentNeeded: e.target.value === 'si' })}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </Field>
                <Field label="Cantidad urgente sugerida" htmlFor={`urgentqty-${item.id}`}>
                  <input
                    id={`urgentqty-${item.id}`}
                    type="number"
                    min={0}
                    disabled={!item.partialUrgentNeeded}
                    className={inputClass + (item.partialUrgentNeeded ? '' : ' bg-slate-100 text-slate-400')}
                    value={item.urgentQtySuggested}
                    onChange={(e) => updateItem(item.id, { urgentQtySuggested: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Con estos datos, si elegís transporte marítimo el sistema puede sugerir escenarios alternativos
                (courier o aéreo para una porción) — siempre estimativos y sujetos a validación de PJM.
              </p>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addItem} className="mt-4">
        <Plus className="w-4 h-4" />
        Agregar ítem
      </Button>
    </Card>
  );
}
