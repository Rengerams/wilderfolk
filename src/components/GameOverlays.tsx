import type { ReactNode } from 'react';

type GameOverlaysProps = {
  children: ReactNode;
};

/** Presentation slot for high-priority game overlays; state and dismissal policy stay with existing owners. */
export default function GameOverlays({ children }: GameOverlaysProps) {
  return <div className="game-overlays" aria-label="Game notifications and overlays">{children}</div>;
}
