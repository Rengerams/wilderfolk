/**
 * One subject, in its own window — the shared shell, keyboard claim and closed-state mount.
 */
import type { ReactNode } from 'react';
import GameWindow from './GameWindow';
import { useOverlayKeyboard } from '../hooks/useOverlayKeyboard';

export interface SubjectWindowProps {
  /** Stable id for the keyboard claim; unique across every subject window in the game. */
  windowKey: string;
  open: boolean;
  onClose: () => void;
  icon: string;
  title: string;
  /** One line under the title: what this subject answers, or its live figures. */
  subtitle: string;
  children: ReactNode;
}

export default function SubjectWindow({
  windowKey,
  open,
  onClose,
  icon,
  title,
  subtitle,
  children,
}: SubjectWindowProps) {
  useOverlayKeyboard(`subject-window:${windowKey}`, onClose, open);
  if (!open) return null;
  return (
    <GameWindow
      icon={icon}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      centered
      maxBodyClassName="max-h-[70vh]"
    >
      {children}
    </GameWindow>
  );
}
