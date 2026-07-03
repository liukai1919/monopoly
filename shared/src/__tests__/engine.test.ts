import { describe, expect, test } from 'vitest';
import {
  BOARD, CHANCE_CARDS, CHEST_CARDS, applyAction, canBuild, computeRent, createGame,
  groupTiles, isOwnable,
} from '../index';
import type { Action, GameState, RNG, SeatInfo } from '../index';

const SEATS: SeatInfo[] = [
  { id: 'a', name: '安娜', emoji: '🍁', color: '#e74c3c', isAi: false },
  { id: 'b', name: '本', emoji: '🦫', color: '#3498db', isAi: false },
  { id: 'c', name: '瓷瓷', emoji: '🏒', color: '#27ae60', isAi: false },
];

function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 依次返回指定骰面的 RNG (1-6) */
function diceRng(...faces: number[]): RNG {
  let i = 0;
  return () => {
    const face = faces[i++];
    if (face == null) throw new Error('diceRng 用完了');
    return (face - 1) / 6 + 1e-9;
  };
}

function newGame(n = 2, settings: Parameters<typeof createGame>[1] = {}): GameState {
  return createGame(SEATS.slice(0, n), settings, mulberry32(42));
}

function mustApply(s: GameState, pid: string, action: Action, rng?: RNG): GameState {
  const r = applyAction(s, pid, action, rng);
  if (!r.ok) throw new Error(`${action.type} 失败: ${r.error}`);
  return r.state;
}

function player(s: GameState, id: string) {
  return s.players.find((p) => p.id === id)!;
}

describe('棋盘与卡牌数据', () => {
  test('40 格, id 与索引一致', () => {
    expect(BOARD).toHaveLength(40);
    BOARD.forEach((t, i) => expect(t.id).toBe(i));
  });
  test('每个格子都有 instruction 说明', () => {
    expect(BOARD.every((t) => t.instruction.trim().length > 0)).toBe(true);
  });
  test('22 块地产 / 4 铁路 / 2 公用 / 8 色组', () => {
    const props = BOARD.filter((t) => t.type === 'property');
    expect(props).toHaveLength(22);
    expect(BOARD.filter((t) => t.type === 'railroad')).toHaveLength(4);
    expect(BOARD.filter((t) => t.type === 'utility')).toHaveLength(2);
    const groups = new Set(props.map((t) => (t.type === 'property' ? t.group : '')));
    expect(groups.size).toBe(8);
  });
  test('机会/宝箱各 16 张', () => {
    expect(CHANCE_CARDS).toHaveLength(16);
    expect(CHEST_CARDS).toHaveLength(16);
  });
});

describe('移动与起点薪水', () => {
  test('经过起点领 $200, 落在无主地进入购买阶段', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 38 + 3 = 1
    expect(player(s, 'a').position).toBe(1);
    expect(player(s, 'a').cash).toBe(1700);
    expect(s.phase).toBe('awaiting-buy');
    expect(s.pendingBuyTile).toBe(1);
  });

  test('购买后进入 manage 阶段', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2));
    s = mustApply(s, 'a', { type: 'buy' });
    expect(s.ownership[1]!.owner).toBe('a');
    expect(player(s, 'a').cash).toBe(1700 - 60);
    expect(s.phase).toBe('manage');
  });
});

