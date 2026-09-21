import { Suspense, lazy } from 'react';
import type { FrontierPanelProps } from '../FrontierPanel';

const FrontierPanel = lazy(() => import('../FrontierPanel'));

/**
 * The wrapper adds `Suspense` + `lazy` and nothing else, so it forwards the child's own contract —
 * restating it here let a new `FrontierPanel` prop silently default instead of failing to compile
 * (audit C1 clone 2).
 */
export type FrontierTabPanelProps = FrontierPanelProps;

export default function FrontierTabPanel({
  state,
  pendingRaidCount,
  pendingOutgoingRaidCount,
  pendingDiplomacyCount,
  onFocusVisitor,
  onFocusRival,
  onLaunchRaid,
}: FrontierTabPanelProps) {
  return (
    <Suspense fallback={<p className="text-[13px] text-stone-300">Loading frontier…</p>}>
      <FrontierPanel
        state={state}
        pendingRaidCount={pendingRaidCount}
        pendingOutgoingRaidCount={pendingOutgoingRaidCount}
        pendingDiplomacyCount={pendingDiplomacyCount}
        onFocusVisitor={onFocusVisitor}
        onFocusRival={onFocusRival}
        onLaunchRaid={onLaunchRaid}
      />
    </Suspense>
  );
}