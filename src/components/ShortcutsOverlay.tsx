import { useEffect, useRef } from 'react';

export interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: 'WASD / drag', description: 'Pan camera' },
  { keys: 'Right-drag', description: 'Pan camera (alt)' },
  { keys: 'Scroll / + −', description: 'Zoom' },
  { keys: 'Mini-map', description: 'Click to jump the camera' },
  { keys: 'Click', description: 'Select · build · inspect camps' },
  { keys: 'Space', description: 'Pause / resume' },
  { keys: 'B', description: 'Full build catalog (left)' },
  { keys: 'G', description: 'Toggle placement grid' },
  { keys: '1–9', description: 'Quick-build' },
  { keys: 'O', description: 'People overview (full screen)' },
  { keys: 'V F N P L M', description: 'Sidebar tabs' },
  { keys: 'H', description: 'Center on settlers' },
  { keys: 'R', description: 'Rotate road / wall / gate while placing' },
  { keys: 'ESC', description: 'Close overview · cancel build · clear selection' },
  { keys: '?', description: 'This help overlay' },
  { keys: 'Menu → Settings', description: 'Show sim tick (raw t + day)' },
];

interface Props {
  onClose: () => void;
}

export default function ShortcutsOverlay({ onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 🎯 Focus management: Focus close button on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // ⌨️ ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 🔒 Focus trap: Keep focus within modal
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const focusableElements = overlay.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    overlay.addEventListener('keydown', handleTab);
    return () => overlay.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-stone-600 bg-stone-900 p-5 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-sm font-bold text-white">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts overlay"
            className="rounded p-1 text-stone-400 hover:bg-stone-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            ✕
          </button>
        </div>
        
        <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="contents">
              <dt>
                <strong className="text-emerald-300">{shortcut.keys}</strong>
              </dt>
              <dd className="text-stone-400">{shortcut.description}</dd>
            </div>
          ))}
        </dl>
        
        <p className="mt-3 text-[11px] text-stone-300">
          Alerts under the header are clickable — they jump you to raids, diplomacy, food, and trade.
        </p>
      </div>
    </div>
  );
}