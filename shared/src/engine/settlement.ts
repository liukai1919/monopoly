import { isOwnable } from '../board';
import { portfolioMarketValue } from '../portfolio';
import type { GameState, PlayerStats } from '../types';
import { getPlayer, getTile, playerProperties } from './helpers';
import { etfUnrealizedCents } from './stats';

export interface NetWorthBreakdown {
  cash: number;
  propertyValue: number;   // 地价 (抵押减半)
  buildingValue: number;   // 建筑成本
  etfValue: number;        // 持仓市值
  total: number;
}

export interface RankedPlayer {
  playerId: string;
  rank: number;
  bankrupt: boolean;
  breakdown: NetWorthBreakdown;
}

export interface SettlementSuperlative {
  key: string;
  emoji: string;
  title: string;
  playerId: string;
  detailText: string;
}

export interface SettlementReport {
  ranking: RankedPlayer[];
  rent: { playerId: string; received: number; paid: number }[];
  etfPnl: { playerId: string; realized: number; unrealized: number; total: number }[];
  superlatives: SettlementSuperlative[];
}

/** 口径与 helpers.netWorth 一致, 拆成四项 */
export function netWorthBreakdown(s: GameState, playerId: string): NetWorthBreakdown {
  const player = getPlayer(s, playerId);
  if (player.bankrupt) {
    return { cash: 0, propertyValue: 0, buildingValue: 0, etfValue: 0, total: 0 };
  }
  let propertyValue = 0;
  let buildingValue = 0;
  for (const id of playerProperties(s, playerId)) {
    const tile = getTile(id);
    if (!isOwnable(tile)) continue;
    const own = s.ownership[id]!;
    propertyValue += own.mortgaged ? Math.floor(tile.price / 2) : tile.price;
    if (tile.type === 'property' && own.houses > 0) {
      const units = own.houses === 5 ? 5 : own.houses;
      buildingValue += units * tile.houseCost;
    }
  }
  const etfValue = portfolioMarketValue(s, playerId);
  return {
    cash: player.cash,
    propertyValue,
    buildingValue,
    etfValue,
    total: player.cash + propertyValue + buildingValue + etfValue,
  };
}

export function buildSettlementReport(s: GameState): SettlementReport {
  const stats = (id: string): PlayerStats | undefined => s.stats?.players[id];

  const alive = s.players.filter((p) => !p.bankrupt);
  const bankrupt = s.players.filter((p) => p.bankrupt);
  const ordered = [
    ...alive
      .map((p) => ({ p, breakdown: netWorthBreakdown(s, p.id) }))
      .sort((a, b) => {
        // 赢家永远第一 (净资产并列时以 s.winner 为准)
        if (s.winner === a.p.id) return -1;
        if (s.winner === b.p.id) return 1;
        return b.breakdown.total - a.breakdown.total;
      }),
    ...bankrupt
      .map((p) => ({ p, breakdown: netWorthBreakdown(s, p.id) }))
      .sort((a, b) => (stats(b.p.id)?.bankruptAtTurn ?? 0) - (stats(a.p.id)?.bankruptAtTurn ?? 0)),
  ];
  const ranking = ordered.map(({ p, breakdown }, i) => ({
    playerId: p.id,
    rank: i + 1,
    bankrupt: p.bankrupt,
    breakdown,
  }));

  const rent = ranking.map(({ playerId }) => ({
    playerId,
    received: stats(playerId)?.rentReceived ?? 0,
    paid: stats(playerId)?.rentPaid ?? 0,
  }));

  const etfPnl = ranking.map(({ playerId }) => {
    const realized = Math.round((stats(playerId)?.etf.realizedCents ?? 0)) / 100;
    const unrealized = Math.round(etfUnrealizedCents(s, playerId)) / 100;
    return { playerId, realized, unrealized, total: Math.round((realized + unrealized) * 100) / 100 };
  });

  return { ranking, rent, etfPnl, superlatives: buildSuperlatives(s, etfPnl) };
}

function buildSuperlatives(
  s: GameState, etfPnl: SettlementReport['etfPnl'],
): SettlementSuperlative[] {
  const out: SettlementSuperlative[] = [];
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  const g = s.stats;
  if (!g) return out;

  if (g.biggestRent) {
    const r = g.biggestRent;
    out.push({
      key: 'biggest-rent', emoji: '💸', title: '租金之王', playerId: r.ownerId,
      detailText: `${name(r.payerId)} 在 ${getTile(r.tileId).name} 付给 ${name(r.ownerId)} $${r.amount}`,
    });
  }

  const rentKing = maxBy(Object.entries(g.players), ([, st]) => st.rentReceived);
  if (rentKing && rentKing[1].rentReceived > 0) {
    out.push({
      key: 'rent-total', emoji: '🏠', title: '收租王', playerId: rentKing[0],
      detailText: `整局共收租 $${rentKing[1].rentReceived}`,
    });
  }

  if (g.bestAuction) {
    const a = g.bestAuction;
    const pct = Math.round((a.bid / a.listPrice) * 100);
    out.push({
      key: 'best-auction', emoji: '🔨', title: '捡漏王', playerId: a.winnerId,
      detailText: `以 $${a.bid} (${pct}% 标价) 拍得 ${getTile(a.tileId).name}`,
    });
  }

  if (g.biggestWindfall) {
    const w = g.biggestWindfall;
    out.push({
      key: 'windfall', emoji: '🍀', title: '天降横财', playerId: w.playerId,
      detailText: `「${w.text}」进账 $${w.amount}`,
    });
  }

  const jailBird = maxBy(Object.entries(g.players), ([, st]) => st.jailVisits);
  if (jailBird && jailBird[1].jailVisits > 0) {
    out.push({
      key: 'jail', emoji: '🚔', title: '牢底坐穿', playerId: jailBird[0],
      detailText: `进了 ${jailBird[1].jailVisits} 次监狱`,
    });
  }

  const trader = maxBy(
    etfPnl.filter(({ playerId }) => hasEtfActivity(g.players[playerId])),
    (e) => e.total,
  );
  if (trader) {
    const sign = trader.total >= 0 ? '+' : '-';
    out.push({
      key: 'etf', emoji: '📈', title: '股神', playerId: trader.playerId,
      detailText: `证券盈亏 ${sign}$${Math.abs(trader.total)}`,
    });
  }

  return out;
}

function hasEtfActivity(st: PlayerStats | undefined): boolean {
  if (!st) return false;
  return st.etf.investedCents > 0 || st.etf.realizedCents !== 0
    || Object.values(st.etf.costCents).some((c: number) => c > 0);
}

function maxBy<T>(items: T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const v = score(item);
    if (v > bestScore) {
      best = item;
      bestScore = v;
    }
  }
  return best;
}
