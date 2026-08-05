'use client';

import type { ChecklistItemState } from '@/types/simulation';
import { Card } from '@/components/ui/Card';

export function ChecklistStep({
  value,
  onChange,
}: {
  value: ChecklistItemState[];
  onChange: (next: ChecklistItemState[]) => void;
}) {
  const checkedCount = value.filter((i) => i.checked).length;
  const ratio = value.length > 0 ? checkedCount / value.length : 0;
  const tone = ratio === 1 ? 'verde' : ratio === 0 ? 'rojo' : 'amarillo';
  const toneClasses = {
    verde: 'bg-emerald-500',
    amarillo: 'bg-amber-500',
    rojo: 'bg-rose-500',
  } as const;
  const toneLabel = {
    verde: 'Listo para revisión PJM',
    amarillo: 'Falta documentación',
    rojo: 'No embarcar todavía',
  } as const;

  function toggle(key: string) {
    onChange(value.map((item) => (item.key === key ? { ...item, checked: !item.checked } : item)));
  }

  return (
    <Card step={6} title="Autoevaluación documental">
      <div className="flex items-center gap-2 mb-5">
        <span className={`w-3 h-3 rounded-full ${toneClasses[tone]}`} />
        <span className="text-xs font-bold text-slate-600">
          {checkedCount}/{value.length} — {toneLabel[tone]}
        </span>
      </div>
      <div className="space-y-2">
        {value.map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
          >
            <input type="checkbox" checked={item.checked} onChange={() => toggle(item.key)} />
            {item.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Esta es una autoevaluación orientativa, distinta del checklist operativo que PJM va a generar y revisar
        una vez que solicites la cotización formal.
      </p>
    </Card>
  );
}
