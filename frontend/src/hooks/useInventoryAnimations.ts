import { useCallback, useRef, useState } from 'react';

/* ── useHoverState ──────────────────────────────────────────────────
   Returns isHovered + props to spread onto any DOM element.
   ─────────────────────────────────────────────────────────────────── */

interface HoverState {
  isHovered: boolean;
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

export function useHoverState(): HoverState {
  const [isHovered, setIsHovered] = useState(false);
  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);
  return { isHovered, hoverProps: { onMouseEnter, onMouseLeave } };
}

/* ── useInteractionFeedback ─────────────────────────────────────────
   Returns a className to apply ('inv-bounce' | 'inv-shake' | '')
   and trigger functions. Rapid re-triggers restart the animation
   cleanly via rAF between class removal and re-add.
   ─────────────────────────────────────────────────────────────────── */

type FeedbackState = 'idle' | 'success' | 'error';

interface InteractionFeedback {
  feedbackClass: string;
  triggerSuccess: () => void;
  triggerError: () => void;
}

export function useInteractionFeedback(
  successDuration = 530,
  errorDuration = 470,
): InteractionFeedback {
  const [state, setState] = useState<FeedbackState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const trigger = useCallback(
    (next: FeedbackState, duration: number) => {
      reset();
      // Clear first so CSS animation can restart when re-triggering same class
      setState('idle');
      rafRef.current = requestAnimationFrame(() => {
        setState(next);
        timerRef.current = setTimeout(() => setState('idle'), duration);
      });
    },
    [reset],
  );

  const triggerSuccess = useCallback(() => trigger('success', successDuration), [trigger, successDuration]);
  const triggerError = useCallback(() => trigger('error', errorDuration), [trigger, errorDuration]);

  const feedbackClass = state === 'success' ? 'inv-bounce' : state === 'error' ? 'inv-shake' : '';

  return { feedbackClass, triggerSuccess, triggerError };
}

/* ── useShake ────────────────────────────────────────────────────────
   Standalone shake-only hook for form field error highlighting.
   ─────────────────────────────────────────────────────────────────── */

interface ShakeState {
  shakeClass: string;
  triggerShake: () => void;
}

export function useShake(duration = 470): ShakeState {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const triggerShake = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setActive(false);
    rafRef.current = requestAnimationFrame(() => {
      setActive(true);
      timerRef.current = setTimeout(() => setActive(false), duration);
    });
  }, [duration]);

  return { shakeClass: active ? 'inv-shake' : '', triggerShake };
}
