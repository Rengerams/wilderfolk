/**
 * One subject, in its own window — the owner's ruling, as one primitive.
 *
 * Owner, 2026-09-29: *"each subject should just have its own window not stacking up"*, and of the
 * panels that ignored it: *"it looks terrible all things are underneath each other"*. A panel that
 * used to be a page of `CollapsibleSection`s becomes an **index** — identity plus one button per
 * subject — and each subject renders here instead.
 *
 * It exists as a shared component rather than a wrapper per panel because two panels already needed
 * the identical thing (`SelectedBuildingPanel`, `VillageTabPanel`), and a second copy of it is the
 * mechanical clone this repository gates against. It owns exactly three decisions, all of which every
 * caller would otherwise repeat and could get wrong:
 *
 *  - the **shell** (`GameWindow`, centred, body capped so the game stays visible);
 *  - the **keyboard contract** for a modal opened from an inspector: claim the keyboard while open,
 *    so `v`/`f`/`Esc` do not act on the map behind it, and close on Escape itself. `GameWindow` owns
 *    the *focus* half; this owns the *key* half, which is why the pair is not split across callers.
 *  - **nothing while closed** — the window is not mounted, so `GameWindow`'s focus trap is not either.
 *
 * `children` are passed eagerly, exactly as they were to `CollapsibleSection`: a section's body was
 * always constructed by the panel whether or not the section was open, so re-homing a subject here
 * moves *where* it renders, not when it is computed.
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
