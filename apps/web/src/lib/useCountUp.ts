'use client';

import { useEffect, useRef, useState } from 'react';

/** Animates once from 0 to `target` on first mount; later target changes apply immediately. Instant with reduced motion. */
export function useCountUp(target: number, ms = 600): number {
  const first = useRef(true);
  const [value, setValue] = useState(target);
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!first.current || reduced || !Number.isFinite(target) || target === 0) {
      first.current = false;
      setValue(target);
      return;
    }
    first.current = false;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setValue(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
