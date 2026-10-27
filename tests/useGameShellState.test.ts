import { describe, expect, it } from 'vitest';
import {
  getActiveSidebarTab,
  mapOverviewNav,
  mapSidebarTabToOverview,
  openSidebarTab,
  overviewNavFromState,
  toggleSidebarTab,
  type SidebarTab,
} from '../src/hooks/useGameShellState';

describe('game shell focused-view state', () => {
  it('uses the only open view and falls back to Village when every view is closed', () => {
    expect(getActiveSidebarTab(new Set<SidebarTab>())).toBe('village');
    expect(getActiveSidebarTab(new Set<SidebarTab>(['frontier']))).toBe('frontier');
  });

  it('opens the requested view and closes any previously open view', () => {
    const openTabs = new Set<SidebarTab>(['village', 'frontier']);

    const openedVillage = openSidebarTab(openTabs, 'village');
    const openedProgress = openSidebarTab(openTabs, 'progress');

    expect([...openedVillage]).toEqual(['village']);
    expect(getActiveSidebarTab(openedVillage)).toBe('village');
    expect([...openedProgress]).toEqual(['progress']);
    expect(getActiveSidebarTab(openedProgress)).toBe('progress');
    expect([...openTabs]).toEqual(['village', 'frontier']);
  });

  it('closes the active view or replaces it with the requested view without mutating the previous set', () => {
    const openTabs = new Set<SidebarTab>(['village']);

    const closed = toggleSidebarTab(openTabs, 'village');
    const openedNature = toggleSidebarTab(closed, 'nature');
    const switchedToLog = toggleSidebarTab(openedNature, 'log');

    expect([...closed]).toEqual([]);
    expect([...openedNature]).toEqual(['nature']);
    expect([...switchedToLog]).toEqual(['log']);
    expect([...openTabs]).toEqual(['village']);
  });

  it('maps right-rail tabs onto the full-screen overview sections', () => {
    expect(mapSidebarTabToOverview('village')).toEqual({ section: 'people', worldFocus: null });
    expect(mapSidebarTabToOverview('schedule')).toEqual({ section: 'people', worldFocus: null });
    expect(mapSidebarTabToOverview('frontier')).toEqual({ section: 'world', worldFocus: 'frontier' });
    expect(mapSidebarTabToOverview('nature')).toEqual({ section: 'world', worldFocus: 'nature' });
    expect(mapSidebarTabToOverview('progress')).toEqual({ section: 'world', worldFocus: 'progress' });
    expect(mapSidebarTabToOverview('log')).toEqual({ section: 'chronicle', worldFocus: null });
    expect(mapSidebarTabToOverview('more')).toEqual({ section: 'help', worldFocus: null });
  });

  it('maps in-overview nav chips and recovers the active chip from state', () => {
    expect(mapOverviewNav('nature')).toEqual({ section: 'world', worldFocus: 'nature' });
    expect(overviewNavFromState('world', 'nature')).toBe('nature');
    expect(overviewNavFromState('people', null)).toBe('people');
  });
});