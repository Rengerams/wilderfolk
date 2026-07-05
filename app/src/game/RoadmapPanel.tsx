import { GAME_PHASE, GAME_VERSION } from './version';
import {
  ROADMAP_NORTH_STAR,
  ROADMAP_STATUS_META,
  ROADMAP_TARGET_VERSION,
  ROADMAP_VERSIONS,
  type RoadmapFeature,
} from './roadmapContent';

function FeatureRow({ feature }: { feature: RoadmapFeature }) {
  const meta = ROADMAP_STATUS_META[feature.status];
  return (
    <tr className="border-t border-stone-600/40 first:border-t-0">
      <td className={`w-6 py-1 pr-1 align-top text-center ${meta.className}`} title={meta.label}>
        {meta.icon}
      </td>
      <td className={`py-1 leading-snug ${feature.status === 'done' ? 'text-stone-300' : 'text-stone-400'}`}>
        {feature.label}
      </td>
    </tr>
  );
}

export default function RoadmapPanel() {
  return (
    <div className="space-y-3 text-[10px] text-stone-300">
      <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/25 p-3">
        <h3 className="mb-1 text-xs font-bold text-indigo-300">🗺️ Roadmap</h3>
        <p className="text-[9px] text-stone-500">
          {GAME_PHASE} · playing v{GAME_VERSION} · next tag v{ROADMAP_TARGET_VERSION}
        </p>
        <p className="mt-2 leading-relaxed text-stone-400">{ROADMAP_NORTH_STAR}</p>
        <p className="mt-2 text-[9px] text-stone-500">
          🟢 done · 🟡 in progress · ⬜ open
        </p>
      </div>

      {ROADMAP_VERSIONS.map((v) => (
        <div key={v.version} className="rounded-xl bg-stone-700/50 p-3">
          <h4 className="text-xs font-bold text-stone-200">
            v{v.version} — {v.theme}
          </h4>
          <p className="mb-2 text-[9px] text-stone-500">
            Shipped: {v.shipDate}
            {v.tagTarget ? ` · Tag target: ${v.tagTarget}` : ''}
          </p>
          <table className="w-full border-collapse text-[10px]">
            <tbody>
              {v.features.map((feature) => (
                <FeatureRow key={feature.label} feature={feature} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}