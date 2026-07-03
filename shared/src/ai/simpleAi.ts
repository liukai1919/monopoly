import { BOARD, groupTiles, isOwnable } from '../board';
import type { Action, GameState, OwnableTile, TradeSide } from '../types';
import {
  canBuild, canMortgage, canSellHouse, canUnmortgage, getPlayer, liquidationValue,
  ownsFullGroup, playerProperties, unmortgageCost,
} from '../engine/helpers';

const CASH_RESERVE = 150;
const BUILD_RESERVE = 300;

/**
 * 简单启发式 AI: 给定状态返回该玩家现在要做的一个动作。
 * 只在轮到该玩家决策时调用 (whoMustAct / trade.to), 返回的动作保证合法。
 */
export function decideAction(s: GameState, playerId: string): Action | null {
  const me = getPlayer(s, playerId);
  if (me.bankrupt || s.phase === 'game-over') return null;

  // 待回应的交易优先处理 (可能与任何阶段并存)
  if (s.trade && s.trade.to === playerId && (s.phase === 'awaiting-roll' || s.phase === 'manage')) {
    return { type: 'respond-trade', accept: evaluateTrade(s, playerId) };
  }

  if (s.phase === 'auction' && s.auction?.turn === playerId) {
    return decideBid(s, playerId);
  }

  if (s.phase === 'awaiting-debt' && s.debts[0]?.debtor === playerId) {
    return decideLiquidation(s, playerId);
  }

  if (s.currentPlayer !== playerId) return null;

  switch (s.phase) {
    case 'awaiting-roll': {
      if (me.inJail) return decideJail(s, playerId);
      return manageOr(s, playerId, { type: 'roll' });
    }
    case 'awaiting-buy': {
      const tileId = s.pendingBuyTile;
      if (tileId == null) return null;
      const tile = BOARD[tileId] as OwnableTile;
      const reserve = tile.type === 'property' ? CASH_RESERVE : 100;
      const completes = tile.type === 'property'
        && groupTiles(tile.group).every((t) => t.id === tileId || s.ownership[t.id]?.owner === playerId);
      if (me.cash >= tile.price && (completes || me.cash - tile.price >= reserve)) {
        return { type: 'buy' };
      }
      return { type: 'decline-buy' };
    }
    case 'awaiting-card':
      return s.pendingCard?.playerId === playerId ? { type: 'draw-card' } : null;
    case 'manage':
      return manageOr(s, playerId, { type: 'end-turn' });
    default:
      return null;
  }
}

/** 回合内的资产管理: 有值得做的就做一件, 否则执行 fallback (掷骰/结束回合) */
function manageOr(s: GameState, playerId: string, fallback: Action): Action {
  const me = getPlayer(s, playerId);

  // 盖房: 从贵的地开始, 保留安全现金
  const buildable = playerProperties(s, playerId)
    .filter((id) => canBuild(s, playerId, id) === null)
    .sort((a, b) => b - a);
  for (const id of buildable) {
    const tile = BOARD[id];
    if (tile?.type === 'property' && me.cash - tile.houseCost >= BUILD_RESERVE) {
      return { type: 'build', tileId: id };
    }
  }

  // 赎回抵押: 现金充裕时优先赎回垄断组
  const mortgaged = playerProperties(s, playerId)
    .filter((id) => canUnmortgage(s, playerId, id) === null)
    .sort((a, b) => {
      const pa = BOARD[a], pb = BOARD[b];
      const ma = pa?.type === 'property' && ownsFullGroup(s, playerId, pa.group) ? 1 : 0;
      const mb = pb?.type === 'property' && ownsFullGroup(s, playerId, pb.group) ? 1 : 0;
      return mb - ma;
    });
  for (const id of mortgaged) {
    const tile = BOARD[id];
    if (tile && isOwnable(tile) && me.cash - unmortgageCost(tile) >= 500) {
      return { type: 'unmortgage', tileId: id };
    }
  }

  return fallback;
}