describe('租金', () => {
  test('基础租金 / 垄断双倍 / 有房按表', () => {
    const s = newGame();
    s.ownership[1]!.owner = 'b';
    expect(computeRent(s, 1, 7)).toBe(2);
    s.ownership[3]!.owner = 'b'; // 集齐棕色
    expect(computeRent(s, 1, 7)).toBe(4);
    s.ownership[1]!.houses = 3;
    expect(computeRent(s, 1, 7)).toBe(90);
    s.ownership[1]!.houses = 5;
    expect(computeRent(s, 1, 7)).toBe(250);
    s.ownership[1]!.mortgaged = true;
    expect(computeRent(s, 1, 7)).toBe(0);
  });

  test('铁路按拥有数量翻倍', () => {
    const s = newGame();
    s.ownership[5]!.owner = 'b';
    expect(computeRent(s, 5, 7)).toBe(25);
    s.ownership[15]!.owner = 'b';
    expect(computeRent(s, 5, 7)).toBe(50);
    s.ownership[25]!.owner = 'b';
    s.ownership[35]!.owner = 'b';
    expect(computeRent(s, 5, 7)).toBe(200);
    expect(computeRent(s, 5, 7, { railDouble: true })).toBe(400);
  });

  test('公用事业 4 倍 / 10 倍骰点', () => {
    const s = newGame();
    s.ownership[12]!.owner = 'b';
    expect(computeRent(s, 12, 7)).toBe(28);
    s.ownership[28]!.owner = 'b';
    expect(computeRent(s, 12, 7)).toBe(70);
  });

  test('落在别人地上自动付租', () => {
    let s = newGame();
    s.ownership[6]!.owner = 'b'; // 蒙克顿, 租金 6
    player(s, 'a').position = 4;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 1)); // → 6, 双数
    expect(player(s, 'a').cash).toBe(1494);
    expect(player(s, 'b').cash).toBe(1506);
    expect(s.phase).toBe('awaiting-roll'); // 双数再掷
  });
});

describe('双数与监狱', () => {
  test('连掷三次双数直接入狱', () => {
    let s = newGame();
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(2, 2)); // → 4 所得税
    expect(s.phase).toBe('awaiting-roll');
    expect(s.doublesCount).toBe(1);
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(3, 3)); // → 10 探监
    expect(s.doublesCount).toBe(2);
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 1)); // 第三次!
    expect(player(s, 'a').inJail).toBe(true);
    expect(player(s, 'a').position).toBe(10);
    expect(s.phase).toBe('manage');
  });

  test('交 $50 保释后正常掷骰', () => {
    let s = newGame();
    player(s, 'a').inJail = true;
    player(s, 'a').position = 10;
    s = mustApply(s, 'a', { type: 'jail-pay' });
    expect(player(s, 'a').cash).toBe(1450);
    expect(player(s, 'a').inJail).toBe(false);
    expect(s.phase).toBe('awaiting-roll');
  });

  test('掷出双数出狱, 但不能再掷', () => {
    let s = newGame();
    player(s, 'a').inJail = true;
    player(s, 'a').position = 10;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(4, 4)); // → 18 无主
    expect(player(s, 'a').inJail).toBe(false);
    expect(player(s, 'a').position).toBe(18);
    expect(s.phase).toBe('awaiting-buy');
    s = mustApply(s, 'a', { type: 'buy' });
    expect(s.phase).toBe('manage'); // 出狱双数不给续掷
  });

  test('第三次没掷出双数, 强制交钱出狱并移动', () => {
    let s = newGame();
    player(s, 'a').inJail = true;
    player(s, 'a').position = 10;
    player(s, 'a').jailTurns = 2;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 13 无主
    expect(player(s, 'a').inJail).toBe(false);
    expect(player(s, 'a').cash).toBe(1450);
    expect(player(s, 'a').position).toBe(13);
    expect(s.phase).toBe('awaiting-buy');
  });

  test('没掷出双数继续蹲监狱', () => {
    let s = newGame();
    player(s, 'a').inJail = true;
    player(s, 'a').position = 10;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2));
    expect(player(s, 'a').inJail).toBe(true);
    expect(player(s, 'a').jailTurns).toBe(1);
    expect(s.phase).toBe('manage');
  });

  test('使用出狱卡', () => {
    let s = newGame();
    player(s, 'a').inJail = true;
    player(s, 'a').jailCards = ['chance'];
    const deckLen = s.chanceDeck.length;
    s = mustApply(s, 'a', { type: 'jail-card' });
    expect(player(s, 'a').inJail).toBe(false);
    expect(player(s, 'a').jailCards).toHaveLength(0);
    expect(s.chanceDeck.length).toBe(deckLen + 1); // 卡还回牌堆
  });
});

