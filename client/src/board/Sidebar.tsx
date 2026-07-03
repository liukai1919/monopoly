import { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BOARD, GROUP_COLORS, getPlayerToken, isOwnable } from '@monopoly/shared';
import type { GameState } from '@monopoly/shared';

export default function Sidebar({ game, code, joinUrl }: {
  game: GameState;
  code: string;
  joinUrl: string;
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-players">
        {game.players.map((p) => (
          <PlayerCard key={p.id} game={game} playerId={p.id} />
        ))}
      </div>
      <LogPanel game={game} />
      <div className="sidebar-footer">
        {joinUrl && <QRCodeSVG value={joinUrl} size={64} marginSize={1} />}
        <div>
          <div className="sidebar-code">房间 {code}</div>
          <div className="sidebar-url">{joinUrl}</div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ game, playerId }: { game: GameState; playerId: string }) {
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
        {p.inJail && <span className="tag tag-warn">🚔 蹲监狱</span>}
        {!p.isAi && !p.connected && !p.bankrupt && <span className="tag tag-warn">📴 掉线</span>}
        {p.bankrupt && <span className="tag tag-dead">破产</span>}
        {p.jailCards.length > 0 && <span className="tag">🎫×{p.jailCards.length}</span>}
      </div>
      <div className="player-card-cash">${p.cash}</div>
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
              title={`${tile.name}${own.mortgaged ? ' (已抵押)' : ''}${own.houses ? ` 房×${own.houses}` : ''}`}
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
