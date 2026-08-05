import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { createDefaultChecklistForSimulation } from '@/app/actions/checklist';
import { computeChecklistStatus } from '@/lib/checklist';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/formatMoney';
import { StatusControls } from '@/components/admin/StatusControls';
import { CommentForm } from '@/components/admin/CommentForm';
import { CommentThread } from '@/components/comments/CommentThread';
import { NcmValidationCard } from '@/components/admin/NcmValidationCard';
import { RequestStatusActions } from '@/components/admin/RequestStatusActions';
import { AdminRequestDetailTabs } from '@/components/admin/AdminRequestDetailTabs';
import { AdminDocumentReviewCard } from '@/components/admin/AdminDocumentReviewCard';
import { ChecklistPanel } from '@/components/checklist/ChecklistPanel';
import { QuoteBuilder } from '@/components/quotes/QuoteBuilder';
import { QuoteSummaryCard } from '@/components/quotes/QuoteSummaryCard';
import { CreateQuoteButton } from '@/components/quotes/CreateQuoteButton';
import { ScenarioReviewPanel } from '@/components/admin/ScenarioReviewPanel';
import { NCM_STATUS_TONE } from '@/lib/constants/statusStyles';
import { NCM_STATUS_LABELS, type NCMStatus } from '@/types/ncm';
import type { SimulationStatus, SimulationDocumentStatus } from '@/types/simulation';
import type { ChecklistSemaphore, PjmRequestStatus, RequestPriority, DocumentType, DocumentStatus } from '@/types/documents';
import type {
  SimulationRow,
  SimulationItemRow,
  ProfileRow,
  CompanyRow,
  PjmRequestRow,
  CommentRow,
  DocumentRow,
  SimulationChecklistItemRow,
  FormalQuoteRow,
  FormalQuoteItemRow,
  FormalQuoteCostRow,
  SimulationAlternativeScenarioRow,
} from '@/types/database';

