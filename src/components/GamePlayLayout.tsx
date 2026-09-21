import type { ReactNode } from 'react';

export type GamePlayLayoutProps = {
  header: ReactNode;
  alertBar: ReactNode;
  buildRail: ReactNode;
  mapStage: ReactNode;
  inspector: ReactNode;
  overlays: ReactNode;
};

/**
 * The declarative gameplay composition surface. It owns only the stable layout
 * hierarchy; callers retain all state, lifecycle, and simulation policy.
 */
export default function GamePlayLayout({
  header,
  alertBar,
  buildRail,
  mapStage,
  inspector,
  overlays,
}: GamePlayLayoutProps) {
  return (
    <div className="game-shell flex h-screen w-screen flex-col overflow-hidden text-stone-100">
      {header}
      {alertBar}
      <div className="relative flex flex-1 overflow-hidden">
        {buildRail}
        <main className="map-stage relative" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0 }}>
          {mapStage}
        </main>
        {inspector}
      </div>
      {overlays}
    </div>
  );
}