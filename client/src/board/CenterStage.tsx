import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { getTile } from '@monopoly/shared';
import type { DiceStyle, EtfId, GameState, Language } from '@monopoly/shared';
import {
  localizeDeckName, localizeEtfName, localizeTileInstruction, localizeTileName, tr,
} from '../i18n';

const DICE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const DIE_ORIENTATION: Record<number, { rx: string; ry: string }> = {
  1: { rx: '0deg', ry: '0deg' },
  2: { rx: '0deg', ry: '-90deg' },
  3: { rx: '-90deg', ry: '0deg' },
  4: { rx: '90deg', ry: '0deg' },
  5: { rx: '0deg', ry: '90deg' },
  6: { rx: '0deg', ry: '180deg' },
};

export default function CenterStage({ game, language, code, shownDice, diceRolling, rollingPlayerId, cardFlash }: {
  game: GameState;
  language: Language;
  code: string;
  shownDice: [number, number] | null;
  diceRolling: boolean;
  rollingPlayerId?: string | null;
  cardFlash: { deck: string; text: string } | null;
}) {
  const current = game.players.find((p) => p.id === game.currentPlayer);
  const rollingPlayer = rollingPlayerId ? game.players.find((p) => p.id === rollingPlayerId) : null;
  const diceStyle = game.settings.diceStyle ?? 'classic';

  return (
    <div className="stage">
      <CanadaAmbience />
      <div className="stage-brand">
        🍁 {tr(language, '大富翁 · 加拿大版', 'Monopoly · Canada Edition', 'Monopoly · Édition Canada')}
        <span className="stage-code">{tr(language, '房间', 'Room', 'Salle')} {code}</span>
      </div>
      <MarketTape game={game} language={language} />

      {current && (
        <div className="stage-turn" style={{ borderColor: current.color }}>
          <span className="stage-turn-emoji">{current.emoji}</span>
          <span>
            {tr(language, '轮到', 'Turn:', 'Tour de')} <b style={{ color: current.color }}>{current.name}</b>
          </span>
          {phaseHint(game, language)}
        </div>
      )}

      <div className={`stage-dice dice-style-${diceStyle} ${diceRolling ? 'rolling' : ''}`}>
        {diceRolling ? (
          <>
            <DieFace style={diceStyle} language={language} rolling spin={0} />
            <DieFace style={diceStyle} language={language} rolling spin={1} />
          </>
        ) : shownDice ? (
          <>
            <DieFace style={diceStyle} language={language} value={shownDice[0]} spin={0} />
            <DieFace style={diceStyle} language={language} value={shownDice[1]} spin={1} />
          </>
        ) : (
          <span className="stage-dice-empty">
            {tr(language, '等待掷骰…', 'Waiting for dice...', 'En attente des dés...')}
          </span>
        )}
      </div>
      {diceRolling && rollingPlayer && (
        <div className="stage-roll-call" style={{ borderColor: rollingPlayer.color }}>
          <span>{rollingPlayer.emoji}</span>
          <b style={{ color: rollingPlayer.color }}>{rollingPlayer.name}</b>
          <span>{tr(language, '正在掷骰', 'is rolling', 'lance les dés')}</span>
        </div>
      )}

      {game.settings.freeParkingPot && (
        <div className="stage-pot">
          🅿️ {tr(language, '停车奖池', 'Parking Pot', 'Cagnotte stationnement')}: <b>${game.pot}</b>
        </div>
      )}

      {game.phase === 'awaiting-debt' && game.debts[0] && <DebtBanner game={game} language={language} />}
      {game.trade && <TradeBanner game={game} language={language} />}
      {game.phase === 'awaiting-card' && game.pendingCard && <CardDrawBanner game={game} language={language} />}
      {game.phase === 'auction' && game.auction && <AuctionPanel game={game} language={language} />}

      {cardFlash && (
        <div className={`card-flash card-${cardFlash.deck}`}>
          <div className="card-flash-title">
            {cardFlash.deck === 'chance' ? '❓' : '🎁'} {localizeDeckName(cardFlash.deck as 'chance' | 'chest', language)}
          </div>
          <div className="card-flash-text">{cardFlash.text}</div>
        </div>
      )}

    </div>
  );
}

