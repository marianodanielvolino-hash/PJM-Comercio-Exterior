'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { recordDocumentUpload } from '@/app/actions/documents';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/types/documents';
import { Button } from '@/components/ui/Button';
import { Field, inputClass, selectClass } from '@/components/ui/Field';

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
];

export function DocumentUploadForm({
  simulationId,
  replacesDocumentId,
  onDone,
}: {
  simulationId: string;
  replacesDocumentId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>('invoice');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Elegí un archivo.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('El archivo supera el tamaño máximo permitido (15MB).');
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Tipo de archivo no permitido. Usá PDF, JPG, PNG, DOC o XLS.');
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const path = `${simulationId}/${documentType}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('simulation-documents').upload(path, file);
      if (uploadError) {
        setError('No pudimos subir el archivo. Intentá nuevamente.');
        return;
      }

      const res = await recordDocumentUpload({
        simulationId,
        documentType,
        fileUrl: path,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        replacesDocumentId,
      });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
      {!replacesDocumentId && (
        <Field label="Tipo de documento" htmlFor="document-type">
          <select id="document-type" className={selectClass} value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Archivo (PDF, JPG, PNG, DOC, XLS — máx. 15MB)" htmlFor="document-file">
        <input
          id="document-file"
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          className={
            inputClass +
            ' py-1.5 text-slate-500 file:mr-3 file:h-full file:-my-1.5 file:-ml-3 file:px-3 file:rounded-l-lg file:border-0 file:border-r file:border-slate-300 file:bg-slate-100 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer cursor-pointer'
          }
        />
      </Field>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      <Button type="submit" variant="secondary" disabled={isPending}>
        <UploadCloud className="w-4 h-4" />
        {isPending ? 'Subiendo…' : replacesDocumentId ? 'Subir reemplazo' : 'Subir documento'}
      </Button>
    </form>
  );
}
