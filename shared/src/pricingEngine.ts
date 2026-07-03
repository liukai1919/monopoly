import type { EtfId, EtfState, IndustryScoreMap, MarketState } from './types';

export const STOCK_INITIAL_PRICE_CENTS = 10_000;
export const STOCK_MIN_PRICE_CENTS = 5_000;
export const STOCK_MAX_PRICE_CENTS = 30_000;
export const STOCK_SIGNAL_SENSITIVITY = 0.3;
export const MARKET_SIGNAL_DECAY_RATE = 0.85;
export const MARKET_SIGNAL_PRECISION = 4;
export const MARKET_SIGNAL_EPSILON = 0.01;
export const MARKET_HISTORY_LIMIT = 16;

export function calculateStockPriceCents(
  marketSignal: number,
  sensitivity = STOCK_SIGNAL_SENSITIVITY,
): number {
  const signal = smoothSignal(marketSignal);
  const tanhValue = Math.tanh(sensitivity * signal);
  const maxUp = STOCK_MAX_PRICE_CENTS - STOCK_INITIAL_PRICE_CENTS;
  const maxDown = STOCK_INITIAL_PRICE_CENTS - STOCK_MIN_PRICE_CENTS;
  const price = signal >= 0
    ? STOCK_INITIAL_PRICE_CENTS + maxUp * tanhValue
    : STOCK_INITIAL_PRICE_CENTS + maxDown * tanhValue;
  return clampCents(Math.round(price));
}

export function settleMarketRound(market: MarketState): MarketState {
  const signals = mapScores(market.signals, smoothSignal);
  const etfs = Object.fromEntries(
    Object.entries(market.etfs).map(([id, etf]) => [
      id,
      settleEtf(etf, averageSignalForEtf(etf, signals)),
    ]),
  ) as Record<EtfId, EtfState>;

  return {
    ...market,
    etfs,
    signals: mapScores(signals, (value) => smoothSignal(value * MARKET_SIGNAL_DECAY_RATE)),
    activityThisTurn: emptyLike(market.activityThisTurn),
    sentimentThisTurn: emptyLike(market.sentimentThisTurn),
    totalActivityThisTurn: 0,
  };
}

export function roundSignal(value: number): number {
  return Number(value.toFixed(MARKET_SIGNAL_PRECISION));
}

export function smoothSignal(value: number): number {
  const rounded = roundSignal(Number.isFinite(value) ? value : 0);
  return Math.abs(rounded) < MARKET_SIGNAL_EPSILON ? 0 : rounded;
}

function settleEtf(etf: EtfState, signal: number): EtfState {
  const priceCents = calculateStockPriceCents(signal);
  return {
    ...etf,
    lastPriceCents: etf.priceCents,
    priceCents,
    historyCents: [...etf.historyCents, priceCents].slice(-MARKET_HISTORY_LIMIT),
  };
}

function averageSignalForEtf(etf: EtfState, signals: IndustryScoreMap): number {
  if (etf.industries.length === 0) return 0;
  const total = etf.industries.reduce((sum, industry) => sum + signals[industry], 0);
  return smoothSignal(total / etf.industries.length);
}

function mapScores(
  scores: IndustryScoreMap,
  fn: (value: number) => number,
): IndustryScoreMap {
  return Object.fromEntries(
    Object.entries(scores).map(([tag, value]) => [tag, fn(value)]),
  ) as IndustryScoreMap;
}

function emptyLike(scores: IndustryScoreMap): IndustryScoreMap {
  return mapScores(scores, () => 0);
}

function clampCents(value: number): number {
  return Math.min(STOCK_MAX_PRICE_CENTS, Math.max(STOCK_MIN_PRICE_CENTS, value));
}
