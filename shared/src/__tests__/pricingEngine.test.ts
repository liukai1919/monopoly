import { describe, expect, test } from 'vitest';
import {
  STOCK_INITIAL_PRICE_CENTS, STOCK_MAX_PRICE_CENTS, STOCK_MIN_PRICE_CENTS,
  calculateStockPriceCents, createMarket, settleMarketRound, smoothSignal,
} from '../index';

describe('股票定价引擎', () => {
  test('tanh 定价把任意信号锁定在价格上下限内', () => {
    expect(calculateStockPriceCents(0)).toBe(STOCK_INITIAL_PRICE_CENTS);
    expect(calculateStockPriceCents(10_000)).toBe(STOCK_MAX_PRICE_CENTS);
    expect(calculateStockPriceCents(-10_000)).toBe(STOCK_MIN_PRICE_CENTS);
    expect(calculateStockPriceCents(2)).toBeGreaterThan(STOCK_INITIAL_PRICE_CENTS);
    expect(calculateStockPriceCents(-2)).toBeLessThan(STOCK_INITIAL_PRICE_CENTS);
    expect(calculateStockPriceCents(-2)).toBeGreaterThan(STOCK_MIN_PRICE_CENTS);
  });

  test('信号固定精度截断并平滑接近零的小数', () => {
    expect(smoothSignal(1.234567)).toBe(1.2346);
    expect(smoothSignal(0.0099)).toBe(0);
    expect(smoothSignal(-0.0099)).toBe(0);
  });

  test('round end 结算价格, 衰减信号并清空本轮活跃度', () => {
    const market = createMarket();
    market.signals.realEstate = 2;
    market.activityThisTurn.realEstate = 500;
    market.sentimentThisTurn.realEstate = 2;
    market.totalActivityThisTurn = 500;

    const next = settleMarketRound(market);

    expect(next.etfs['CAN-REAL'].priceCents).toBeGreaterThan(STOCK_INITIAL_PRICE_CENTS);
    expect(next.etfs['CAN-REAL'].lastPriceCents).toBe(STOCK_INITIAL_PRICE_CENTS);
    expect(next.etfs['CAN-REAL'].historyCents).toHaveLength(2);
    expect(next.signals.realEstate).toBe(1.7);
    expect(next.activityThisTurn.realEstate).toBe(0);
    expect(next.sentimentThisTurn.realEstate).toBe(0);
    expect(next.totalActivityThisTurn).toBe(0);
  });
});
