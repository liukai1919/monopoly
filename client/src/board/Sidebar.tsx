import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BOARD, GROUP_COLORS, getPlayerToken, isOwnable } from '@monopoly/shared';
import type { GameState, Language } from '@monopoly/shared';
import { emitAck } from '../api';
import { localizeMessage, localizeTileName, tr } from '../i18n';

export interface CashFloatItem { id: number; playerId: string; delta: number; }

export default function Sidebar({ game, language, code, joinUrl, displayCash, cashFloats }: {
  game: GameState;
  language: Language;
  code: string;
  joinUrl: string;
  /** 动画中的现金数字 (与事件泵同步); 缺省时直接显示状态值 */
  displayCash?: Record<string, number>;
  cashFloats?: CashFloatItem[];
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-players">
        {game.players.map((p) => (
          <PlayerCard
            key={p.id}
            game={game}
            language={language}
            playerId={p.id}
            shownCash={displayCash?.[p.id]}
            floats={cashFloats?.filter((f) => f.playerId === p.id) ?? []}
          />
        ))}
      </div>
      <LogPanel game={game} />
      <SettlementControl game={game} language={language} code={code} />
      <div className="sidebar-footer">
        {joinUrl && <QRCodeSVG value={joinUrl} size={64} marginSize={1} />}
        <div>
          <div className="sidebar-code">{tr(language, '房间', 'Room', 'Salle')} {code}</div>
          <div className="sidebar-url">{joinUrl}</div>
        </div>
      </div>
    </div>
  );
}

function SettlementControl({ game, language, code }: { game: GameState; language: Language; code: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const disabled = pending || game.phase === 'game-over';

  useEffect(() => {
    setError('');
  }, [game.phase, game.turnCount]);

  async function settleNow() {
    if (disabled) return;
    if (!window.confirm(tr(
      language,
      '确定按净资产立即结算本局吗？',
      'Settle this game immediately by net worth?',
      'Régler immédiatement cette partie selon la valeur nette?',
    ))) return;
    setPending(true);
    setError('');
    const res = await emitAck('game:settle', { code });
    setPending(false);
    if (res?.error) setError(localizeMessage(res.error, language));
  }

  return (
    <div className="sidebar-controls">
      <button className="btn btn-danger" disabled={disabled} onClick={() => void settleNow()}>
        {pending
          ? tr(language, '结算中...', 'Settling...', 'Règlement...')
          : tr(language, '立即结算', 'Settle Now', 'Régler maintenant')}
      </button>
      {error && <div className="sidebar-control-error">{error}</div>}
    </div>
  );
}

function PlayerCard({ game, language, playerId, shownCash, floats }: {
  game: GameState;
  language: Language;
  playerId: string;
  shownCash?: number;
  floats: CashFloatItem[];
}) {
  const p = game.players.find((x) => x.id === playerId)!;
  const token = getPlayerToken(p.tokenId);
  const isCurrent = game.currentPlayer === p.id && game.phase !== 'game-over';
  const props = Object.entries(game.ownership)
    .filter(([, o]) => o.owner === p.id)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);

  return (
    <div
      className={`player-card ${isCurrent ? 'player-card-current' : ''} ${p.bankrupt ? 'player-card-bankrupt' : ''}`}
      style={{ borderLeftColor: p.color }}
    >
      <div className="player-card-top">
        <span className="player-card-emoji">{p.emoji}</span>
        <span className="player-card-name" style={{ color: p.color }}>{p.name}</span>
        {token && <span className="tag">{token.name}</span>}
        {p.isAi && <span className="tag">AI</span>}
        {p.inJail && <span className="tag tag-warn">🚔 {tr(language, '蹲监狱', 'In jail', 'En prison')}</span>}
        {!p.isAi && !p.connected && !p.bankrupt && (
          <span className="tag tag-warn">📴 {tr(language, '掉线', 'Offline', 'Hors ligne')}</span>
        )}
        {p.bankrupt && <span className="tag tag-dead">{tr(language, '破产', 'Bankrupt', 'Faillite')}</span>}
        {p.jailCards.length > 0 && <span className="tag">🎫×{p.jailCards.length}</span>}
      </div>
      <div className="player-card-cash">
        ${shownCash ?? p.cash}
        {floats.map((f) => (
          <span key={f.id} className={`cash-float ${f.delta >= 0 ? 'cash-float-up' : 'cash-float-down'}`}>
            {f.delta >= 0 ? '+' : '-'}${Math.abs(f.delta)}
          </span>
        ))}
      </div>
      <div className="player-card-props">
        {props.map((id) => {
          const tile = BOARD[id]!;
          if (!isOwnable(tile)) return null;
          const own = game.ownership[id]!;
          const color = tile.type === 'property' ? GROUP_COLORS[tile.group]
            : tile.type === 'railroad' ? '#333' : '#7f8c8d';
          return (
            <span
              key={id}
              className={`prop-chip ${own.mortgaged ? 'prop-chip-mortgaged' : ''}`}
              style={{ background: color }}
              title={`${localizeTileName(tile, language)}${own.mortgaged ? ` (${tr(language, '已抵押', 'mortgaged', 'hypothéqué')})` : ''}${own.houses ? ` ${tr(language, '房', 'house', 'maison')}×${own.houses}` : ''}`}
            >
              {own.houses === 5 ? 'H' : own.houses > 0 ? own.houses : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LogPanel({ game }: { game: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [game.log.length, game.log[game.log.length - 1]?.ts]);

  return (
    <div className="log-panel" ref={ref}>
      {game.log.slice(-30).map((entry, i) => (
        <div className="log-line" key={`${entry.ts}-${i}`}>{entry.text}</div>
      ))}
    </div>
  );
}
