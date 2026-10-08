/**
 * The alert strip keeps every `critical` alert on screen: with three criticals at once, a flat
 * `VISIBLE_LIMIT` slice hid the third behind "+N more". The selection is pure, so it is pinned here;
 * the chip's non-colour marker is pinned by source because this tier is `environment: 'node'`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PriorityAlert, PriorityAlertSeverity } from '../src/game/priorityAlerts';
import { collapsedAlertCount, visibleAlertChips } from '../src/components/AlertBar';

function chip(id: string, severity: PriorityAlertSeverity): PriorityAlert {
  return { id, severity, icon: '⚠️', title: id, detail: id, action: { type: 'tab', tab: 'log' } };
}

describe('the priority strip never collapses a critical alert', () => {
  it('shows all three simultaneous criticals, which a flat two-item slice would not', () => {
    const alerts = [
      chip('raid', 'critical'),
      chip('shelter', 'critical'),
      chip('food', 'critical'),
      chip('trade', 'info'),
    ];

    // The owner sorts by severity, so the un-collapsed list is criticals first — non-vacuity: the old
    // flat slice really did drop the third critical.
    expect(alerts.slice(0, 2).map((alert) => alert.id)).toEqual(['raid', 'shelter']);
    expect(visibleAlertChips(alerts, false).map((alert) => alert.id)).toEqual([
      'raid',
      'shelter',
      'food',
      'trade',
    ]);
    expect(collapsedAlertCount(alerts)).toBe(0);
  });

  it('collapses only the non-critical overflow, and counts exactly what it hides', () => {
    const alerts = [
      chip('raid', 'critical'),
      chip('housing', 'warning'),
      chip('forge', 'warning'),
      chip('challenge', 'info'),
      chip('route', 'info'),
    ];

    const visible = visibleAlertChips(alerts, false);
    expect(visible.map((alert) => alert.id)).toEqual(['raid', 'housing', 'forge']);
    expect(collapsedAlertCount(alerts)).toBe(alerts.length - visible.length);
    expect(visibleAlertChips(alerts, true)).toHaveLength(alerts.length);
  });
});

describe('a critical chip says so without relying on its colour', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/AlertBar.tsx'), 'utf8');

  it('renders a named marker on the critical chip', () => {
    expect(source).toMatch(/alert\.severity === 'critical'/);
    expect(source).toMatch(/aria-label=\{CRITICAL_MARKER\.name\}/);
  });

  it('routes the strip through the collapse owner rather than slicing the list itself', () => {
    expect(source).toMatch(/visibleAlertChips\(alerts, expanded\)/);
    expect(source).not.toMatch(/alerts\.slice\(/);
  });
});
