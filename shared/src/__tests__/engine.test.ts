import { describe, expect, test } from 'vitest';
import {
  BOARD, CHANCE_CARDS, CHEST_CARDS, ETF_DEFINITIONS, applyAction, buildSettlementReport, canBuild,
  computeRent, createGame, etfUnrealizedCents, groupTiles, isOwnable, netWorth, settleGame,
} from '../index';
import { recordMarketEvent } from '../market';
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
  test('每个可交易经济地块都有产业标签', () => {
    expect(BOARD.filter((t) => isOwnable(t) || t.type === 'tax').every((t) => t.industries.length > 0)).toBe(true);
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
    s.debts.push({ debtor: 'a', creditor: null, amount: 500, reason: '测试', kind: 'other' });
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

describe('股票市场数据联动', () => {
  test('开局初始化 ETF 与玩家空持仓', () => {
    const s = newGame(3);
    expect(Object.keys(s.market.etfs)).toEqual(Object.keys(ETF_DEFINITIONS));
    expect(s.market.regime).toBe('neutral');
    for (const p of s.players) {
      expect(s.portfolios[p.id]).toBeDefined();
      expect(Object.values(s.portfolios[p.id]!)).toEqual(Object.keys(ETF_DEFINITIONS).map(() => 0));
    }
  });

  test('购买城市地产产生对应产业的多头事件', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 1 圣约翰斯
    s = mustApply(s, 'a', { type: 'buy' });
    const events = s.market.recentEvents.filter((e) => e.kind === 'property-bought');
    expect(events.map((e) => e.industry).sort()).toEqual(['logistics', 'tourism']);
    expect(events.every((e) => e.polarity === 'bullish')).toBe(true);
    expect(s.market.signals.logistics).toBeGreaterThan(0);
    expect(s.market.signals.tourism).toBeGreaterThan(0);
  });

  test('market event ids stay unique after trimming recent events', () => {
    const s = newGame();
    for (let i = 0; i < 20; i++) {
      recordMarketEvent(s, {
        kind: 'etf-bought',
        polarity: 'bullish',
        playerId: 'a',
        amount: 100 + i,
        industries: ['realEstate'],
      });
    }
    const ids = s.market.recentEvents.map((e) => e.id);
    expect(s.market.recentEvents).toHaveLength(16);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.market.nextEventId).toBe(21);
  });

  test('高额租金推动地块产业, 抵押压制金融', () => {
    let s = newGame();
    s.ownership[39]!.owner = 'b';
    s.ownership[39]!.houses = 5;
    player(s, 'a').cash = 3000;
    player(s, 'a').position = 35;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3)); // → 39 多伦多
    const rentEvents = s.market.recentEvents.filter((e) => e.kind === 'rent-paid');
    expect(rentEvents.map((e) => e.industry).sort()).toEqual(['finance', 'realEstate']);
    expect(s.market.signals.finance).toBeGreaterThan(0);
    expect(s.market.signals.realEstate).toBeGreaterThan(0);

    s.ownership[1]!.owner = 'a';
    s = mustApply(s, 'a', { type: 'mortgage', tileId: 1 });
    const mortgageEvent = s.market.recentEvents.find((e) => e.kind === 'mortgage');
    expect(mortgageEvent?.industry).toBe('finance');
    expect(mortgageEvent?.polarity).toBe('bearish');
  });

  test('卖房产生地产利空事件', () => {
    let s = newGame();
    s.ownership[1]!.owner = 'a';
    s.ownership[3]!.owner = 'a';
    s.ownership[1]!.houses = 1;
    s.housesRemaining = 31;
    s = mustApply(s, 'a', { type: 'sell-house', tileId: 1 });
    const sellEvents = s.market.recentEvents.filter((e) => e.kind === 'sell-house');
    expect(sellEvents.some((e) => e.industry === 'realEstate')).toBe(true);
    expect(sellEvents.every((e) => e.polarity === 'bearish')).toBe(true);
    expect(s.market.signals.realEstate).toBeLessThan(0);
  });

  test('市场价格和衰减只在完整轮转结束时结算', () => {
    let s = newGame(2);
    s.market.signals.realEstate = 2;
    s.phase = 'manage';
    s = mustApply(s, 'a', { type: 'end-turn' });
    expect(s.currentPlayer).toBe('b');
    expect(s.market.etfs['CAN-REAL'].priceCents).toBe(10000);
    expect(s.market.signals.realEstate).toBe(2);

    s.phase = 'manage';
    s = mustApply(s, 'b', { type: 'end-turn' });
    expect(s.currentPlayer).toBe('a');
    expect(s.market.etfs['CAN-REAL'].priceCents).toBeGreaterThan(10000);
    expect(s.market.signals.realEstate).toBe(1.7);
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

  test('host can settle by net worth immediately', () => {
    const s = newGame(2);
    s.ownership[39]!.owner = 'a';
    s.portfolios.b!['CAN-REAL'] = 1;

    const r = settleGame(s);

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.phase).toBe('game-over');
    expect(r.state.winner).toBe('a');
    expect(r.events).toContainEqual({ type: 'game-over', winner: 'a' });
    expect(s.phase).toBe('awaiting-roll');
  });

  test('host settlement waits for pending decisions', () => {
    let s = newGame(2);
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2));

    const r = settleGame(s);

    expect(r.ok).toBe(false);
  });
});

