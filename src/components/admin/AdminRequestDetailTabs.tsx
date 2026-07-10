'use client';

import { useState, type ReactNode } from 'react';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'escenarios', label: 'Escenarios alternativos' },
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'comentarios', label: 'Comentarios' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function AdminRequestDetailTabs({
  resumen,
  documentos,
  checklist,
  escenarios,
  cotizacion,
  comentarios,
  documentosCount,
  escenariosCount,
}: {
  resumen: ReactNode;
  documentos: ReactNode;
  checklist: ReactNode;
  escenarios: ReactNode;
  cotizacion: ReactNode;
  comentarios: ReactNode;
  documentosCount?: number;
  escenariosCount?: number;
}) {
  const [active, setActive] = useState<TabKey>('resumen');
  const content: Record<TabKey, ReactNode> = { resumen, documentos, checklist, escenarios, cotizacion, comentarios };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              active === tab.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
            }`}
          >
            {tab.label}
            {tab.key === 'documentos' && !!documentosCount && (
              <span className="ml-1.5 bg-slate-300 text-slate-700 rounded-full px-1.5 py-0.5 text-[10px]">{documentosCount}</span>
            )}
            {tab.key === 'escenarios' && !!escenariosCount && (
              <span className="ml-1.5 bg-slate-300 text-slate-700 rounded-full px-1.5 py-0.5 text-[10px]">{escenariosCount}</span>
            )}
          </button>
        ))}
      </div>
      <div>{content[active]}</div>
    </div>
  );
}
