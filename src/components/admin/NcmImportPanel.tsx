'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { importNcmCatalogFile, importTaxParametersFile, importInterventionRulesFile } from '@/app/actions/ncm';
import { Button } from '@/components/ui/Button';
import { Field, inputClass } from '@/components/ui/Field';
import type { ImportJobType } from '@/types/database';

const IMPORT_FN: Record<ImportJobType, (formData: FormData) => Promise<unknown>> = {
  ncm_catalog: importNcmCatalogFile,
  tax_parameters: importTaxParametersFile,
  intervention_rules: importInterventionRulesFile,
};

const COLUMNS: Record<ImportJobType, string> = {
  ncm_catalog: 'code, description, section, chapter, heading, subheading, aec, export_rebate, source, valid_from, valid_to',
  tax_parameters: 'ncm_code, import_duty, statistical_rate, iva, iva_additional, ganancias, iibb, other_tax, source, valid_from, valid_to',
  intervention_rules: 'ncm_code, chapter, intervention_type, description, severity, source, valid_from, valid_to',
};

interface ImportSummary {
  jobId: string;
  versionId: string | null;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  status: string;
  errorReport: { row: number; message: string }[];
}

export function NcmImportPanel({ jobType, title }: { jobType: ImportJobType; title: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportSummary | { error: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = (await IMPORT_FN[jobType](formData)) as ImportSummary | { error: string };
      setResult(res);
      if (!('error' in res)) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-sm font-bold text-slate-900 uppercase mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-4">
        Archivo CSV con columnas: <code className="bg-slate-100 px-1 rounded">{COLUMNS[jobType]}</code>. Cada
        importación crea una versión nueva en estado &ldquo;draft&rdquo; que no afecta el cálculo hasta que la
        actives.
      </p>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nombre de la versión (opcional)" htmlFor={`versionName-${jobType}`}>
          <input id={`versionName-${jobType}`} name="versionName" className={inputClass} placeholder="Ej: Arancel ARCA agosto 2026" />
        </Field>
        <Field label="Archivo CSV" htmlFor={`file-${jobType}`}>
          <input
            id={`file-${jobType}`}
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className={
              inputClass +
              ' py-1.5 text-slate-500 file:mr-3 file:h-full file:-my-1.5 file:-ml-3 file:px-3 file:rounded-l-lg file:border-0 file:border-r file:border-slate-300 file:bg-slate-100 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer cursor-pointer'
            }
          />
        </Field>
        <Button type="submit" disabled={isPending} variant="secondary">
          <UploadCloud className="w-4 h-4" />
          {isPending ? 'Importando…' : 'Importar archivo'}
        </Button>
      </form>

      {result && 'error' in result && <p className="mt-4 text-sm text-rose-600 font-medium">{result.error}</p>}

      {result && !('error' in result) && (
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <p className="font-bold text-slate-700 mb-1">
            {result.status === 'completed' ? 'Importación completa' : result.status === 'completed_with_errors' ? 'Importación con observaciones' : 'Importación fallida'}
          </p>
          <p className="text-slate-500">
            {result.processedRows} de {result.totalRows} filas procesadas · {result.errorRows} con error/observación.
          </p>
          {result.errorReport.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {result.errorReport.map((e, i) => (
                <li key={i} className="text-rose-600">
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
