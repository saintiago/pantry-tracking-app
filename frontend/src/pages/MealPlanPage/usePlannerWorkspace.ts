import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlannerSnapshot, PlannerChange } from '@pantry/domain';
import {
  changePlanner,
  fetchPlannerWorkspace,
  reconcilePlanner,
} from '../../api/meal-plans/workspace';

export type Changes = Omit<PlannerChange, 'operationId' | 'revision'>;
const empty: PlannerSnapshot = {
  contractVersion: 2,
  revision: 0,
  mealPlans: [],
  batches: [],
  favorites: [],
};
export function usePlannerWorkspace(active: boolean) {
  const [state, setState] = useState(empty);
  const current = useRef(state);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PlannerChange | null>(null);
  const pendingRef = useRef<PlannerChange | null>(null);
  const [undo, setUndo] = useState<{ revision: number; changes: Changes } | null>(null);
  const accept = (next: PlannerSnapshot) => {
    current.current = next;
    setState(next);
  };
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchPlannerWorkspace(signal);
      if (!signal?.aborted && next.revision >= current.current.revision) accept(next);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Could not load planner');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [active, refresh]);
  const execute = async (change: PlannerChange, before: PlannerSnapshot, allowUndo: boolean) => {
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const next = await changePlanner(change);
      accept(next);
      pendingRef.current = null;
      setPending(null);
      if (allowUndo && next.revision === change.revision + 1) {
        const touched = new Set([
          ...(change.entries ?? []).map((e) => e.planId),
          ...(change.removeIds ?? []),
        ]);
        const batchIds = new Set([
          ...(change.batches ?? []).map((b) => b.batchId),
          ...(change.removeBatchIds ?? []),
        ]);
        setUndo({
          revision: next.revision,
          changes: {
            entries: before.mealPlans.filter((e) => touched.has(e.planId)),
            removeIds: (change.entries ?? [])
              .filter((e) => !before.mealPlans.some((p) => p.planId === e.planId))
              .map((e) => e.planId),
            batches: before.batches.filter((b) => batchIds.has(b.batchId)),
            removeBatchIds: (change.batches ?? [])
              .filter((b) => !before.batches.some((p) => p.batchId === b.batchId))
              .map((b) => b.batchId),
          },
        });
      } else setUndo(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save planner');
      pendingRef.current = change;
      setPending(change);
      throw err;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const mutate = async (changes: Changes, allowUndo = false) => {
    if (busy.current || pendingRef.current) throw new Error('Resolve the pending save first');
    return execute(
      { ...changes, revision: current.current.revision, operationId: crypto.randomUUID() },
      current.current,
      allowUndo,
    );
  };
  return {
    state,
    loading,
    saving,
    error,
    pending,
    undo,
    refresh,
    mutate,
    retry: async () => {
      if (pendingRef.current && !busy.current)
        await execute(pendingRef.current, current.current, false);
    },
    reconcile: async () => {
      if (busy.current || !pendingRef.current) return;
      busy.current = true;
      setSaving(true);
      try {
        accept(await reconcilePlanner(pendingRef.current));
        pendingRef.current = null;
        setPending(null);
        setUndo(null);
        setError('');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not reconcile the pending save. Try again.',
        );
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    undoChange: async () => {
      if (!undo || busy.current || pendingRef.current) return;
      if (current.current.revision !== undo.revision) {
        setError('The planner changed. Undo cannot overwrite newer changes.');
        return;
      }
      await mutate(undo.changes);
    },
  };
}
