import type { ReactNode } from 'react';

interface GameOverlaysProps {
  children: ReactNode;
}

/** Presentation slot for high-priority game overlays; state and dismissal policy stay with existing owners. */
export default function GameOverlays({ children }: GameOverlaysProps) {
  if (!children) return null;

  return (
    <div
      role="region"
      aria-label="Game notifications and overlays"
      className="game-overlays pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-start overflow-hidden"
    >
      {children}
    </div>
  );
}