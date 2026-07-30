import { Suspense, lazy } from 'react';
import type { WorldState } from '../../game/gameEngine';

const FrontierPanel = lazy(() => import('../FrontierPanel'));

export interface FrontierTabPanelProps {
  state: WorldState;
  pendingRaidCount: number;
  pendingOutgoingRaidCount: number;
  pendingDiplomacyCount: number;
  onFocusVisitor: (id: string, x: number, y: number) => void;
  onFocusRival: (id: string, x: number, y: number, buildingId: number | undefined) => void;
  onLaunchRaid: (rivalId: string) => void;
}

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
    <Suspense fallback={<p className="text-[11px] text-stone-500">Loading frontier…</p>}>
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
