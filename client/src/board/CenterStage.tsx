import { useEffect, useState } from 'react';
import { getTile } from '@monopoly/shared';
import type { GameState } from '@monopoly/shared';
import { socket } from '../api';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export default function CenterStage({ game, code, shownDice, diceRolling, cardFlash }: {
  game: GameState;
  code: string;
  shownDice: [number, number] | null;
  diceRolling: boolean;
  cardFlash: { deck: string; text: string } | null;
}) {
  const current = game.players.find((p) => p.id === game.currentPlayer);

  return (
    <div className="stage">
      <div className="stage-brand">🍁 大富翁 · 加拿大版 <span className="stage-code">房间 {code}</span></div>

      {current && (
        <div className="stage-turn" style={{ borderColor: current.color }}>
          <span className="stage-turn-emoji">{current.emoji}</span>
          <span>轮到 <b style={{ color: current.color }}>{current.name}</b></span>
          {phaseHint(game)}
        </div>
      )}

      <div className={`stage-dice ${diceRolling ? 'rolling' : ''}`}>
        {diceRolling ? (
          <><span className="die">🎲</span><span className="die">🎲</span></>
        ) : shownDice ? (
          <>
            <span className="die">{DICE_FACES[shownDice[0] - 1]}</span>
            <span className="die">{DICE_FACES[shownDice[1] - 1]}</span>
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

function phaseHint(game: GameState) {
  switch (game.phase) {
    case 'awaiting-buy': {
      const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
      return <span className="stage-phase">正在考虑购买 {tile?.name}…</span>;
    }
    case 'manage': return <span className="stage-phase">整理资产中…</span>;
    default: return null;
  }
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
