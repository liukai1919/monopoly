import { useEffect, useState } from 'react';
import { ETF_DEFINITIONS, getTile } from '@monopoly/shared';
import type { DiceStyle, EtfId, GameState } from '@monopoly/shared';
import { socket } from '../api';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const DICE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export default function CenterStage({ game, code, shownDice, diceRolling, cardFlash }: {
  game: GameState;
  code: string;
  shownDice: [number, number] | null;
  diceRolling: boolean;
  cardFlash: { deck: string; text: string } | null;
}) {
  const current = game.players.find((p) => p.id === game.currentPlayer);
  const diceStyle = game.settings.diceStyle ?? 'classic';

  return (
    <div className="stage">
      <div className="stage-brand">🍁 大富翁 · 加拿大版 <span className="stage-code">房间 {code}</span></div>
      <MarketTape game={game} />

      {current && (
        <div className="stage-turn" style={{ borderColor: current.color }}>
          <span className="stage-turn-emoji">{current.emoji}</span>
          <span>轮到 <b style={{ color: current.color }}>{current.name}</b></span>
          {phaseHint(game)}
        </div>
      )}

      <div className={`stage-dice dice-style-${diceStyle} ${diceRolling ? 'rolling' : ''}`}>
        {diceRolling ? (
          <><DieFace style={diceStyle} rolling /><DieFace style={diceStyle} rolling /></>
        ) : shownDice ? (
          <>
            <DieFace style={diceStyle} value={shownDice[0]} />
            <DieFace style={diceStyle} value={shownDice[1]} />
          </>
        ) : (
          <span className="stage-dice-empty">等待掷骰…</span>
        )}
      </div>

      {game.settings.freeParkingPot && (
        <div className="stage-pot">🅿️ 停车奖池: <b>${game.pot}</b></div>
      )}

      {game.phase === 'awaiting-debt' && game.debts[0] && <DebtBanner game={game} />}
      {game.trade && <TradeBanner game={game} />}
      {game.phase === 'awaiting-card' && game.pendingCard && <CardDrawBanner game={game} />}
      {game.phase === 'auction' && game.auction && <AuctionPanel game={game} />}

      {cardFlash && (
        <div className={`card-flash card-${cardFlash.deck}`}>
          <div className="card-flash-title">{cardFlash.deck === 'chance' ? '❓ 机会' : '🎁 宝箱'}</div>
          <div className="card-flash-text">{cardFlash.text}</div>
        </div>
      )}

      {game.phase === 'game-over' && <WinnerOverlay game={game} code={code} />}
    </div>
  );
}

function MarketTape({ game }: { game: GameState }) {
  const movers = (Object.keys(game.market.etfs) as EtfId[])
    .sort((a, b) => Math.abs(game.market.etfs[b].priceCents - game.market.etfs[b].lastPriceCents)
      - Math.abs(game.market.etfs[a].priceCents - game.market.etfs[a].lastPriceCents))
    .slice(0, 4);
  const latest = game.market.recentEvents.at(-1);

  return (
    <div className="stage-market">
      <div className="stage-market-row">
        {movers.map((etfId) => {
          const etf = game.market.etfs[etfId];
          const delta = etf.priceCents - etf.lastPriceCents;
          return (
            <div className="stage-market-chip" key={etfId} title={ETF_DEFINITIONS[etfId].name}>
              <span>{etfId.replace('CAN-', '')}</span>
              <b>{formatCents(etf.priceCents)}</b>
              <em className={delta >= 0 ? 'market-up' : 'market-down'}>
                {delta >= 0 ? '+' : ''}{formatCents(delta)}
              </em>
            </div>
          );
        })}
      </div>
      <div className="stage-market-news">
        {latest ? latest.headline : '财经频道待命：棋盘交易会推动行业 ETF 波动'}
      </div>
    </div>
  );
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function DieFace({ style, value, rolling = false }: { style: DiceStyle; value?: number; rolling?: boolean }) {
  if (rolling || !value) {
    return <span className="die die-rolling">{style === 'classic' ? '🎲' : '?'}</span>;
  }
  if (style === 'classic') return <span className="die die-classic">{DICE_FACES[value - 1]}</span>;

  const pips = DICE_PIPS[value] ?? [];
  return (
    <span className={`die die-box die-${style}`} aria-label={`${value} 点`}>
      <span className="die-pip-grid">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={pips.includes(i + 1) ? 'die-pip on' : 'die-pip'} />
        ))}
      </span>
      {style === 'maple' && <span className="die-maple-mark">🍁</span>}
    </span>
  );
}

