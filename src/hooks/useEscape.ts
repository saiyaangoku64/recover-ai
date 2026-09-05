import { useEffect, useEffectEvent } from 'react';

const escapeStack: ((event: KeyboardEvent) => void)[] = [];

export function useEscape(onEscape: () => void, enabled = true) {
  const close = useEffectEvent(onEscape);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat || e.isComposing || escapeStack.at(-1) !== onKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    // Keep opening order stable when a modal's close callback changes on render.
    escapeStack.push(onKey);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const index = escapeStack.indexOf(onKey);
      if (index !== -1) escapeStack.splice(index, 1);
    };
  }, [enabled]);
}
