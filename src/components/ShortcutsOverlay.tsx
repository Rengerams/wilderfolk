export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['WASD / drag', 'Pan camera'],
    ['Right-drag', 'Pan camera (alt)'],
    ['Scroll / + −', 'Zoom'],
    ['Mini-map', 'Click to jump the camera'],
    ['Click', 'Select · build · inspect camps'],
    ['Space', 'Pause / resume'],
    ['B', 'Full build catalog (left)'],
    ['G', 'Toggle placement grid'],
    ['1–9', 'Quick-build'],
    ['V F N P L M', 'Sidebar tabs'],
    ['H', 'Center on settlers'],
    ['R', 'Rotate road / wall / gate while placing'],
    ['ESC', 'Cancel build · clear selection'],
    ['?', 'This help overlay'],
    ['Menu → Settings', 'Show sim tick (raw t + day)'],
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-stone-600 bg-stone-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-white">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {rows.map(([key, desc]) => (
            <span key={key} className="contents">
              <strong className="text-emerald-300">{key}</strong>
              <span className="text-stone-400">{desc}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-stone-300">Alerts under the header are clickable — they jump you to raids, diplomacy, food, and trade.</p>
      </div>
    </div>
  );
}
