import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorldState } from '../game/gameTypes';
import type { WorkerCommand } from '../game/simWorker/commands';
import { decideVirtualPlayerAction } from '../game/virtualPlayer';
import { TICKS_PER_HOUR } from '../game/dayCycleClock';
import { playerHumanCount } from '../game/playerHuman';

/** Most recent auto-play acts kept for on-screen display. */
export const VIRTUAL_PLAYER_HISTORY_LIMIT = 8;
/** How many recent acts the header tooltip lists. */
export const VIRTUAL_PLAYER_TOOLTIP_LIMIT = 5;

/** What the bot was doing when the colony asked for nothing. */
const IDLE_STATUS = 'no action needed — colony looks healthy';

/** One recorded auto-play act, for the on-screen history. */
export interface VirtualPlayerAct {
  tick: number;
  op: WorkerCommand['op'];
  reason: string;
}

/** Live session counters, shown next to the FPS readout while auto-play runs. */
export interface VirtualPlayerSession {
  settlers: number;
  buildings: number;
  acts: number;
}

export interface UseVirtualPlayerParams {
  world: WorldState;
  /** The player's own dispatch door (`useGameSession().applyGameAction`). */
  applyGameAction: (command: WorkerCommand) => void;
}

export interface UseVirtualPlayerResult {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  /** Latest player-facing reason, or `null` while auto-play is off. */
  status: string | null;
  history: VirtualPlayerAct[];
  actsTaken: number;
  /** `null` while auto-play is off — so callers can render it unconditionally. */
  session: VirtualPlayerSession | null;
}

/** Everything the on-screen readout needs to know about the current run. */
interface VirtualPlayerRun {
  status: string | null;
  acts: number;
  history: VirtualPlayerAct[];
}

const EMPTY_RUN: VirtualPlayerRun = { status: null, acts: 0, history: [] };

/**
 * Whether the bot may act on this world snapshot: enabled, not paused, on an
 * in-game hour boundary, and never twice for the same tick. Pure, so the
 * cadence rule is testable without a DOM.
 */
export function shouldVirtualPlayerAct(
  enabled: boolean,
  world: Pick<WorldState, 'paused' | 'tick'>,
  lastActedTick: number | null,
): boolean {
  if (!enabled || world.paused) return false;
  if (world.tick % TICKS_PER_HOUR !== 0) return false;
  return lastActedTick !== world.tick;
}

/**
 * Drives the in-app virtual player.
 *
 * Presentation-side only (AGENTS.md §5): it reads the current world, asks the
 * pure engine for at most one decision per in-game hour, and dispatches that
 * command through `applyGameAction` — the same door a click uses, so in worker
 * mode the command travels the real worker transport and the worker stays
 * authoritative. It never mutates `WorldState` itself.
 */
export function useVirtualPlayer({
  world,
  applyGameAction,
}: UseVirtualPlayerParams): UseVirtualPlayerResult {
  const [enabled, setEnabledState] = useState(false);
  const [run, setRun] = useState<VirtualPlayerRun>(EMPTY_RUN);
  const enabledRef = useRef(false);
  /** Last tick the bot acted (or decided) on — a re-render cannot double-fire it. */
  const lastActedTickRef = useRef<number | null>(null);

  const setEnabled = useCallback((next: boolean) => {
    enabledRef.current = next;
    setEnabledState(next);
    // A fresh session starts with fresh counters and may act in this same hour.
    setRun(EMPTY_RUN);
    if (next) lastActedTickRef.current = null;
  }, []);

  const toggle = useCallback(() => setEnabled(!enabledRef.current), [setEnabled]);

  useEffect(() => {
    if (!shouldVirtualPlayerAct(enabled, world, lastActedTickRef.current)) return;
    // Claim the hour before dispatching: a rejected command must not be retried
    // in a loop within the same in-game hour.
    lastActedTickRef.current = world.tick;

    const decision = decideVirtualPlayerAction(world);
    if (decision) applyGameAction(decision.command);

    // This effect mirrors what the bot just dispatched (an external system:
    // the game loop) into the on-screen readout. `lastActedTickRef` above makes
    // it fire at most once per in-game hour, so it cannot cascade renders.
    // oxlint-disable-next-line react/set-state-in-effect
    setRun((previous) => {
      if (!decision) {
        return previous.status === IDLE_STATUS ? previous : { ...previous, status: IDLE_STATUS };
      }
      const act: VirtualPlayerAct = {
        tick: world.tick,
        op: decision.command.op,
        reason: decision.reason,
      };
      return {
        status: act.reason,
        acts: previous.acts + 1,
        history: [act, ...previous.history].slice(0, VIRTUAL_PLAYER_HISTORY_LIMIT),
      };
    });
  }, [applyGameAction, enabled, world]);

  const session = useMemo<VirtualPlayerSession | null>(() => {
    if (!enabled) return null;
    return {
      settlers: playerHumanCount(world.entities),
      buildings: world.buildings.reduce(
        (total, building) => total + (building.faction === 'rival' ? 0 : 1),
        0,
      ),
      acts: run.acts,
    };
  }, [enabled, run, world]);

  return {
    enabled,
    setEnabled,
    toggle,
    status: enabled ? run.status : null,
    history: run.history,
    actsTaken: run.acts,
    session,
  };
}
