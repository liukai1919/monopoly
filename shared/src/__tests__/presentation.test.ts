import { describe, expect, test } from 'vitest';
import { actionBypassesPresentationLock, actionPresentationLockMs } from '../presentation';
import type { GameEvent } from '../types';

const EVENT_CASES: [string, GameEvent, number][] = [
  ['teleport', { type: 'move', playerId: 'a', path: [10], teleport: true }, 840],
  ['card', { type: 'card', playerId: 'a', deck: 'chance', text: 'Advance' }, 2740],
  ['building', { type: 'build', playerId: 'a', tileId: 1, building: 'house', level: 1 }, 1090],
  ['bankruptcy', { type: 'bankrupt', playerId: 'a', creditorId: null }, 2140],
  ['monopoly', { type: 'monopoly', playerId: 'a', group: 'brown' }, 2340],
  ['game over', { type: 'game-over', winner: 'a' }, 1040],
];

describe('presentation pacing', () => {
  test('computes one action lock from the board presentation sequence', () => {
    expect(actionPresentationLockMs([
      { type: 'dice', playerId: 'a', dice: [2, 1] },
      { type: 'move', playerId: 'a', path: [1, 2, 3] },
      { type: 'cash', from: 'a', to: null, amount: 50 },
    ], { type: 'roll' })).toBe(2770);
  });

  test.each(EVENT_CASES)('covers the %s board presentation', (_label, event, expectedMs) => {
    expect(actionPresentationLockMs([event], { type: 'roll' })).toBe(expectedMs);
  });

  test('keeps turn and market overlays visible before accepting another action', () => {
    expect(actionPresentationLockMs([], { type: 'end-turn' })).toBe(3340);
  });

  test('keeps the lock for the full event queue instead of truncating long presentations', () => {
    const events: GameEvent[] = Array.from({ length: 4 }, (_, index) => ({
      type: 'card',
      playerId: 'a',
      deck: 'chance',
      text: `Card ${index + 1}`,
    }));

    expect(actionPresentationLockMs(events, { type: 'draw-card' })).toBe(10540);
  });

  test('allows ETF orders during unrelated board presentation', () => {
    expect(actionBypassesPresentationLock({ type: 'buy-etf', etfId: 'CAN-REAL', shares: 1 })).toBe(true);
    expect(actionBypassesPresentationLock({ type: 'sell-etf', etfId: 'CAN-REAL', shares: 1 })).toBe(true);
    expect(actionBypassesPresentationLock({ type: 'roll' })).toBe(false);
  });
});