describe('盖房规则', () => {
  function withBrown(s: GameState): GameState {
    s.ownership[1]!.owner = 'a';
    s.ownership[3]!.owner = 'a';
    return s;
  }

  test('未集齐同色不能盖', () => {
    const s = newGame();
    s.ownership[1]!.owner = 'a';
    expect(canBuild(s, 'a', 1)).toContain('集齐');
  });

  test('必须均衡建造', () => {
    let s = withBrown(newGame());
    s = mustApply(s, 'a', { type: 'build', tileId: 1 });
    expect(s.ownership[1]!.houses).toBe(1);
    expect(s.housesRemaining).toBe(31);
    const r = applyAction(s, 'a', { type: 'build', tileId: 1 });
    expect(r.ok).toBe(false); // 3 号还没盖
    s = mustApply(s, 'a', { type: 'build', tileId: 3 });
    s = mustApply(s, 'a', { type: 'build', tileId: 1 });
    expect(player(s, 'a').cash).toBe(1500 - 150);
  });

  test('第五栋升级酒店, 归还 4 栋房', () => {
    let s = withBrown(newGame());
    s.ownership[1]!.houses = 4;
    s.ownership[3]!.houses = 4;
    s.housesRemaining = 24;
    s = mustApply(s, 'a', { type: 'build', tileId: 1 });
    expect(s.ownership[1]!.houses).toBe(5);
    expect(s.hotelsRemaining).toBe(11);
    expect(s.housesRemaining).toBe(28);
  });

  test('同色组有抵押不能盖房', () => {
    const s = withBrown(newGame());
    s.ownership[3]!.mortgaged = true;
    expect(canBuild(s, 'a', 1)).toContain('抵押');
  });

  test('卖房半价回收', () => {
    let s = withBrown(newGame());
    s.ownership[1]!.houses = 1;
    s.housesRemaining = 31;
    s = mustApply(s, 'a', { type: 'sell-house', tileId: 1 });
    expect(player(s, 'a').cash).toBe(1525);
    expect(s.housesRemaining).toBe(32);
  });
});

describe('抵押与赎回', () => {
  test('抵押得半价, 赎回付 110%', () => {
    let s = newGame();
    s.ownership[39]!.owner = 'a';
    s = mustApply(s, 'a', { type: 'mortgage', tileId: 39 });
    expect(player(s, 'a').cash).toBe(1700);
    expect(s.ownership[39]!.mortgaged).toBe(true);
    s = mustApply(s, 'a', { type: 'unmortgage', tileId: 39 });
    expect(player(s, 'a').cash).toBe(1700 - 220);
    expect(s.ownership[39]!.mortgaged).toBe(false);
  });
});

