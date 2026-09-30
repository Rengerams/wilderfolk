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
      // No top padding here: the authored-decision cards are NOT children of this slot — they render
      // inside the map stage's own `absolute inset-0 z-10` overlay (`App.tsx`), where one anchored
      // centred column stacks them. Padding this container to offset them reached the wrong box, and
      // every card that *is* a child here is `absolute` and ignores padding anyway.
      className="game-overlays pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-start overflow-hidden"
    >
      {children}
    </div>
  );
}