describe('动画事件流 (cash / monopoly / bankrupt)', () => {
  test('付租金广播 cash 事件, 带双方与地块', () => {
    const s = newGame();
    s.ownership[6]!.owner = 'b';
    player(s, 'a').position = 4;
    const r = applyAction(s, 'a', { type: 'roll' }, diceRng(1, 1)); // → 6 蒙克顿
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ type: 'cash', from: 'a', to: 'b', amount: 6, tileId: 6 });
  });

  test('经过起点的薪水广播银行入账事件', () => {
    const s = newGame();
    player(s, 'a').position = 38;
    const r = applyAction(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 38 → 1
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ type: 'cash', from: null, to: 'a', amount: 200, tileId: 0 });
  });

  test('买地扣款, 集齐色组时广播垄断事件', () => {
    let s = newGame();
    s.ownership[1]!.owner = 'a';
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 0 → 3 夏洛特敦
    const r = applyAction(s, 'a', { type: 'buy' });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ type: 'cash', from: 'a', to: null, amount: 60, tileId: 3 });
    expect(r.events).toContainEqual({ type: 'monopoly', playerId: 'a', group: 'brown' });
  });

  test('破产广播 bankrupt 事件, 现金移交也事件化', () => {
    const s = newGame();
    player(s, 'a').cash = 50;
    s.debts.push({ debtor: 'a', creditor: 'b', amount: 10_000, reason: '测试', kind: 'other' });
    s.phase = 'awaiting-debt';
    const r = applyAction(s, 'a', { type: 'declare-bankruptcy' });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ type: 'bankrupt', playerId: 'a', creditorId: 'b' });
    expect(r.events).toContainEqual({ type: 'cash', from: 'a', to: 'b', amount: 50 });
  });

  test('交易中的现金广播 cash 事件', () => {
    let s = newGame();
    s.ownership[5]!.owner = 'b';
    s = mustApply(s, 'a', {
      type: 'propose-trade', to: 'b',
      give: { cash: 100, properties: [], jailCards: 0 },
      get: { cash: 0, properties: [5], jailCards: 0 },
    });
    const r = applyAction(s, 'b', { type: 'respond-trade', accept: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.events).toContainEqual({ type: 'cash', from: 'a', to: 'b', amount: 100 });
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

describe('终局统计', () => {
  test('租金双边记账, biggestRent 只记最大一笔, 过起点记薪水', () => {
    let s = newGame();
    s.ownership[39]!.owner = 'b';
    s.ownership[1]!.owner = 'b';
    player(s, 'a').position = 36;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 39 多伦多, 租金 50
    expect(s.stats.players.a!.rentPaid).toBe(50);
    expect(s.stats.players.b!.rentReceived).toBe(50);
    expect(s.stats.biggestRent).toEqual({ payerId: 'a', ownerId: 'b', tileId: 39, amount: 50 });

    s.phase = 'awaiting-roll';
    s.dice = null;
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 过起点 → 1 圣约翰斯, 租金 2
    expect(s.stats.players.a!.rentPaid).toBe(52);
    expect(s.stats.players.b!.rentReceived).toBe(52);
    expect(s.stats.players.a!.salaryReceived).toBe(200);
    expect(s.stats.biggestRent!.amount).toBe(50); // 更小的租金不顶替
  });

  test('租金走欠债路径结清后仍按 rent 归类', () => {
    let s = newGame();
    s.ownership[39]!.owner = 'b';
    s.ownership[1]!.owner = 'a';
    s.ownership[3]!.owner = 'a';
    player(s, 'a').cash = 10;
    player(s, 'a').position = 36;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 租金 50 > 现金 10
    expect(s.phase).toBe('awaiting-debt');
    expect(s.debts[0]).toMatchObject({ kind: 'rent', tileId: 39 });
    s = mustApply(s, 'a', { type: 'mortgage', tileId: 1 });  // +30, 仍不够
    s = mustApply(s, 'a', { type: 'mortgage', tileId: 3 });  // +30, 结清
    expect(s.debts).toHaveLength(0);
    expect(s.stats.players.a!.rentPaid).toBe(50);
    expect(s.stats.players.b!.rentReceived).toBe(50);
    expect(s.stats.biggestRent).toEqual({ payerId: 'a', ownerId: 'b', tileId: 39, amount: 50 });
  });

  test('税款与保释金计入 taxesPaid', () => {
    let s = newGame();
    player(s, 'a').position = 1;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 4 所得税 $200
    expect(s.stats.players.a!.taxesPaid).toBe(200);

    s.phase = 'awaiting-roll';
    s.dice = null;
    player(s, 'a').inJail = true;
    player(s, 'a').position = 10;
    s = mustApply(s, 'a', { type: 'jail-pay' });
    expect(s.stats.players.a!.taxesPaid).toBe(250);
  });

  test('卡牌收支与 biggestWindfall', () => {
    let s = newGame();
    s.phase = 'awaiting-card';
    s.pendingCard = { playerId: 'a', deck: 'chance', diceSum: 5, tileId: 7 };
    s.chanceDeck = [7]; // 银行派发股息, 收 $50
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(s.stats.players.a!.cardGains).toBe(50);
    expect(s.stats.biggestWindfall).toMatchObject({ playerId: 'a', amount: 50 });

    s.phase = 'awaiting-card';
    s.pendingCard = { playerId: 'a', deck: 'chance', diceSum: 5, tileId: 7 };
    s.chanceDeck = [12]; // 超速罚款 $15
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(s.stats.players.a!.cardLosses).toBe(15);
  });

  test('生日礼金双边按 gift 归类', () => {
    let s = newGame(3);
    s.phase = 'awaiting-card';
    s.pendingCard = { playerId: 'a', deck: 'chest', diceSum: 5, tileId: 17 };
    s.chestDeck = [108]; // 生日, 每位玩家给你 $10
    s = mustApply(s, 'a', { type: 'draw-card' });
    expect(s.stats.players.a!.cardGains).toBe(20);
    expect(s.stats.players.b!.cardLosses).toBe(10);
    expect(s.stats.players.c!.cardLosses).toBe(10);
  });

  test('三种入狱各计一次 jailVisits, 蹲狱不计', () => {
    let s = newGame();
    player(s, 'a').position = 27;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 30 入狱格
    expect(s.stats.players.a!.jailVisits).toBe(1);

    s.phase = 'awaiting-roll';
    s.dice = null;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // 没掷双数, 继续蹲
    expect(s.stats.players.a!.jailVisits).toBe(1);

    // 三连双入狱
    let s2 = newGame();
    s2.ownership[14]!.owner = 'a';
    player(s2, 'a').position = 8;
    s2 = mustApply(s2, 'a', { type: 'roll' }, diceRng(1, 1)); // → 10 探监
    s2 = mustApply(s2, 'a', { type: 'roll' }, diceRng(2, 2)); // → 14 自己的地
    s2 = mustApply(s2, 'a', { type: 'roll' }, diceRng(3, 3)); // 三连双 → 入狱
    expect(s2.stats.players.a!.jailVisits).toBe(1);

    // 卡牌入狱
    let s3 = newGame();
    s3.phase = 'awaiting-card';
    s3.pendingCard = { playerId: 'a', deck: 'chance', diceSum: 5, tileId: 7 };
    s3.chanceDeck = [10];
    s3 = mustApply(s3, 'a', { type: 'draw-card' });
    expect(s3.stats.players.a!.jailVisits).toBe(1);
  });

  test('ETF 平均成本法: 部分卖出与全部卖出', () => {
    let s = newGame();
    s.market.etfs['CAN-REAL']!.priceCents = 10_000;
    s = mustApply(s, 'a', { type: 'buy-etf', etfId: 'CAN-REAL', shares: 2 }); // 成本 20600 分
    const st = () => s.stats.players.a!.etf;
    expect(st().costCents['CAN-REAL']).toBe(20_600);
    expect(st().investedCents).toBe(20_600);

    s.market.etfs['CAN-REAL']!.priceCents = 15_000;
    s = mustApply(s, 'a', { type: 'sell-etf', etfId: 'CAN-REAL', shares: 1 }); // 净得 $145
    expect(st().costCents['CAN-REAL']).toBe(10_300);
    expect(st().realizedCents).toBe(14_500 - 10_300);
    expect(etfUnrealizedCents(s, 'a')).toBe(15_000 - 10_300);

    s = mustApply(s, 'a', { type: 'sell-etf', etfId: 'CAN-REAL', shares: 1 }); // 全部卖出
    expect(st().costCents['CAN-REAL']).toBe(0); // 基准精确清零
    expect(st().realizedCents).toBe((14_500 - 10_300) * 2);
    expect(etfUnrealizedCents(s, 'a')).toBe(0);
  });

  test('破产: ETF 基准随资产转给债权人, bankruptAtTurn 落值', () => {
    let s = newGame();
    s.market.etfs['CAN-REAL']!.priceCents = 10_000;
    s = mustApply(s, 'a', { type: 'buy-etf', etfId: 'CAN-REAL', shares: 2 });
    player(s, 'a').cash = 0;
    s.debts.push({ debtor: 'a', creditor: 'b', amount: 10_000, reason: '测试', kind: 'other' });
    s.phase = 'awaiting-debt';
    s = mustApply(s, 'a', { type: 'declare-bankruptcy' });
    expect(s.portfolios.b!['CAN-REAL']).toBe(2);
    expect(s.stats.players.b!.etf.costCents['CAN-REAL']).toBe(20_600);
    expect(s.stats.players.a!.etf.costCents['CAN-REAL']).toBe(0);
    expect(s.stats.players.a!.bankruptAtTurn).toBe(s.turnCount);
    // 两人局 → 直接终局, 终局快照: 破产者 0
    expect(s.phase).toBe('game-over');
    const last = s.stats.netWorthHistory.at(-1)!;
    expect(last[0]).toBe(0);
    expect(last[1]).toBe(netWorth(s, 'b'));
  });

  test('破产归银行: ETF 基准计为全额已实现亏损', () => {
    let s = newGame(3);
    s.market.etfs['CAN-REAL']!.priceCents = 10_000;
    s = mustApply(s, 'a', { type: 'buy-etf', etfId: 'CAN-REAL', shares: 2 });
    player(s, 'a').cash = 0;
    s.debts.push({ debtor: 'a', creditor: null, amount: 10_000, reason: '测试', kind: 'other' });
    s.phase = 'awaiting-debt';
    s = mustApply(s, 'a', { type: 'declare-bankruptcy' });
    expect(s.stats.players.a!.etf.realizedCents).toBe(-20_600);
    expect(s.stats.players.a!.etf.costCents['CAN-REAL']).toBe(0);
  });

  test('拍卖: auctionWins / propertiesBought / bestAuction', () => {
    let s = newGame(3);
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2)); // → 1 无主
    s = mustApply(s, 'a', { type: 'decline-buy' });
    expect(s.phase).toBe('auction');
    s = mustApply(s, 'b', { type: 'bid', amount: 30 });
    s = mustApply(s, 'c', { type: 'pass-bid' });
    s = mustApply(s, 'a', { type: 'pass-bid' });
    expect(s.ownership[1]!.owner).toBe('b');
    expect(s.stats.players.b!.auctionWins).toBe(1);
    expect(s.stats.players.b!.propertiesBought).toBe(1);
    expect(s.stats.bestAuction).toEqual({ winnerId: 'b', tileId: 1, bid: 30, listPrice: 60 });
  });

  test('直购计入 propertiesBought', () => {
    let s = newGame();
    player(s, 'a').position = 38;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 2));
    s = mustApply(s, 'a', { type: 'buy' });
    expect(s.stats.players.a!.propertiesBought).toBe(1);
  });

  test('netWorthHistory: 开局一行, 每整轮一行, 手动结算补终局行', () => {
    let s = newGame();
    expect(s.stats.netWorthHistory).toEqual([[1500, 1500]]);

    player(s, 'a').position = 16;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3)); // → 20 免费停车
    s = mustApply(s, 'a', { type: 'end-turn' });
    expect(s.stats.netWorthHistory).toHaveLength(1); // 半轮不快照
    player(s, 'b').position = 16;
    s = mustApply(s, 'b', { type: 'roll' }, diceRng(1, 3));
    s = mustApply(s, 'b', { type: 'end-turn' }); // 回到 a → 整轮
    expect(s.stats.netWorthHistory).toHaveLength(2);
    expect(s.stats.netWorthHistory[1]).toEqual([1500, 1500]);

    const r = settleGame(s);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.stats.netWorthHistory).toHaveLength(3);
    expect(r.state.stats.netWorthHistory.at(-1)).toEqual([
      netWorth(r.state, 'a'), netWorth(r.state, 'b'),
    ]);
  });

  test('回合上限终局也补快照', () => {
    let s = newGame(2, { maxTurns: 1 });
    player(s, 'a').position = 16;
    s = mustApply(s, 'a', { type: 'roll' }, diceRng(1, 3));
    s = mustApply(s, 'a', { type: 'end-turn' });
    expect(s.phase).toBe('game-over');
    expect(s.stats.netWorthHistory).toHaveLength(2);
  });

  test('buildSettlementReport: 排名/明细/称号省略', () => {
    let s = newGame(3);
    s.ownership[39]!.owner = 'a';
    s.ownership[1]!.owner = 'a';
    s.ownership[1]!.mortgaged = true;
    player(s, 'b').bankrupt = true;
    s.stats.players.b!.bankruptAtTurn = 5;
    player(s, 'c').bankrupt = true;
    s.stats.players.c!.bankruptAtTurn = 9;
    s.winner = 'a';
    s.phase = 'game-over';

    const report = buildSettlementReport(s);
    expect(report.ranking.map((r) => r.playerId)).toEqual(['a', 'c', 'b']); // 破产越晚名次越高
    expect(report.ranking[0]!.breakdown.total).toBe(netWorth(s, 'a'));
    expect(report.ranking[0]!.breakdown.propertyValue).toBe(400 + 30); // 多伦多全价 + 抵押半价
    expect(report.ranking[1]!.bankrupt).toBe(true);
    expect(report.ranking[1]!.breakdown.total).toBe(0);
    // 没有租金/拍卖/入狱/卡牌/ETF 活动 → 相应称号省略
    expect(report.superlatives).toHaveLength(0);
  });
});
