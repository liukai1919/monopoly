import {
  quoteEtfBuyCostCents, quoteEtfSale,
} from '@monopoly/shared';
import type { Action, EtfId, GameState, Language } from '@monopoly/shared';
import { formatShareCount, localizeEtfName, tr } from '../i18n';

export default function MarketPanel({ game, language, meId, act }: {
  game: GameState;
  language: Language;
  meId: string;
  act: (a: Action) => void;
}) {
  const me = game.players.find((p) => p.id === meId)!;
  const portfolio = game.portfolios[meId];
  const isMyDebtPhase = game.phase === 'awaiting-debt' && game.debts[0]?.debtor === meId;
  const owesDebt = game.debts.some((debt) => debt.debtor === meId);
  const canTrade = !me.bankrupt && game.phase !== 'game-over';
  const canBuy = canTrade && !owesDebt;
  const canSell = canTrade;

  return (
    <div className="market-panel">
      <div className="market-account">
        <div>
          <span>{tr(language, '现金', 'Cash', 'Argent')}</span>
          <b>${me.cash}</b>
        </div>
        <div>
          <span>{tr(language, '交易状态', 'Trading Status', 'État')}</span>
          <b>
            {game.phase === 'game-over'
              ? tr(language, '已结算', 'Settled', 'Réglé')
              : isMyDebtPhase
                ? tr(language, '火售筹钱', 'Fire sale', 'Vente forcée')
                : tr(language, '可交易', 'Tradable', 'Négociable')}
          </b>
        </div>
      </div>

      {isMyDebtPhase && (
        <p className="home-hint">
          {tr(language, '债务阶段只能火售 ETF 筹钱，结清后会自动继续。', 'During debt resolution, you can only fire-sell ETFs. Play resumes once the debt is paid.', 'Pendant la dette, vous ne pouvez que vendre les FNB en urgence. La partie reprend après paiement.')}
        </p>
      )}

      {Object.keys(game.market.etfs).map((id) => {
        const etfId = id as EtfId;
        const etf = game.market.etfs[etfId];
        const shares = portfolio?.[etfId] ?? 0;
        const buyCost = Math.ceil(quoteEtfBuyCostCents(game, etfId, 1) / 100);
        const saleQuote = quoteEtfSale(game, etfId, 1, isMyDebtPhase);
        const delta = etf.priceCents - etf.lastPriceCents;
        const recent = game.market.recentEvents.filter((event) => event.etfId === etfId).slice(-2).reverse();

        return (
          <div className="market-card" key={etfId}>
            <div className="market-card-head">
              <div>
                <div className="market-symbol">{etfId}</div>
                <div className="market-name">{localizeEtfName(etfId, language)}</div>
              </div>
              <div className="market-price">
                <b>{formatCents(etf.priceCents)}</b>
                <span className={delta >= 0 ? 'market-up' : 'market-down'}>
                  {delta >= 0 ? '+' : ''}{formatCents(delta)}
                </span>
              </div>
            </div>

            <div className="market-card-meta">
              <span>{tr(language, '持仓', 'Holding', 'Position')} {formatShareCount(shares, language)}</span>
              <span>{tr(language, '信号', 'Signal', 'Signal')} {averageSignal(game, etfId).toFixed(2)}</span>
              {isMyDebtPhase && <span className="tag tag-warn">{tr(language, '火售折价 15%', 'Fire-sale discount 15%', 'Décote de vente forcée 15 %')}</span>}
            </div>

            {recent.length > 0 && (
              <div className="market-drivers">
                {recent.map((event) => (
                  <div className={event.polarity === 'bullish' ? 'driver-up' : 'driver-down'} key={event.id}>
                    {event.driverText}
                  </div>
                ))}
              </div>
            )}

            <div className="market-actions">
              {!isMyDebtPhase && (
                <button
                  className={`btn btn-sm ${!canBuy || me.cash < buyCost ? 'btn-dim' : ''}`}
                  disabled={!canBuy || me.cash < buyCost}
                  onClick={() => act({ type: 'buy-etf', etfId, shares: 1 })}
                >
                  {tr(language, '买', 'Buy', 'Acheter')} {formatShareCount(1, language)} -${buyCost}
                </button>
              )}
              <button
                className={`btn btn-sm ${!canSell || shares <= 0 ? 'btn-dim' : ''}`}
                disabled={!canSell || shares <= 0}
                onClick={() => act({ type: 'sell-etf', etfId, shares: 1 })}
              >
                {isMyDebtPhase ? tr(language, '火售', 'Fire-sell', 'Vendre en urgence') : tr(language, '卖', 'Sell', 'Vendre')}
                {' '}
                {formatShareCount(1, language)} +${saleQuote.netCash}
              </button>
              {isMyDebtPhase && shares > 1 && (
                <button
                  className="btn btn-sm"
                  disabled={!canSell}
                  onClick={() => act({ type: 'sell-etf', etfId, shares })}
                >
                  {tr(language, '全部火售', 'Fire-sell all', 'Tout vendre en urgence')} +${quoteEtfSale(game, etfId, shares, true).netCash}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function averageSignal(game: GameState, etfId: EtfId): number {
  const industries = game.market.etfs[etfId].industries;
  if (industries.length === 0) return 0;
  return industries.reduce((sum, industry) => sum + game.market.signals[industry], 0) / industries.length;
}
