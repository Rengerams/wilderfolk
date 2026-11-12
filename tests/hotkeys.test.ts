/**
 * Build number keys must map to real BuildingType strings (not 0..8 indices).
 * Regression for House key `1` being falsy and crashing placement.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../src/game/gameTypes';
import {
  BUILDING_HOTKEYS,
  HOTKEY_BUILDINGS,
  isActivatableTarget,
  isEditableTarget,
} from '../src/game/hotkeys';

class FakeElement {
  isContentEditable = false;
  readonly tagName: string;
  readonly type: string;
  private readonly role: string | null;

  constructor(tagName: string, type = '', role: string | null = null) {
    this.tagName = tagName;
    this.type = type;
    this.role = role;
  }

  getAttribute(name: string): string | null {
    return name === 'role' ? this.role : null;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('only text-entry controls block hotkeys', () => {
  const target = (element: FakeElement) => element as unknown as EventTarget;

  it('blocks typed-text inputs, textareas and contenteditable fields', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    expect(isEditableTarget(target(new FakeElement('INPUT', 'text')))).toBe(true);
    expect(isEditableTarget(target(new FakeElement('INPUT')))).toBe(true);
    expect(isEditableTarget(target(new FakeElement('INPUT', 'number')))).toBe(true);
    expect(isEditableTarget(target(new FakeElement('TEXTAREA')))).toBe(true);
    expect(isEditableTarget(target(new FakeElement('DIV', '', 'textbox')))).toBe(true);
    const editable = new FakeElement('DIV');
    editable.isContentEditable = true;
    expect(isEditableTarget(target(editable))).toBe(true);
  });

  it('lets Escape and build hotkeys through checkboxes, selects and sliders', () => {
    vi.stubGlobal('HTMLElement', FakeElement);
    expect(isEditableTarget(target(new FakeElement('INPUT', 'checkbox')))).toBe(false);
    expect(isEditableTarget(target(new FakeElement('INPUT', 'radio')))).toBe(false);
    expect(isEditableTarget(target(new FakeElement('INPUT', 'range')))).toBe(false);
    expect(isEditableTarget(target(new FakeElement('SELECT')))).toBe(false);
    // Space stays native on those controls instead of pausing the game.
    expect(isActivatableTarget(target(new FakeElement('INPUT', 'checkbox')))).toBe(true);
    expect(isActivatableTarget(target(new FakeElement('SELECT')))).toBe(true);
  });
});

describe('HOTKEY_BUILDINGS', () => {
  it('key 1 is House string type (not numeric 0)', () => {
    expect(HOTKEY_BUILDINGS['1']).toBe(BuildingType.House);
    expect(HOTKEY_BUILDINGS['1']).toBe('house');
    // Falsy check that broke keyboard: number 0 is falsy; string 'house' is not
    expect(Boolean(HOTKEY_BUILDINGS['1'])).toBe(true);
  });

  it('maps 1–9 to configs that exist as BuildingType values', () => {
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const t = HOTKEY_BUILDINGS[key];
      expect(typeof t).toBe('string');
      expect(BUILDING_HOTKEYS[t]).toBe(key);
    }
  });
});