import { groupTiles } from './board';
import { industriesForEtf } from './market';
import type { EtfId, GameState, Portfolio } from './types';

export const ETF_BUY_FEE_RATE = 0.03;
export const ETF_SELL_FEE_RATE = 0.03;
export const ETF_FIRE_SALE_DISCOUNT_RATE = 0.15;

export interface EtfSaleQuote {
  etfId: EtfId;
  shares: number;
  grossCents: number;
  feeCents: number;
  discountCents: number;
  netCents: number;
  netCash: number;
  forced: boolean;
}

export interface LiquidationRecommendation {
  sales: EtfSaleQuote[];
  totalCash: number;
  requestedCash: number;
}

export function etfPriceCents(s: GameState, etfId: EtfId): number {
  return s.market.etfs[etfId]?.priceCents ?? 0;
}

export function quoteEtfBuyCostCents(s: GameState, etfId: EtfId, shares: number): number {
  const gross = etfPriceCents(s, etfId) * shares;
  return gross + Math.ceil(gross * ETF_BUY_FEE_RATE);
}

export function quoteEtfSale(s: GameState, etfId: EtfId, shares: number, forced: boolean): EtfSaleQuote {
  const grossCents = etfPriceCents(s, etfId) * shares;
  const feeCents = Math.ceil(grossCents * ETF_SELL_FEE_RATE);
  const discountCents = forced ? Math.ceil(grossCents * ETF_FIRE_SALE_DISCOUNT_RATE) : 0;
  const netCents = Math.max(0, grossCents - feeCents - discountCents);
  return {
    etfId,
    shares,
    grossCents,
    feeCents,
    discountCents,
    netCents,
    netCash: Math.floor(netCents / 100),
    forced,
  };
}

export function portfolioMarketValue(s: GameState, playerId: string): number {
  const portfolio = s.portfolios[playerId];
  if (!portfolio) return 0;
  return Math.floor(portfolioMarketValueCents(s, portfolio) / 100);
}

export function portfolioLiquidationValue(s: GameState, playerId: string): number {
  const portfolio = s.portfolios[playerId];
  if (!portfolio) return 0;
  let totalCents = 0;
  for (const [etfId, shares] of Object.entries(portfolio) as [EtfId, number][]) {
    if (shares > 0) totalCents += quoteEtfSale(s, etfId, shares, true).netCents;
  }
  return Math.floor(totalCents / 100);
}

export function recommendEtfLiquidation(
  s: GameState,
  playerId: string,
  requestedCash: number,
): LiquidationRecommendation {
  const portfolio = s.portfolios[playerId];
  if (!portfolio || requestedCash <= 0) return { sales: [], totalCash: 0, requestedCash };

  const ranked = (Object.entries(portfolio) as [EtfId, number][])
    .filter(([, shares]) => shares > 0)
    .sort(([a], [b]) => etfLiquidationScore(s, playerId, a) - etfLiquidationScore(s, playerId, b));

  const sales: EtfSaleQuote[] = [];
  let totalCash = 0;
  for (const [etfId, sharesHeld] of ranked) {
    if (totalCash >= requestedCash) break;
    const oneShare = quoteEtfSale(s, etfId, 1, true).netCash;
    if (oneShare <= 0) continue;
    const neededShares = Math.ceil((requestedCash - totalCash) / oneShare);
    const shares = Math.min(sharesHeld, Math.max(1, neededShares));
    const quote = quoteEtfSale(s, etfId, shares, true);
    if (quote.netCash <= 0) continue;
    sales.push(quote);
    totalCash += quote.netCash;
  }
  return { sales, totalCash, requestedCash };
}

export function bestEtfToLiquidate(s: GameState, playerId: string): EtfId | null {
  const recommendation = recommendEtfLiquidation(
    s,
    playerId,
    Math.max(1, (s.debts[0]?.amount ?? 0) - s.players.find((p) => p.id === playerId)!.cash),
  );
  return recommendation.sales[0]?.etfId ?? null;
}

function portfolioMarketValueCents(s: GameState, portfolio: Portfolio): number {
  return (Object.entries(portfolio) as [EtfId, number][])
    .reduce((total, [etfId, shares]) => total + etfPriceCents(s, etfId) * shares, 0);
}

function etfLiquidationScore(s: GameState, playerId: string, etfId: EtfId): number {
  const etf = s.market.etfs[etfId];
  if (!etf) return Number.POSITIVE_INFINITY;
  const signal = averageSignal(s, etfId);
  const priceReturn = (etf.priceCents - 10_000) / 10_000;
  const hedgeValue = hedgeValueForEtf(s, playerId, etfId);
  return priceReturn * 2 - signal * 1.5 - hedgeValue * 3;
}

function averageSignal(s: GameState, etfId: EtfId): number {
  const industries = industriesForEtf(etfId);
  if (industries.length === 0) return 0;
  return industries.reduce((sum, industry) => (
    sum + s.market.signals[industry] + s.market.sentimentThisTurn[industry] * 0.5
  ), 0) / industries.length;
}

function hedgeValueForEtf(s: GameState, playerId: string, etfId: EtfId): number {
  const industries = industriesForEtf(etfId);
  let value = 0;
  for (const player of s.players) {
    if (player.bankrupt || player.id === playerId) continue;
    for (const group of ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'] as const) {
      const tiles = groupTiles(group);
      if (!tiles.every((tile) => s.ownership[tile.id]?.owner === player.id)) continue;
      const overlap = tiles.some((tile) => tile.industries.some((industry) => industries.includes(industry)));
      if (overlap) value += 1;
    }
  }
  value += Math.max(0, averageSignal(s, etfId));
  return value;
}
