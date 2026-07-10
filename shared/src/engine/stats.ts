import { START_CASH } from '../board';
import { ETF_DEFINITIONS } from '../market';
import type {
  EtfId, GameState, GameStats, PaymentKind, PlayerState, PlayerStats,
} from '../types';
import { netWorth } from './helpers';

export function createGameStats(players: PlayerState[]): GameStats {
  return {
    players: Object.fromEntries(players.map((p) => [p.id, createPlayerStats()])),
    netWorthHistory: [players.map(() => START_CASH)],
    biggestRent: null,
    bestAuction: null,
    biggestWindfall: null,
  };
}

function createPlayerStats(): PlayerStats {
  return {
    rentReceived: 0,
    rentPaid: 0,
    taxesPaid: 0,
    salaryReceived: 0,
    cardGains: 0,
    cardLosses: 0,
    jailVisits: 0,
    propertiesBought: 0,
    auctionWins: 0,
    buildSpend: 0,
    bankruptAtTurn: null,
    etf: {
      costCents: Object.fromEntries(Object.keys(ETF_DEFINITIONS).map((id) => [id, 0])) as Record<EtfId, number>,
      realizedCents: 0,
      investedCents: 0,
    },
  };
}

export function playerStats(s: GameState, playerId: string): PlayerStats {
  s.stats.players[playerId] ??= createPlayerStats();
  return s.stats.players[playerId]!;
}

/**
 * 归类一笔已完成的支付 (pay 的唯一出口)。
 * 双边科目 (rent/gift) 仅在 receiverId 实际入账时记账, 保证 Σ付出 === Σ收入。
 */
export function recordPayment(
  s: GameState, kind: PaymentKind, payerId: string, receiverId: string | null,
  amount: number, tileId?: number,
): void {
  switch (kind) {
    case 'rent': {
      if (receiverId == null) return;
      playerStats(s, payerId).rentPaid += amount;
      playerStats(s, receiverId).rentReceived += amount;
      if (tileId != null && amount > (s.stats.biggestRent?.amount ?? 0)) {
        s.stats.biggestRent = { payerId, ownerId: receiverId, tileId, amount };
      }
      return;
    }
    case 'tax':
    case 'repairs':
    case 'bail':
      playerStats(s, payerId).taxesPaid += amount;
      return;
    case 'card':
      playerStats(s, payerId).cardLosses += amount;
      return;
    case 'gift': {
      if (receiverId == null) return;
      playerStats(s, payerId).cardLosses += amount;
      playerStats(s, receiverId).cardGains += amount;
      return;
    }
    case 'other':
      return;
  }
}

export function recordCardGain(s: GameState, playerId: string, amount: number, text: string): void {
  playerStats(s, playerId).cardGains += amount;
  if (amount > (s.stats.biggestWindfall?.amount ?? 0)) {
    s.stats.biggestWindfall = { playerId, amount, text };
  }
}

export function recordEtfBuy(
  s: GameState, playerId: string, etfId: EtfId, costCash: number,
): void {
  const etf = playerStats(s, playerId).etf;
  etf.costCents[etfId] += costCash * 100;
  etf.investedCents += costCash * 100;
}

export function recordEtfSell(
  s: GameState, playerId: string, etfId: EtfId,
  sharesSold: number, sharesHeldBefore: number, netCash: number,
): void {
  const etf = playerStats(s, playerId).etf;
  // 平均成本法; 全部卖出时整取, 避免舍入残渣
  const basisSold = sharesSold === sharesHeldBefore
    ? etf.costCents[etfId]
    : Math.round((etf.costCents[etfId] * sharesSold) / sharesHeldBefore);
  etf.costCents[etfId] -= basisSold;
  etf.realizedCents += netCash * 100 - basisSold;
}

/** 破产时随份额转移成本基准; 归银行则计为债务人的全额已实现亏损 */
export function transferEtfBasisOnBankruptcy(
  s: GameState, debtorId: string, creditorId: string | null,
): void {
  const debtorEtf = playerStats(s, debtorId).etf;
  if (creditorId) {
    const creditorEtf = playerStats(s, creditorId).etf;
    for (const [etfId, cents] of Object.entries(debtorEtf.costCents) as [EtfId, number][]) {
      creditorEtf.costCents[etfId] += cents;
    }
  } else {
    const total = Object.values(debtorEtf.costCents).reduce((sum, c) => sum + c, 0);
    debtorEtf.realizedCents -= total;
  }
  for (const etfId of Object.keys(debtorEtf.costCents) as EtfId[]) {
    debtorEtf.costCents[etfId] = 0;
  }
}

export function snapshotNetWorth(s: GameState): void {
  s.stats.netWorthHistory.push(s.players.map((p) => (p.bankrupt ? 0 : netWorth(s, p.id))));
}

/** 当前持仓的未实现盈亏 (分) */
export function etfUnrealizedCents(s: GameState, playerId: string): number {
  const portfolio = s.portfolios[playerId];
  const etf = s.stats.players[playerId]?.etf;
  if (!portfolio || !etf) return 0;
  let cents = 0;
  for (const [etfId, shares] of Object.entries(portfolio) as [EtfId, number][]) {
    cents += shares * (s.market.etfs[etfId]?.priceCents ?? 0) - etf.costCents[etfId];
  }
  return cents;
}
