import { BOARD, MORTGAGE_INTEREST, groupTiles, isOwnable } from '../board';
import { portfolioLiquidationValue, portfolioMarketValue } from '../portfolio';
import type {
  ColorGroup, GameState, OwnableTile, PlayerState, PropertyTile, Tile,
} from '../types';

export function getTile(id: number): Tile {
  const tile = BOARD[id];
  if (!tile) throw new Error(`unknown tile ${id}`);
  return tile;
}

export function getPlayer(s: GameState, id: string): PlayerState {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function alivePlayers(s: GameState): PlayerState[] {
  return s.players.filter((p) => !p.bankrupt);
}

/** 玩家拥有的所有地块 id */
export function playerProperties(s: GameState, playerId: string): number[] {
  return Object.entries(s.ownership)
    .filter(([, o]) => o.owner === playerId)
    .map(([id]) => Number(id));
}

export function ownsFullGroup(s: GameState, playerId: string, group: ColorGroup): boolean {
  return groupTiles(group).every((t) => s.ownership[t.id]?.owner === playerId);
}

export function railroadsOwned(s: GameState, playerId: string): number {
  return BOARD.filter((t) => t.type === 'railroad' && s.ownership[t.id]?.owner === playerId).length;
}

export function utilitiesOwned(s: GameState, playerId: string): number {
  return BOARD.filter((t) => t.type === 'utility' && s.ownership[t.id]?.owner === playerId).length;
}

/**
 * 落在 tileId 上应付的租金。
 * railDouble: 机会卡"最近铁路"双倍; utilTen: 机会卡"最近公用事业"固定 10 倍骰点
 */
export function computeRent(
  s: GameState, tileId: number, diceSum: number,
  opts: { railDouble?: boolean; utilTen?: boolean } = {},
): number {
  const tile = getTile(tileId);
  const own = s.ownership[tileId];
  if (!own || !own.owner || own.mortgaged) return 0;

  if (tile.type === 'property') {
    if (own.houses > 0) return tile.rent[own.houses] ?? 0;
    const monopoly = ownsFullGroup(s, own.owner, tile.group);
    return monopoly ? tile.rent[0] * 2 : tile.rent[0];
  }
  if (tile.type === 'railroad') {
    const n = railroadsOwned(s, own.owner);
    const base = 25 * 2 ** (n - 1);
    return opts.railDouble ? base * 2 : base;
  }
  if (tile.type === 'utility') {
    if (opts.utilTen) return diceSum * 10;
    return utilitiesOwned(s, own.owner) === 2 ? diceSum * 10 : diceSum * 4;
  }
  return 0;
}

/** 抵押可得金额 */
export function mortgageValue(tile: OwnableTile): number {
  return Math.floor(tile.price / 2);
}

/** 赎回需付金额 (含 10% 利息) */
export function unmortgageCost(tile: OwnableTile): number {
  return Math.round(mortgageValue(tile) * MORTGAGE_INTEREST);
}

/** 玩家还能变现多少钱: 现金 + 卖房(半价) + 抵押未抵押地块(半价) */
export function liquidationValue(s: GameState, playerId: string): number {
  let total = getPlayer(s, playerId).cash + portfolioLiquidationValue(s, playerId);
  for (const id of playerProperties(s, playerId)) {
    const tile = getTile(id);
    if (!isOwnable(tile)) continue;
    const own = s.ownership[id]!;
    if (tile.type === 'property' && own.houses > 0) {
      const units = own.houses === 5 ? 5 : own.houses;
      total += Math.floor((units * tile.houseCost) / 2);
    }
    if (!own.mortgaged) total += mortgageValue(tile);
  }
  return total;
}

/** 净资产 (排名用): 现金 + 地价(抵押减半) + 建筑成本 */
export function netWorth(s: GameState, playerId: string): number {
  let total = getPlayer(s, playerId).cash + portfolioMarketValue(s, playerId);
  for (const id of playerProperties(s, playerId)) {
    const tile = getTile(id);
    if (!isOwnable(tile)) continue;
    const own = s.ownership[id]!;
    total += own.mortgaged ? Math.floor(tile.price / 2) : tile.price;
    if (tile.type === 'property' && own.houses > 0) {
      const units = own.houses === 5 ? 5 : own.houses;
      total += units * tile.houseCost;
    }
  }
  return total;
}

/** 校验能否在 tileId 盖一栋房 (或升级酒店)。返回 null 表示可以, 否则返回原因 */
export function canBuild(s: GameState, playerId: string, tileId: number): string | null {
  const tile = getTile(tileId);
  if (tile.type !== 'property') return '该地块不能盖房';
  const own = s.ownership[tileId];
  if (own?.owner !== playerId) return '这不是你的地';
  if (!ownsFullGroup(s, playerId, tile.group)) return '需要集齐同色地块才能盖房';
  const group = groupTiles(tile.group);
  if (group.some((t) => s.ownership[t.id]?.mortgaged)) return '同色组有地块被抵押, 不能盖房';
  if (own.houses >= 5) return '已经是酒店了';
  const minHouses = Math.min(...group.map((t) => s.ownership[t.id]!.houses));
  if (own.houses > minHouses) return '必须均衡建造 (先给房子少的地块盖)';
  if (own.houses === 4) {
    if (s.hotelsRemaining <= 0) return '银行的酒店已经发完了';
  } else if (s.housesRemaining <= 0) {
    return '银行的房子已经发完了';
  }
  const player = getPlayer(s, playerId);
  if (player.cash < tile.houseCost) return '现金不足';
  return null;
}

/** 校验能否卖掉 tileId 上的一栋房 (酒店降级为 4 房)。返回 null 表示可以 */
export function canSellHouse(s: GameState, playerId: string, tileId: number): string | null {
  const tile = getTile(tileId);
  if (tile.type !== 'property') return '该地块没有房子';
  const own = s.ownership[tileId];
  if (own?.owner !== playerId) return '这不是你的地';
  if (own.houses === 0) return '这里没有房子';
  const group = groupTiles(tile.group);
  const maxHouses = Math.max(...group.map((t) => s.ownership[t.id]!.houses));
  if (own.houses < maxHouses) return '必须均衡拆卖 (先卖房子多的地块)';
  // 酒店降级需要银行还有 4 栋房; 不够则整体清空 (引擎处理)
  return null;
}

export function canMortgage(s: GameState, playerId: string, tileId: number): string | null {
  const tile = getTile(tileId);
  if (!isOwnable(tile)) return '该地块不能抵押';
  const own = s.ownership[tileId];
  if (own?.owner !== playerId) return '这不是你的地';
  if (own.mortgaged) return '已经抵押了';
  if (tile.type === 'property') {
    const group = groupTiles(tile.group);
    if (group.some((t) => (s.ownership[t.id]?.houses ?? 0) > 0)) {
      return '同色组还有房子, 先卖掉才能抵押';
    }
  }
  return null;
}

export function canUnmortgage(s: GameState, playerId: string, tileId: number): string | null {
  const tile = getTile(tileId);
  if (!isOwnable(tile)) return '该地块不能赎回';
  const own = s.ownership[tileId];
  if (own?.owner !== playerId) return '这不是你的地';
  if (!own.mortgaged) return '没有被抵押';
  if (getPlayer(s, playerId).cash < unmortgageCost(tile)) return '现金不足';
  return null;
}

/** 当前必须行动的玩家 (不含交易响应方, 服务器单独处理) */
export function whoMustAct(s: GameState): string[] {
  switch (s.phase) {
    case 'game-over': return [];
    case 'auction': return s.auction ? [s.auction.turn] : [];
    case 'awaiting-debt': return s.debts.length ? [s.debts[0]!.debtor] : [];
    case 'awaiting-card': return s.pendingCard ? [s.pendingCard.playerId] : [s.currentPlayer];
    default: return [s.currentPlayer];
  }
}
