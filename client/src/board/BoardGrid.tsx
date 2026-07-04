import type { ReactNode } from 'react';
import { BOARD, GROUP_COLORS, getPlayerToken, isOwnable } from '@monopoly/shared';
import type { GameState, Tile } from '@monopoly/shared';

/** 40 格在 11×11 网格中的位置 (1-indexed) */
function tileGridPos(id: number): { row: number; col: number } {
  if (id <= 10) return { row: 11, col: 11 - id };
  if (id <= 20) return { row: 11 - (id - 10), col: 1 };
  if (id <= 30) return { row: 1, col: id - 19 };
  return { row: id - 29, col: 11 };
}

function tileSide(id: number): string {
  if (id % 10 === 0) return 'corner';
  if (id < 10) return 'bottom';
  if (id < 20) return 'left';
  if (id < 30) return 'top';
  return 'right';
}

const TILE_ICONS: Record<string, string> = {
  railroad: '🚆', utility: '', tax: '💸', chance: '❓', chest: '🎁',
  go: '🡆', jail: '🚔', 'free-parking': '🅿️', 'go-to-jail': '👮',
};

function tileIcon(tile: Tile): string {
  if (tile.type === 'utility') return tile.id === 12 ? '💡' : '🚰';
  return TILE_ICONS[tile.type] ?? '';
}

export default function BoardGrid({ game, positions, children }: {
  game: GameState;
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="board-grid">
      {BOARD.map((tile) => (
        <TileView
          key={tile.id}
          tile={tile}
          game={game}
          positions={positions}
          rollingPlayerId={rollingPlayerId}
          diceRolling={diceRolling}
        />
      ))}
      <div className="board-center">{children}</div>
    </div>
  );
}

function TileView({ tile, game, positions }: {
  tile: Tile;
  game: GameState;
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
}) {
  const { row, col } = tileGridPos(tile.id);
  const side = tileSide(tile.id);
  const own = game.ownership[tile.id];
  const owner = own?.owner ? game.players.find((p) => p.id === own.owner) : null;
  const tokens = game.players.filter(
    (p) => !p.bankrupt && (positions[p.id] ?? p.position) === tile.id,
  );

  return (
    <div
      className={`tile tile-${side} ${own?.mortgaged ? 'tile-mortgaged' : ''}`}
      title={`${tile.name}: ${tile.instruction}`}
      style={{
        gridRow: row,
        gridColumn: col,
        ...(owner ? { boxShadow: `inset 0 0 0 3px ${owner.color}` } : {}),
      }}
    >
      {tile.type === 'property' && (
        <div className="tile-bar" style={{ background: GROUP_COLORS[tile.group] }}>
          {own && own.houses > 0 && (
            <span className="tile-houses">
              {own.houses === 5 ? '🏨' : '▪'.repeat(own.houses)}
            </span>
          )}
        </div>
      )}
      <div className="tile-body">
        {tile.type !== 'property' && <div className="tile-icon">{tileIcon(tile)}</div>}
        <div className="tile-name">{tile.name}</div>
        <div className="tile-instruction">{tile.instruction}</div>
        {isOwnable(tile) && !owner && <div className="tile-price">${tile.price}</div>}
        {own?.mortgaged && <div className="tile-mort-mark">已抵押</div>}
      </div>
      {tokens.length > 0 && (
        <div className="tile-tokens">
          {tokens.map((p) => {
            const token = getPlayerToken(p.tokenId);
            const isRolling = diceRolling && p.id === rollingPlayerId;
            return (
              <span
                key={`${p.id}-${positions[p.id] ?? p.position}`}
                className={`token ${isRolling ? 'token-rolling' : ''}`}
                style={{ borderColor: p.color, background: `${p.color}33` }}
                title={`${p.name}${token ? ` - ${token.name}` : ''}`}
              >
                {p.emoji}
                {isRolling && (
                  <span className="token-roll-burst" aria-hidden="true">
                    <i>🎲</i>
                    <i>🎲</i>
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
