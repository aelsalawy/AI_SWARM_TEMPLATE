import React from 'react';
import { cn } from '@/src/lib/utils';
import type { Dispatch } from '../lib/types';
import apiClient from '../lib/api-client';

/**
 * DispatchChip — Agent Dispatch v1 (T11)
 *
 * Renders the PM-mediated dispatch state for a task/bug detail view by reading
 * GET /api/tasks/:id/dispatch (or /api/bugs/:id/dispatch). The endpoint is
 * provided by ALM task 7; this component is built against the documented
 * response shape: `{ dispatch: { pmState, wakeState, gatewaySessionId,
 * initiatedBy, pmNotifiedAt, pmActedAt, pmNudges, createdAt, updatedAt } | null }`.
 *
 * States rendered:
 *   none        → dispatch is null (or cancelled) → chip hidden entirely
 *   awaiting-PM → PM review pending (pmState pending/notified, no nudges yet)
 *   nudged      → PM notified + nudged (pmNudges > 0)
 *   escalated   → PM unreachable / no-act (pmState failed/stuck)
 *   spawned     → assignee spawn accepted (wakeState pending/sent, item not claimed)
 *   claimed     → assignee claimed the item (wakeState sent + item IN_PROGRESS)
 *   stuck       → assignee no-claim (wakeState stuck/failed)
 *
 * Graceful degradation: any fetch error (404/403/network) → renders nothing,
 * never a broken UI. Visual language matches the DetailPanel slate palette
 * (small pill/chip). No layout/animation wrappers — this is a plain inline chip.
 */

export type DispatchChipState =
  | 'none'
  | 'awaiting-pm'
  | 'nudged'
  | 'escalated'
  | 'spawned'
  | 'claimed'
  | 'stuck';

interface DispatchChipProps {
  itemType: 'task' | 'bug';
  itemId: string;
  /** Item status (e.g. 'IN_PROGRESS') used to distinguish claimed vs spawned. */
  itemStatus?: string | null;
  className?: string;
}

const STATE_META: Record<Exclude<DispatchChipState, 'none'>, { label: string; dot: string; text: string }> = {
  'awaiting-pm': { label: 'Awaiting PM', dot: 'bg-amber-400', text: 'text-amber-700 bg-amber-50 border-amber-200' },
  nudged: { label: 'PM nudged', dot: 'bg-orange-400', text: 'text-orange-700 bg-orange-50 border-orange-200' },
  escalated: { label: 'Escalated', dot: 'bg-red-500', text: 'text-red-700 bg-red-50 border-red-200' },
  spawned: { label: 'Spawned', dot: 'bg-blue-400', text: 'text-blue-700 bg-blue-50 border-blue-200' },
  claimed: { label: 'Claimed', dot: 'bg-green-500', text: 'text-green-700 bg-green-50 border-green-200' },
  stuck: { label: 'Stuck', dot: 'bg-slate-500', text: 'text-slate-600 bg-slate-100 border-slate-200' },
};

/** Map the raw dispatch row to a single chip state. */
function resolveState(dispatch: Dispatch | null, itemStatus?: string | null): DispatchChipState {
  if (!dispatch) return 'none';

  const pm = dispatch.pmState;
  const wake = dispatch.wakeState;
  const nudges = dispatch.pmNudges ?? 0;

  // PM-mediated review still in flight.
  if (pm === 'pending') return 'awaiting-pm';
  if (pm === 'notified') return nudges > 0 ? 'nudged' : 'awaiting-pm';
  // PM unreachable / no-act → escalated.
  if (pm === 'failed' || pm === 'stuck') return 'escalated';
  // Review cancelled → nothing to show.
  if (pm === 'cancelled') return 'none';

  // pmState is 'done' or 'skipped' → assignee spawn is the active layer.
  if (wake === 'stuck' || wake === 'failed') return 'stuck';
  if (wake === 'cancelled') return 'none';

  // wakeState 'pending' or 'sent' → spawned; claimed once the item is in progress.
  const inProgress = /in[_ ]?progress/i.test(itemStatus || '');
  return inProgress ? 'claimed' : 'spawned';
}

export default function DispatchChip({ itemType, itemId, itemStatus, className }: DispatchChipProps) {
  const [state, setState] = React.useState<DispatchChipState>('none');

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = itemType === 'task'
          ? await apiClient.tasks.getDispatch(itemId)
          : await apiClient.bugs.getDispatch(itemId);
        if (cancelled) return;
        setState(resolveState(res?.dispatch ?? null, itemStatus));
      } catch (e) {
        // 404/403/network → graceful degradation: chip hidden, never a broken UI.
        if (!cancelled) setState('none');
      }
    };

    load();
    return () => { cancelled = true; };
  }, [itemType, itemId, itemStatus]);

  if (state === 'none') return null;

  const meta = STATE_META[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border',
        meta.text,
        className,
      )}
      title={`Dispatch: ${meta.label}`}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
