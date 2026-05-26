// ==========================================================================
// hooks/useKeyboardShortcuts.ts
// Global keyboard shortcuts for the DAW timeline.
// Attach once on mount — ignores input/textarea/select elements.
// ==========================================================================
import { useEffect, useRef } from 'react';

interface UseKeyboardShortcutsOptions {
  onTogglePlay: () => void;
  onSeek: (newTime: number) => void;
  getCurrentTime: () => number;
  seekStep?: number;   // seconds per arrow-key press, default 0.5
  onSplitClip?: () => void;
}

export function useKeyboardShortcuts({
  onTogglePlay,
  onSeek,
  getCurrentTime,
  seekStep = 0.5,
  onSplitClip,
}: UseKeyboardShortcutsOptions) {
  // Keep refs up-to-date so the event handler never captures stale closures
  const toggleRef  = useRef(onTogglePlay);
  const seekRef    = useRef(onSeek);
  const timeRef    = useRef(getCurrentTime);
  const splitRef   = useRef(onSplitClip);

  useEffect(() => {
    toggleRef.current  = onTogglePlay;
    seekRef.current    = onSeek;
    timeRef.current    = getCurrentTime;
    splitRef.current   = onSplitClip;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleRef.current();
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        splitRef.current?.();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRef.current(timeRef.current() + seekStep);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRef.current(Math.max(0, timeRef.current() - seekStep));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [seekStep]); // only re-attach if seekStep changes
}