describe('债务与破产', () => {
  test('现金不足时挂账, 抵押后自动付清', () => {
    let s = newGame();
    player(s, 'a').cash = 100;
    s.ownership[39]!.owner = 'a';
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3)); // → 4 所得税 $200
    expect(s.phase).toBe('awaiting-debt');
    expect(s.debts[0]!.amount).toBe(200);
    s = mustApply(s, 'a', { type: 'mortgage', tileId: 39 });
    expect(s.debts).toHaveLength(0);
    expect(player(s, 'a').cash).toBe(100);
    expect(s.phase).toBe('manage');
  });

  test('资不抵债破产, 资产移交债主, 剩一人获胜', () => {
    let s = newGame();
    player(s, 'a').cash = 10;
    s.ownership[39]!.owner = 'b';
    s.ownership[39]!.houses = 5;
    player(s, 'a').position = 35;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3)); // → 39, 酒店租金 $2000
    expect(s.phase).toBe('awaiting-debt');
    s = mustApply(s, 'a', { type: 'declare-bankruptcy' });
    expect(player(s, 'a').bankrupt).toBe(true);
    expect(player(s, 'b').cash).toBe(1510);
    expect(s.phase).toBe('game-over');
    expect(s.winner).toBe('b');
  });

  test('欠银行破产, 地产逐一拍卖', () => {
    let s = newGame(3);
    player(s, 'a').cash = 10;
    s.ownership[39]!.owner = 'a';
    s.debts.push({ debtor: 'a', creditor: null, amount: 500, reason: '测试' });
    s.phase = 'awaiting-debt';
    s = mustApply(s, 'a', { type: 'declare-bankruptcy' });
    expect(player(s, 'a').bankrupt).toBe(true);
    expect(s.phase).toBe('auction');
    expect(s.auction!.tileId).toBe(39);
    // b 出价, c 放弃 → b 得
    s = mustApply(s, s.auction!.turn, { type: 'bid', amount: 50 });
    s = mustApply(s, s.auction!.turn, { type: 'pass-bid' });
    expect(s.ownership[39]!.owner).toBe('b');
    expect(player(s, 'b').cash).toBe(1450);
    expect(s.phase).toBe('awaiting-roll'); // a 破产, 轮到 b
    expect(s.currentPlayer).toBe('b');
  });
});

describe('拍卖', () => {
  test('放弃购买进入拍卖, 轮流出价', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 1
    s = mustApply(s, 'a', { type: 'decline-buy' });
    expect(s.phase).toBe('auction');
    expect(s.auction!.turn).toBe('b'); // 从当前玩家的下家开始
    s = mustApply(s, 'b', { type: 'bid', amount: 10 });
    s = mustApply(s, 'a', { type: 'bid', amount: 20 });
    s = mustApply(s, 'b', { type: 'pass-bid' });
    expect(s.ownership[1]!.owner).toBe('a');
    expect(player(s, 'a').cash).toBe(1700 - 20);
    expect(s.phase).toBe('manage');
  });

  test('全员弃拍则流拍', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2));
    s = mustApply(s, 'a', { type: 'decline-buy' });
    s = mustApply(s, 'b', { type: 'pass-bid' });
    s = mustApply(s, 'a', { type: 'pass-bid' });
    expect(s.ownership[1]!.owner).toBeNull();
    expect(s.phase).toBe('manage');
  });
});

describe('交易', () => {
  test('完整交易流程', () => {
    let s = newGame();
    s.ownership[39]!.owner = 'a';
    s.ownership[5]!.owner = 'b';
    s = mustApply(s, 'a', {
      type: 'propose-trade', to: 'b',
      give: { cash: 100, properties: [39], jailCards: 0 },
      get: { cash: 0, properties: [5], jailCards: 0 },
    });
    expect(s.trade).not.toBeNull();
    s = mustApply(s, 'b', { type: 'respond-trade', accept: true });
    expect(s.ownership[39]!.owner).toBe('b');
    expect(s.ownership[5]!.owner).toBe('a');
    expect(player(s, 'a').cash).toBe(1400);
    expect(player(s, 'b').cash).toBe(1600);
    expect(s.trade).toBeNull();
  });

  test('同色组有建筑的地不能交易', () => {
    const s = newGame();
    s.ownership[1]!.owner = 'a';
    s.ownership[3]!.owner = 'a';
    s.ownership[3]!.houses = 2;
    const r = applyAction(s, 'a', {
      type: 'propose-trade', to: 'b',
      give: { cash: 0, properties: [1], jailCards: 0 },
      get: { cash: 50, properties: [], jailCards: 0 },
    });
    expect(r.ok).toBe(false);
  });
});