function decideJail(s: GameState, playerId: string): Action {
  const me = getPlayer(s, playerId);
  if (me.jailCards.length > 0) return { type: 'jail-card' };
  // 前期地多没人收租, 花钱出来抢地; 后期蹲着躲租金
  const boardDeveloped = Object.values(s.ownership).filter((o) => o.owner !== null).length >= 16;
  if (!boardDeveloped && me.cash >= 200) return { type: 'jail-pay' };
  return { type: 'roll' };
}

function decideBid(s: GameState, playerId: string): Action {
  const me = getPlayer(s, playerId);
  const a = s.auction!;
  const tile = BOARD[a.tileId] as OwnableTile;

  let cap: number;
  if (tile.type === 'property') {
    const others = groupTiles(tile.group).filter((t) => t.id !== tile.id);
    const completesMine = others.every((t) => s.ownership[t.id]?.owner === playerId);
    const blocksOther = others.length > 0 && others.every((t) => {
      const o = s.ownership[t.id]?.owner;
      return o !== null && o !== playerId && o === s.ownership[others[0]!.id]?.owner;
    });
    cap = Math.floor(tile.price * (completesMine ? 1.5 : blocksOther ? 1.25 : 0.85));
  } else if (tile.type === 'railroad') {
    cap = Math.floor(tile.price * 0.9);
  } else {
    cap = Math.floor(tile.price * 0.75);
  }
  cap = Math.min(cap, me.cash - 80);

  const inc = a.highBid < 50 ? 10 : a.highBid < 200 ? 20 : 50;
  const bid = Math.min(a.highBid === 0 ? 10 : a.highBid + inc, cap);
  if (bid > a.highBid && bid <= me.cash) return { type: 'bid', amount: bid };
  return { type: 'pass-bid' };
}

function decideLiquidation(s: GameState, playerId: string): Action {
  const debt = s.debts[0]!;
  if (liquidationValue(s, playerId) < debt.amount) {
    return { type: 'declare-bankruptcy' };
  }

  // 1. 抵押非垄断组地块 (便宜的先)
  const mine = playerProperties(s, playerId);
  const mortgageable = mine
    .filter((id) => canMortgage(s, playerId, id) === null)
    .sort((a, b) => a - b);
  const nonMonopoly = mortgageable.filter((id) => {
    const tile = BOARD[id];
    return !(tile?.type === 'property' && ownsFullGroup(s, playerId, tile.group));
  });
  if (nonMonopoly.length > 0) return { type: 'mortgage', tileId: nonMonopoly[0]! };

  // 2. 卖房 (从房子多的卖起)
  const sellable = mine
    .filter((id) => canSellHouse(s, playerId, id) === null)
    .sort((a, b) => (s.ownership[b]?.houses ?? 0) - (s.ownership[a]?.houses ?? 0));
  if (sellable.length > 0) return { type: 'sell-house', tileId: sellable[0]! };

  // 3. 抵押垄断组
  if (mortgageable.length > 0) return { type: 'mortgage', tileId: mortgageable[0]! };

  // 理论上到不了这里 (liquidationValue 已保证有资产可变现)
  return { type: 'declare-bankruptcy' };
}

function evaluateTrade(s: GameState, playerId: string): boolean {
  const t = s.trade!;
  const myGain = sideValue(s, t.give, playerId);   // 对方付出的归我
  const myCost = sideValue(s, t.get, t.from);      // 我付出的归对方
  return myGain >= myCost;
}

/** side 里资产对 beneficiary 的价值 */
function sideValue(s: GameState, side: TradeSide, beneficiaryId: string): number {
  let value = side.cash + side.jailCards * 40;
  for (const id of side.properties) {
    const tile = BOARD[id];
    if (!tile || !isOwnable(tile)) continue;
    let v = s.ownership[id]?.mortgaged ? tile.price * 0.45 : tile.price;
    if (tile.type === 'property') {
      const completes = groupTiles(tile.group)
        .every((t) => t.id === id || s.ownership[t.id]?.owner === beneficiaryId);
      if (completes) v *= 1.6;
    }
    value += v;
  }
  return Math.round(value);
}
