import { describe, expect, test } from 'vitest';
import {
  applyAction, createGame, decideAction, liquidationValue, netWorth, recommendEtfLiquidation,
} from '../index';
import type { Action, GameState, RNG, SeatInfo } from '../index';

const SEATS: SeatInfo[] = [
  { id: 'a', name: 'Ava', emoji: 'A', color: '#e74c3c', isAi: false },
  { id: 'b', name: 'Ben', emoji: 'B', color: '#3498db', isAi: true },
];

function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newGame(): GameState {
  return createGame(SEATS, {}, mulberry32(7));
}

function mustApply(s: GameState, pid: string, action: Action): GameState {
  const result = applyAction(s, pid, action, mulberry32(9));
  if (!result.ok) throw new Error(`${action.type} failed: ${result.error}`);
  return result.state;
}

function player(s: GameState, id: string) {
  return s.players.find((p) => p.id === id)!;
}

describe('ETF trading and accounting', () => {
  test('players can buy and sell ETF shares during manage phase', () => {
    let s = newGame();
    s.phase = 'manage';

    s = mustApply(s, 'a', { type: 'buy-etf', etfId: 'CAN-REAL', shares: 2 });
    expect(player(s, 'a').cash).toBe(1294);
    expect(s.portfolios.a!['CAN-REAL']).toBe(2);
    expect(s.market.recentEvents.some((e) => e.kind === 'etf-bought' && e.industry === 'realEstate')).toBe(true);

    s = mustApply(s, 'a', { type: 'sell-etf', etfId: 'CAN-REAL', shares: 1 });
    expect(player(s, 'a').cash).toBe(1391);
    expect(s.portfolios.a!['CAN-REAL']).toBe(1);
    expect(s.market.recentEvents.some((e) => e.kind === 'etf-sold' && e.industry === 'realEstate')).toBe(true);
  });

  test('players can trade ETF shares outside their own turn', () => {
    let s = newGame();
    expect(s.phase).toBe('awaiting-roll');

    s = mustApply(s, 'b', { type: 'buy-etf', etfId: 'CAN-FIN', shares: 1 });
    expect(player(s, 'b').cash).toBe(1397);
    expect(s.portfolios.b!['CAN-FIN']).toBe(1);
    expect(s.phase).toBe('awaiting-roll');
    expect(s.currentPlayer).toBe('a');

    s = mustApply(s, 'b', { type: 'sell-etf', etfId: 'CAN-FIN', shares: 1 });
    expect(player(s, 'b').cash).toBe(1494);
    expect(s.portfolios.b!['CAN-FIN']).toBe(0);
    expect(s.phase).toBe('awaiting-roll');
  });

  test('only the debtor gets the ETF fire-sale haircut during debt phase', () => {
    let s = newGame();
    player(s, 'a').cash = 0;
    s.portfolios.a!['CAN-REAL'] = 2;
    s.portfolios.b!['CAN-FIN'] = 1;
    s.debts.push({ debtor: 'a', creditor: null, amount: 100, reason: 'test debt', kind: 'other' });
    s.phase = 'awaiting-debt';

    s = mustApply(s, 'b', { type: 'sell-etf', etfId: 'CAN-FIN', shares: 1 });
    expect(player(s, 'b').cash).toBe(1597);
    expect(s.market.recentEvents.at(-1)?.kind).toBe('etf-sold');
    expect(s.phase).toBe('awaiting-debt');

    const buyWhileInDebt = applyAction(s, 'a', { type: 'buy-etf', etfId: 'CAN-FIN', shares: 1 });
    expect(buyWhileInDebt.ok).toBe(false);
  });

  test('forced ETF sales in debt phase apply the fire-sale haircut and settle debt atomically', () => {
    let s = newGame();
    player(s, 'a').cash = 0;
    s.portfolios.a!['CAN-REAL'] = 2;
    s.debts.push({ debtor: 'a', creditor: null, amount: 100, reason: 'test debt', kind: 'other' });
    s.phase = 'awaiting-debt';

    s = mustApply(s, 'a', { type: 'sell-etf', etfId: 'CAN-REAL', shares: 2 });

    expect(s.portfolios.a!['CAN-REAL']).toBe(0);
    expect(player(s, 'a').cash).toBe(64);
    expect(s.debts).toHaveLength(0);
    expect(s.phase).toBe('manage');
    expect(s.market.recentEvents.some((e) => e.kind === 'etf-forced-sold')).toBe(true);
  });

  test('net worth uses mark-to-market value while liquidation value uses forced-sale value', () => {
    const s = newGame();
    s.portfolios.a!['CAN-REAL'] = 1;

    expect(netWorth(s, 'a')).toBe(1600);
    expect(liquidationValue(s, 'a')).toBe(1582);
  });

  test('liquidation recommendation returns the smallest useful forced-sale bundle', () => {
    const s = newGame();
    s.portfolios.a!['CAN-TECH'] = 3;
    s.portfolios.a!['CAN-UTIL'] = 1;

    const recommendation = recommendEtfLiquidation(s, 'a', 110);

    expect(recommendation.totalCash).toBeGreaterThanOrEqual(110);
    expect(recommendation.sales).toHaveLength(1);
    expect(recommendation.sales[0]).toMatchObject({ etfId: 'CAN-TECH', shares: 2, netCash: 164 });
  });

  test('AI liquidates ETFs before mortgaging property in debt phase', () => {
    const s = newGame();
    player(s, 'a').cash = 0;
    s.portfolios.a!['CAN-REAL'] = 2;
    s.ownership[39]!.owner = 'a';
    s.debts.push({ debtor: 'a', creditor: null, amount: 100, reason: 'test debt', kind: 'other' });
    s.phase = 'awaiting-debt';

    expect(decideAction(s, 'a')).toEqual({ type: 'sell-etf', etfId: 'CAN-REAL', shares: 2 });
  });

  test('bankruptcy transfers ETF holdings to the creditor and clears the debtor portfolio', () => {
    let s = newGame();
    player(s, 'a').cash = 0;
    s.portfolios.a!['CAN-REAL'] = 2;
    s.debts.push({ debtor: 'a', creditor: 'b', amount: 10_000, reason: 'test debt', kind: 'other' });
    s.phase = 'awaiting-debt';

    s = mustApply(s, 'a', { type: 'declare-bankruptcy' });

    expect(s.portfolios.a!['CAN-REAL']).toBe(0);
    expect(s.portfolios.b!['CAN-REAL']).toBe(2);
    expect(player(s, 'a').bankrupt).toBe(true);
  });
});
