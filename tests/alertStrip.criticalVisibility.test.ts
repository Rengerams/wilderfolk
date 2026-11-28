/**
 * The alert strip keeps every `critical` alert on screen; only non-critical overflow collapses.
 * Selection is pure and pinned here; the chip's non-colour marker is pinned by the source guards.
 */
import { describe, expect, it } from 'vitest';
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


