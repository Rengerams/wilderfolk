import type { ReactNode } from 'react';

type GameSidebarProps = {
  children: ReactNode;
};

/** Presentation shell for the tabbed sidebar; tab state and panel callbacks remain App-owned. */
export default function GameSidebar({ children }: GameSidebarProps) {
  return <div className="flex min-h-0 flex-1 flex-col" aria-label="Game sidebar">{children}</div>;
}