function phaseHint(game: GameState) {
  switch (game.phase) {
    case 'awaiting-buy': {
      const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
      return <span className="stage-phase">正在考虑购买 {tile?.name}…</span>;
    }
    case 'awaiting-card': {
      const pending = game.pendingCard;
      return (
        <span className="stage-phase">
          等待抽{pending?.deck === 'chance' ? '机会' : '宝箱'}卡…
        </span>
      );
    }
    case 'manage': return <span className="stage-phase">整理资产中…</span>;
    default: return null;
  }
}

function CardDrawBanner({ game }: { game: GameState }) {
  const pending = game.pendingCard!;
  const player = game.players.find((p) => p.id === pending.playerId);
  const tile = getTile(pending.tileId);
  const deckName = pending.deck === 'chance' ? '机会' : '宝箱';
  return (
    <div className={`stage-card-draw stage-card-draw-${pending.deck}`}>
      <div className="stage-card-draw-deck">{pending.deck === 'chance' ? '❓' : '🎁'} {deckName}卡</div>
      <div className="stage-card-draw-player">{player?.emoji} {player?.name} 请在手机上抽牌</div>
      <div className="stage-card-draw-hint">{tile.instruction}</div>
    </div>
  );
}

function DebtBanner({ game }: { game: GameState }) {
  const debt = game.debts[0]!;
  const debtor = game.players.find((p) => p.id === debt.debtor);
  const creditor = debt.creditor ? game.players.find((p) => p.id === debt.creditor) : null;
  return (
    <div className="stage-banner stage-banner-debt">
      💰 {debtor?.name} 需要筹 <b>${debt.amount}</b> 付给{creditor ? creditor.name : '银行'}
      <span className="stage-banner-sub">({debt.reason}) — 正在变卖资产…</span>
    </div>
  );
}

function TradeBanner({ game }: { game: GameState }) {
  const t = game.trade!;
  const from = game.players.find((p) => p.id === t.from);
  const to = game.players.find((p) => p.id === t.to);
  const side = (s: typeof t.give) => {
    const bits: string[] = [];
    if (s.cash > 0) bits.push(`$${s.cash}`);
    bits.push(...s.properties.map((id) => getTile(id).name));
    if (s.jailCards > 0) bits.push(`出狱卡×${s.jailCards}`);
    return bits.length ? bits.join(' + ') : '无';
  };
  return (
    <div className="stage-banner stage-banner-trade">
      🤝 {from?.name} 向 {to?.name} 提议: 用「{side(t.give)}」换「{side(t.get)}」
    </div>
  );
}

function AuctionPanel({ game }: { game: GameState }) {
  const a = game.auction!;
  const tile = getTile(a.tileId);
  const bidder = a.highBidder ? game.players.find((p) => p.id === a.highBidder) : null;
  const turn = game.players.find((p) => p.id === a.turn);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((a.deadline - now) / 1000));

  return (
    <div className="stage-auction">
      <div className="stage-auction-title">🔨 拍卖: {tile.name}</div>
      <div className="stage-auction-bid">
        {bidder
          ? <>当前最高 <b>${a.highBid}</b> — {bidder.emoji} {bidder.name}</>
          : <>尚无人出价 (原价 ${'price' in tile ? tile.price : '—'})</>}
      </div>
      <div className="stage-auction-turn">
        等 {turn?.emoji} {turn?.name} 表态 <span className="stage-auction-timer">{secondsLeft}s</span>
      </div>
    </div>
  );
}

function WinnerOverlay({ game, code }: { game: GameState; code: string }) {
  const winner = game.players.find((p) => p.id === game.winner);
  return (
    <div className="winner-overlay">
      <div className="winner-emoji">{winner?.emoji}</div>
      <h2>🏆 {winner?.name} 获胜!</h2>
      <button className="btn btn-primary btn-xl" onClick={() => socket.emit('lobby:reset', { code })}>
        🔁 再来一局
      </button>
    </div>
  );
}
