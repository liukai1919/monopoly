import { describe, expect, test } from 'vitest';
import {
  applyAction, createGame, decideAction, whoMustAct,
} from '../index';
import type { GameState, RNG, SeatInfo } from '../index';

function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AI_SEATS: SeatInfo[] = [
  { id: 'ai1', name: '机器人壹', emoji: '🤖', color: '#e74c3c', isAi: true },
  { id: 'ai2', name: '机器人贰', emoji: '🎃', color: '#3498db', isAi: true },
  { id: 'ai3', name: '机器人叁', emoji: '🦫', color: '#27ae60', isAi: true },
  { id: 'ai4', name: '机器人肆', emoji: '🏒', color: '#f39c12', isAi: true },
];

function checkInvariants(s: GameState, game: number, step: number): void {
  const where = `第 ${game} 局第 ${step} 步`;
  expect(s.housesRemaining, `${where}: 房屋库存越界`).toBeGreaterThanOrEqual(0);
  expect(s.housesRemaining, `${where}: 房屋库存越界`).toBeLessThanOrEqual(32);
  expect(s.hotelsRemaining, `${where}: 酒店库存越界`).toBeGreaterThanOrEqual(0);
  expect(s.hotelsRemaining, `${where}: 酒店库存越界`).toBeLessThanOrEqual(12);
  for (const p of s.players) {
    expect(p.cash, `${where}: ${p.name} 现金为负`).toBeGreaterThanOrEqual(0);
  }
  for (const [tileId, own] of Object.entries(s.ownership)) {
    expect(own.houses, `${where}: 地块 ${tileId} 房子数量非法`).toBeGreaterThanOrEqual(0);
    expect(own.houses, `${where}: 地块 ${tileId} 房子数量非法`).toBeLessThanOrEqual(5);
    if (own.owner) {
      const owner = s.players.find((p) => p.id === own.owner);
      expect(owner, `${where}: 地块 ${tileId} 属于未知玩家`).toBeDefined();
      expect(owner!.bankrupt, `${where}: 地块 ${tileId} 属于破产玩家`).toBe(false);
    }
  }
}

describe('AI 自动对局模拟', () => {
  test(
    '4 个 AI 连打 100 局, 全部正常终局且无非法状态',
    () => {
      let finishedByBankruptcy = 0;
      for (let game = 0; game < 100; game++) {
        const rng = mulberry32(1000 + game);
        let s = createGame(AI_SEATS, { maxTurns: 500 }, rng);
        let step = 0;

        while (s.phase !== 'game-over') {
          step += 1;
          expect(step, `第 ${game} 局超过步数上限, 疑似死循环`).toBeLessThan(40000);

          const actors = new Set(whoMustAct(s));
          if (s.trade) actors.add(s.trade.to);

          let acted = false;
          for (const id of actors) {
            const action = decideAction(s, id);
            if (!action) continue;
            const r = applyAction(s, id, action, rng);
            expect(
              r.ok,
              `第 ${game} 局第 ${step} 步: ${id} 的 ${action.type} 被拒: ${r.ok ? '' : r.error}`,
            ).toBe(true);
            if (r.ok) s = r.state;
            acted = true;
            break;
          }
          expect(acted, `第 ${game} 局第 ${step} 步: 无人能行动, 流程卡死 (phase=${s.phase})`).toBe(true);

          if (step % 50 === 0) checkInvariants(s, game, step);
        }

        checkInvariants(s, game, step);
        expect(s.winner, `第 ${game} 局没有胜者`).not.toBeNull();
        const alive = s.players.filter((p) => !p.bankrupt);
        if (alive.length === 1) finishedByBankruptcy += 1;
      }
      // 至少要有相当比例的对局是真刀真枪打到破产结束的
      expect(finishedByBankruptcy).toBeGreaterThan(20);
    },
    300_000,
  );
});