export default async function AdminRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();

  const { data: simulation } = await supabase.from('simulations').select('*').eq('id', id).maybeSingle<SimulationRow>();
  if (!simulation) notFound();

  const [{ data: items }, { data: profile }, { data: company }, { data: request }, { data: documents }, { data: checklistItemsData }, { data: quotes }, { data: scenarios }] = await Promise.all([
    supabase.from('simulation_items').select('*').eq('simulation_id', id).returns<SimulationItemRow[]>(),
    supabase.from('profiles').select('*').eq('id', simulation.user_id).maybeSingle<ProfileRow>(),
    simulation.company_id
      ? supabase.from('companies').select('*').eq('id', simulation.company_id).maybeSingle<CompanyRow>()
      : Promise.resolve({ data: null }),
    supabase.from('pjm_requests').select('*').eq('simulation_id', id).maybeSingle<PjmRequestRow>(),
    supabase.from('documents').select('*').eq('simulation_id', id).neq('status', 'replaced').order('uploaded_at', { ascending: false }).returns<DocumentRow[]>(),
    supabase.from('simulation_checklist_items').select('*').eq('simulation_id', id).returns<SimulationChecklistItemRow[]>(),
    supabase.from('formal_quotes').select('*').eq('simulation_id', id).order('created_at', { ascending: false }).returns<FormalQuoteRow[]>(),
    supabase.from('simulation_alternative_scenarios').select('*').eq('simulation_id', id).order('created_at', { ascending: true }).returns<SimulationAlternativeScenarioRow[]>(),
  ]);

  let checklistItems = checklistItemsData;

  // Self-heal: any simulation with a pjm_requests row went through
  // requestFormalQuote, which seeds the checklist. If it's still empty here,
  // the seed insert failed at submit time — retry it now. Idempotent and
  // safe to call speculatively (see checklist.ts).
  if (request && (!checklistItems || checklistItems.length === 0)) {
    const healed = await createDefaultChecklistForSimulation(id);
    if (healed.ok) {
      const { data: retriedItems } = await supabase
        .from('simulation_checklist_items')
        .select('*')
        .eq('simulation_id', id)
        .returns<SimulationChecklistItemRow[]>();
      checklistItems = retriedItems;
      simulation.checklist_status = computeChecklistStatus(retriedItems ?? []).semaphore;
    }
  }

  const latestQuote = quotes?.[0] ?? null;
  let quoteItems: FormalQuoteItemRow[] = [];
  let quoteCosts: FormalQuoteCostRow[] = [];
  let latestBnaRate: { rate: number; date: string } | null = null;
  if (latestQuote) {
    const [{ data: qi }, { data: qc }, { data: rate }] = await Promise.all([
      supabase.from('formal_quote_items').select('*').eq('formal_quote_id', latestQuote.id).order('sort_order').returns<FormalQuoteItemRow[]>(),
      supabase.from('formal_quote_costs').select('*').eq('formal_quote_id', latestQuote.id).order('sort_order').returns<FormalQuoteCostRow[]>(),
      supabase
        .from('exchange_rates')
        .select('sell_rate, rate_date')
        .eq('currency', latestQuote.currency)
        .order('rate_date', { ascending: false })
        .limit(1)
        .maybeSingle<{ sell_rate: number; rate_date: string }>(),
    ]);
    quoteItems = qi ?? [];
    quoteCosts = qc ?? [];
    latestBnaRate = rate ? { rate: rate.sell_rate, date: rate.rate_date } : null;
  }

  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('simulation_id', id)
    .order('created_at', { ascending: false })
    .returns<CommentRow[]>();

  let assignedToLabel: string | null = null;
  if (request?.assigned_to) {
    const { data: assignee } = await supabase.from('profiles').select('full_name').eq('id', request.assigned_to).maybeSingle();
    assignedToLabel = assignee?.full_name ?? null;
  }

  const resumen = (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-900 uppercase mb-4">Datos de la simulación</h2>
        <StatusControls
          simulationId={simulation.id}
          status={simulation.status as SimulationStatus}
          ncmStatus={simulation.ncm_status as NCMStatus}
          documentStatus={simulation.document_status as SimulationDocumentStatus}
        />
      </div>

      {request && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase mb-4">Gestión operativa de la solicitud</h2>
          <RequestStatusActions
            requestId={request.id}
            simulationId={simulation.id}
            status={request.status as PjmRequestStatus}
            priority={request.priority as RequestPriority}
            assignedToLabel={assignedToLabel}
          />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryStat label="FOB" value={formatMoney(simulation.fob_value, simulation.currency)} />
        <SummaryStat label="CIF" value={formatMoney(simulation.cif_value, simulation.currency)} />
        <SummaryStat label="Créditos fiscales" value={formatMoney(simulation.fiscal_credits, simulation.currency)} />
        <SummaryStat label="Caja necesaria" value={formatMoney(simulation.cash_required, simulation.currency)} highlight />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-slate-900 uppercase mb-4">Mercadería y validación NCM</h2>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Descripción técnica</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3 text-right">Valor total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3 font-medium text-slate-700">{item.description}</td>
                  <td className="py-2 pr-3 text-slate-500">{item.technical_description || '—'}</td>
                  <td className="py-2 pr-3 text-right">{item.quantity}</td>
                  <td className="py-2 pr-3 text-right">{formatMoney(item.total_value, simulation.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          {(items ?? []).map((item) => (
            <NcmValidationCard
              key={item.id}
              simulationId={simulation.id}
              itemId={item.id}
              description={item.description}
              ncmCode={item.ncm_code}
              ncmDescription={item.ncm_description}
              ncmStatus={item.ncm_status as NCMStatus}
              ncmSource={item.ncm_source}
            />
          ))}
          {(!items || items.length === 0) && <p className="text-xs text-slate-400">Sin ítems cargados.</p>}
        </div>
      </div>
    </>
  );

  const documentos = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
      {(documents ?? []).map((doc) => (
        <AdminDocumentReviewCard
          key={doc.id}
          documentId={doc.id}
          simulationId={simulation.id}
          documentType={doc.document_type as DocumentType}
          fileName={doc.file_name}
          filePath={doc.file_url}
          status={doc.status as DocumentStatus}
          reviewNotes={doc.review_notes}
          uploadedAt={doc.uploaded_at}
        />
      ))}
      {(!documents || documents.length === 0) && <p className="text-sm text-slate-400">El cliente todavía no subió documentos.</p>}
    </div>
  );

  const checklist = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <ChecklistPanel
        items={checklistItems ?? []}
        semaphore={simulation.checklist_status as ChecklistSemaphore}
        mode="admin"
        simulationId={simulation.id}
      />
    </div>
  );

  const cotizacion = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      {latestQuote ? (
        latestQuote.status === 'draft' || latestQuote.status === 'approved' ? (
          <QuoteBuilder quote={latestQuote} items={quoteItems} costs={quoteCosts} simulationId={simulation.id} latestBnaRate={latestBnaRate} />
        ) : (
          <QuoteSummaryCard quote={latestQuote} pdfHref={`/simulaciones/${simulation.id}/cotizacion/pdf`} />
        )
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500 mb-4">Todavía no hay una cotización formal para esta solicitud.</p>
          <CreateQuoteButton simulationId={simulation.id} requestId={request?.id ?? null} />
        </div>
      )}
    </div>
  );

  const escenarios = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <ScenarioReviewPanel scenarios={scenarios ?? []} simulationId={simulation.id} requestId={request?.id ?? null} />
    </div>
  );

  const comentarios = (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h2 className="text-sm font-bold text-slate-900 uppercase mb-4">Comentarios</h2>
      {request && <CommentForm requestId={request.id} simulationId={simulation.id} />}
      <div className="mt-5">
        <CommentThread comments={comments ?? []} />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 w-full">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-6">
        <ArrowLeft className="w-4 h-4" />
        Volver a solicitudes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{simulation.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {profile?.full_name} ({profile?.email}) · {company?.business_name || 'Sin empresa cargada'}
          </p>
        </div>
        <Badge tone={NCM_STATUS_TONE[simulation.ncm_status as NCMStatus] ?? 'slate'}>
          {NCM_STATUS_LABELS[simulation.ncm_status as NCMStatus] ?? simulation.ncm_status}
        </Badge>
      </div>

      <AdminRequestDetailTabs
        resumen={resumen}
        documentos={documentos}
        checklist={checklist}
        escenarios={escenarios}
        cotizacion={cotizacion}
        comentarios={comentarios}
        documentosCount={documents?.length}
        escenariosCount={scenarios?.length}
      />
    </div>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200'}`}>
      <span className={`text-[10px] font-bold uppercase block ${highlight ? 'text-indigo-200' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-lg font-black block mt-1 ${highlight ? 'text-white' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}