function CanadaAmbience() {
  return (
    <div className="canada-ambience" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <i
          key={i}
          style={{
            '--x': `${(i * 37) % 100}%`,
            '--delay': `${-(i * 0.72).toFixed(2)}s`,
            '--dur': `${8 + (i % 6) * 1.2}s`,
            '--size': `${3 + (i % 4)}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function MarketTape({ game, language }: { game: GameState; language: Language }) {
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
            <div className="stage-market-chip" key={etfId} title={localizeEtfName(etfId, language)}>
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
        {latest ? latest.headline : tr(
          language,
          '财经频道待命：棋盘交易会推动行业 ETF 波动',
          'Market channel standing by: board trades will move industry ETFs',
          'Chaîne marchés prête: les transactions du plateau feront bouger les FNB sectoriels',
        )}
      </div>
    </div>
  );
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function DieFace({
  style, language, value = 1, rolling = false, spin = 0,
}: { style: DiceStyle; language: Language; value?: number; rolling?: boolean; spin?: number }) {
  const orientation = rolling ? DIE_ORIENTATION[1] : DIE_ORIENTATION[value] ?? DIE_ORIENTATION[1];
  const cubeStyle = {
    '--rx': orientation.rx,
    '--ry': orientation.ry,
    '--spin-x': `${720 + spin * 180}deg`,
    '--spin-y': `${540 + spin * 240}deg`,
  } as CSSProperties;
  return (
    <span
      className={`die die-cube die-cube-${style} ${rolling ? 'die-cube-rolling' : 'die-cube-settled'}`}
      style={cubeStyle}
      aria-label={rolling
        ? tr(language, '骰子滚动中', 'Dice rolling', 'Dés en cours')
        : tr(language, `${value} 点`, `${value}`, `${value}`)}
    >
      <span className="die-cube-inner">
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span key={face} className={`die-cube-face die-cube-face-${face}`}>
            <span className="die-pip-grid">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={(DICE_PIPS[face] ?? []).includes(i + 1) ? 'die-pip on' : 'die-pip'} />
              ))}
            </span>
            {style === 'maple' && face === 1 && <span className="die-maple-mark">🍁</span>}
          </span>
        ))}
      </span>
    </span>
  );
}

function phaseHint(game: GameState, language: Language) {
  switch (game.phase) {
    case 'awaiting-buy': {
      const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
      return (
        <span className="stage-phase">
          {tr(
            language,
            `正在考虑购买 ${tile ? localizeTileName(tile, language) : ''}…`,
            `Considering ${tile ? localizeTileName(tile, language) : 'a property'}...`,
            `Décision d’achat: ${tile ? localizeTileName(tile, language) : 'une propriété'}...`,
          )}
        </span>
      );
    }
    case 'awaiting-card': {
      const pending = game.pendingCard;
      return (
        <span className="stage-phase">
          {tr(
            language,
            `等待抽${pending ? localizeDeckName(pending.deck, language) : ''}卡…`,
            `Waiting for ${pending ? localizeDeckName(pending.deck, language) : 'card'} draw...`,
            `En attente d’une carte ${pending ? localizeDeckName(pending.deck, language) : ''}...`,
          )}
        </span>
      );
    }
    case 'manage':
      return <span className="stage-phase">{tr(language, '整理资产中…', 'Managing assets...', 'Gestion des actifs...')}</span>;
    default: return null;
  }
}

function CardDrawBanner({ game, language }: { game: GameState; language: Language }) {
  const pending = game.pendingCard!;
  const player = game.players.find((p) => p.id === pending.playerId);
  const tile = getTile(pending.tileId);
  const deckName = localizeDeckName(pending.deck, language);
  return (
    <div className={`stage-card-draw stage-card-draw-${pending.deck}`}>
      <div className="stage-card-draw-deck">
        {pending.deck === 'chance' ? '❓' : '🎁'} {deckName}
      </div>
      <div className="stage-card-draw-player">
        {player?.emoji} {player?.name} {tr(language, '请在手机上抽牌', 'draw on your phone', 'piochez sur votre téléphone')}
      </div>
      <div className="stage-card-draw-hint">{localizeTileInstruction(tile, language)}</div>
    </div>
  );
}

function DebtBanner({ game, language }: { game: GameState; language: Language }) {
  const debt = game.debts[0]!;
  const debtor = game.players.find((p) => p.id === debt.debtor);
  const creditor = debt.creditor ? game.players.find((p) => p.id === debt.creditor) : null;
  return (
    <div className="stage-banner stage-banner-debt">
      💰 {tr(
        language,
        `${debtor?.name} 需要筹 `,
        `${debtor?.name} needs to raise `,
        `${debtor?.name} doit réunir `,
      )}
      <b>${debt.amount}</b>
      {tr(
        language,
        ` 付给${creditor ? creditor.name : '银行'}`,
        ` for ${creditor ? creditor.name : 'the bank'}`,
        ` pour ${creditor ? creditor.name : 'la banque'}`,
      )}
      <span className="stage-banner-sub">
        ({debt.reason}) - {tr(language, '正在变卖资产…', 'selling assets...', 'vente d’actifs...')}
      </span>
    </div>
  );
}

function TradeBanner({ game, language }: { game: GameState; language: Language }) {
  const t = game.trade!;
  const from = game.players.find((p) => p.id === t.from);
  const to = game.players.find((p) => p.id === t.to);
  const side = (s: typeof t.give) => {
    const bits: string[] = [];
    if (s.cash > 0) bits.push(`$${s.cash}`);
    bits.push(...s.properties.map((id) => localizeTileName(getTile(id), language)));
    if (s.jailCards > 0) bits.push(`${tr(language, '出狱卡', 'Jail card', 'Carte prison')}×${s.jailCards}`);
    return bits.length ? bits.join(' + ') : tr(language, '无', 'nothing', 'rien');
  };
  return (
    <div className="stage-banner stage-banner-trade">
      🤝 {tr(
        language,
        `${from?.name} 向 ${to?.name} 提议: 用「${side(t.give)}」换「${side(t.get)}」`,
        `${from?.name} offers ${to?.name}: "${side(t.give)}" for "${side(t.get)}"`,
        `${from?.name} propose à ${to?.name}: « ${side(t.give)} » contre « ${side(t.get)} »`,
      )}
    </div>
  );
}

function AuctionPanel({ game, language }: { game: GameState; language: Language }) {
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
      <div className="stage-auction-title">🔨 {tr(language, '拍卖', 'Auction', 'Enchère')}: {localizeTileName(tile, language)}</div>
      <div className="stage-auction-bid">
        {bidder
          ? <>{tr(language, '当前最高', 'High bid', 'Meilleure offre')} <b>${a.highBid}</b> - {bidder.emoji} {bidder.name}</>
          : <>{tr(language, '尚无人出价', 'No bids yet', 'Aucune offre')} ({tr(language, '原价', 'price', 'prix')} ${'price' in tile ? tile.price : '—'})</>}
      </div>
      <div className="stage-auction-turn">
        {tr(language, '等', 'Waiting for', 'Attend')} {turn?.emoji} {turn?.name}
        {' '}
        <span className="stage-auction-timer">{secondsLeft}s</span>
      </div>
    </div>
  );
}

