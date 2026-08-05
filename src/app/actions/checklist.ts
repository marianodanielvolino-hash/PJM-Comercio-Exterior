'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireUser, requireAdmin } from '@/lib/dal';
import { mapDbError } from '@/lib/errorMessages';
import { logAuditEvent } from '@/lib/auditLog';
import { notifyUser } from '@/lib/notify';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/constants/defaultChecklist';
import { computeChecklistStatus } from '@/lib/checklist';
import type { SimulationChecklistItemRow, SimulationRow } from '@/types/database';

/**
 * Idempotent: safe to call every time a simulation is (re-)submitted to
 * PJM, and safe to call speculatively as a self-heal check (see callers in
 * the simulation detail pages) — it's a no-op whenever items already exist.
 * Uses the service-role client for the insert only — the row content comes
 * entirely from the fixed DEFAULT_CHECKLIST_ITEMS constant, never from user
 * input, and a plain client session has no INSERT policy on
 * simulation_checklist_items (only admin_pjm does; clients can only flip an
 * existing item's status, see 0003_documents_checklist_admin.sql).
 */
export async function createDefaultChecklistForSimulation(simulationId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { data: existing, error: selectError } = await supabase
    .from('simulation_checklist_items')
    .select('id')
    .eq('simulation_id', simulationId)
    .limit(1);
  if (selectError) {
    console.error(`[checklist] failed to check existing items for simulation ${simulationId}:`, selectError.message);
    return { ok: false, error: selectError.message };
  }
  if (existing && existing.length > 0) return { ok: true };

  const { error: insertError } = await supabase.from('simulation_checklist_items').insert(
    DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      simulation_id: simulationId,
      checklist_key: item.key,
      label: item.label,
      category: item.category,
      required: item.required,
      blocking: item.blocking,
    }))
  );
  if (insertError) {
    console.error(`[checklist] failed to seed default checklist for simulation ${simulationId}:`, insertError.message);
    return { ok: false, error: insertError.message };
  }

  await recalculateChecklistStatus(simulationId);
  return { ok: true };
}

/** Recomputes simulations.checklist_status (draft/red/yellow/green) + has_blocking_documents. */
export async function recalculateChecklistStatus(simulationId: string): Promise<void> {
  const supabase = await createClient();
  const { data: items } = await supabase.from('simulation_checklist_items').select('*').eq('simulation_id', simulationId).returns<SimulationChecklistItemRow[]>();

  const { semaphore, hasBlockingDocuments } = computeChecklistStatus(items ?? []);

  await supabase
    .from('simulations')
    .update({ checklist_status: semaphore, has_blocking_documents: hasBlockingDocuments })
    .eq('id', simulationId);
}

export async function updateChecklistItemClient(itemId: string, simulationId: string, checked: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('simulation_checklist_items')
    .update({
      status: checked ? 'completed_by_client' : 'pending',
      completed_by: checked ? user.id : null,
      completed_at: checked ? new Date().toISOString() : null,
    })
    .eq('id', itemId);
  if (error) return { error: mapDbError(error.message) };

  await logAuditEvent({
    entityType: 'checklist_item',
    entityId: itemId,
    simulationId,
    userId: user.id,
    action: checked ? 'checklist_item_completed' : 'checklist_item_reopened',
  });

  await recalculateChecklistStatus(simulationId);
  revalidatePath(`/simulaciones/${simulationId}`);
  revalidatePath(`/admin/solicitudes/${simulationId}`);
  return { ok: true };
}

export async function reviewChecklistItemPjm(
  itemId: string,
  simulationId: string,
  status: 'approved_by_pjm' | 'observed_by_pjm' | 'not_applicable',
  notes: string
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (status === 'observed_by_pjm' && !notes.trim()) {
    return { error: 'El comentario es obligatorio para observar un ítem del checklist.' };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from('simulation_checklist_items')
    .update({ status, notes: notes || null, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { error: mapDbError(error.message) };

  await logAuditEvent({
    entityType: 'checklist_item',
    entityId: itemId,
    simulationId,
    userId: admin.id,
    action: status === 'approved_by_pjm' ? 'checklist_item_approved' : status === 'observed_by_pjm' ? 'checklist_item_observed' : 'checklist_item_not_applicable',
    newValue: { status, notes },
  });

  if (status === 'observed_by_pjm') {
    const { data: simulation } = await supabase.from('simulations').select('user_id, name').eq('id', simulationId).maybeSingle<SimulationRow>();
    if (simulation) {
      await supabase.from('comments').insert({
        request_id: null,
        simulation_id: simulationId,
        checklist_item_id: itemId,
        user_id: admin.id,
        comment: notes,
        comment_type: 'checklist_observation',
        visibility: 'client',
      });
      await notifyUser({
        userId: simulation.user_id,
        type: 'checklist_observed',
        title: 'PJM observó un ítem de tu checklist',
        message: `${simulation.name}: ${notes}`,
        linkUrl: `/simulaciones/${simulationId}`,
      });
    }
  }

  await recalculateChecklistStatus(simulationId);
  revalidatePath(`/simulaciones/${simulationId}`);
  revalidatePath(`/admin/solicitudes/${simulationId}`);
  return { ok: true };
}