describe('卡牌效果', () => {
  test('前进到起点领 $200', () => {
    let s = newGame();
    player(s, 'a').position = 4;
    s.chanceDeck = [0, ...s.chanceDeck.filter((id) => id !== 0)];
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 7 机会
    expect(s.phase).toBe('awaiting-card');
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(player(s, 'a').position).toBe(0);
    expect(player(s, 'a').cash).toBe(1700);
    expect(s.phase).toBe('manage');
  });

  test('最近铁路付双倍租金', () => {
    let s = newGame();
    s.ownership[15]!.owner = 'b';
    player(s, 'a').position = 4;
    s.chanceDeck = [4, ...s.chanceDeck.filter((id) => id !== 4)];
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 7 机会 → 15 铁路
    expect(s.phase).toBe('awaiting-card');
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(player(s, 'a').position).toBe(15);
    expect(player(s, 'a').cash).toBe(1450); // 25 × 2 = 50
    expect(player(s, 'b').cash).toBe(1550);
  });

  test('房屋维修按建筑收费', () => {
    let s = newGame();
    s.ownership[1]!.owner = 'a';
    s.ownership[1]!.houses = 3;
    s.ownership[3]!.owner = 'a';
    s.ownership[3]!.houses = 5;
    player(s, 'a').position = 39;
    s.chestDeck = [113, ...s.chestDeck.filter((id) => id !== 113)];
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 2 宝箱
    expect(s.phase).toBe('awaiting-card');
    s = mustApply(s, 'a', { type: 'draw-card' });
    // 3×$40 + $115 = $235, 途中经过起点 +$200
    expect(player(s, 'a').cash).toBe(1500 + 200 - 235);
  });

  test('抽到出狱卡保留, 不回牌堆', () => {
    let s = newGame();
    player(s, 'a').position = 4;
    s.chanceDeck = [8, ...s.chanceDeck.filter((id) => id !== 8)];
    const deckLen = s.chanceDeck.length;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 7 机会
    expect(s.phase).toBe('awaiting-card');
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(player(s, 'a').jailCards).toEqual(['chance']);
    expect(s.chanceDeck.length).toBe(deckLen - 1);
  });

  test('生日: 每位玩家给你 $10', () => {
    let s = newGame(3);
    player(s, 'a').position = 39;
    s.chestDeck = [108, ...s.chestDeck.filter((id) => id !== 108)];
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 2 宝箱
    expect(s.phase).toBe('awaiting-card');
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(player(s, 'a').cash).toBe(1500 + 200 + 20);
    expect(player(s, 'b').cash).toBe(1490);
    expect(player(s, 'c').cash).toBe(1490);
  });
});

describe('房规与结算', () => {
  test('免费停车奖池', () => {
    let s = newGame(2, { freeParkingPot: true });
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3)); // → 4 所得税
    expect(s.pot).toBe(200);
    s = mustApply(s, 'a', { type: 'end-turn' });
    player(s, 'b').position = 16;
    s = mustApply(s, 'b', { type: 'roll' }, diceRng(1, 3)); // → 20 免费停车
    expect(player(s, 'b').cash).toBe(1700);
    expect(s.pot).toBe(0);
  });

  test('回合上限按净资产分胜负', () => {
    let s = newGame(2, { maxTurns: 2 });
    s.ownership[39]!.owner = 'a';
    player(s, 'a').position = 15;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(2, 3)); // → 20
    s = mustApply(s, 'a', { type: 'end-turn' });
    player(s, 'b').position = 15;
    s = mustApply(s, 'b', { type: 'roll' }, diceRng(2, 3));
    s = mustApply(s, 'b', { type: 'end-turn' });
    expect(s.phase).toBe('game-over');
    expect(s.winner).toBe('a'); // a 多一块多伦多
  });
});

describe('数据完整性', () => {
  test('每个可购地块都有所有权记录', () => {
    const s = newGame();
    for (const tile of BOARD) {
      if (isOwnable(tile)) expect(s.ownership[tile.id]).toBeDefined();
    }
  });
  test('色组地块数正确', () => {
    expect(groupTiles('brown')).toHaveLength(2);
    expect(groupTiles('darkblue')).toHaveLength(2);
    expect(groupTiles('red')).toHaveLength(3);
  });
});
