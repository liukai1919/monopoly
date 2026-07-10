import type { CSSProperties, ReactNode } from 'react';
import { BOARD, GROUP_COLORS, getPlayerToken, isOwnable } from '@monopoly/shared';
import type { GameState, Language, Tile } from '@monopoly/shared';
import { localizeTileInstruction, localizeTileName, tr } from '../i18n';

/** 一笔正在飞行的钱; fromTile/toTile 为 null 表示银行(棋盘中央) */
export interface MoneyFxItem {
  id: number;
  fromTile: number | null;
  toTile: number | null;
  amount: number;
}
export interface ConstructionFxItem {
  id: number;
  tileId: number;
  building: 'house' | 'hotel';
}

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

export default function BoardGrid({
  game, language, positions, rollingPlayerId, diceRolling, moneyFx, constructionFx, landedFx, children,
}: {
  game: GameState;
  language: Language;
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
  moneyFx?: MoneyFxItem[];
  constructionFx?: ConstructionFxItem[];
  landedFx?: { tile: number; id: number } | null;
  children?: ReactNode;
}) {
  const hasFx = (moneyFx && moneyFx.length > 0) || (constructionFx && constructionFx.length > 0);
  return (
    <div className="board-grid">
      {BOARD.map((tile) => (
        <TileView
          key={tile.id}
          tile={tile}
          game={game}
          language={language}
          positions={positions}
          rollingPlayerId={rollingPlayerId}
          diceRolling={diceRolling}
          landedId={landedFx?.tile === tile.id ? landedFx.id : null}
        />
      ))}
      <div className="board-center">{children}</div>
      {hasFx && (
        <div className="board-fx-layer">
          {moneyFx?.map((fx) => <MoneyFly key={fx.id} fx={fx} />)}
          {constructionFx?.map((fx) => <ConstructionBurst key={fx.id} fx={fx} />)}
        </div>
      )}
    </div>
  );
}

/** 网格轴心位置: 角格 1.5fr, 中间 9 格各 1fr, 总宽 12fr */
function axisCenterPct(i: number): number {
  if (i === 1) return (0.75 / 12) * 100;
  if (i === 11) return (11.25 / 12) * 100;
  return (i / 12) * 100;
}

function tileCenterPct(tileId: number | null): { x: number; y: number } {
  if (tileId == null) return { x: 50, y: 50 }; // 银行 = 棋盘中央
  const { row, col } = tileGridPos(tileId);
  return { x: axisCenterPct(col), y: axisCenterPct(row) };
}

function MoneyFly({ fx }: { fx: MoneyFxItem }) {
  const from = tileCenterPct(fx.fromTile);
  const to = tileCenterPct(fx.toTile);
  const style = {
    '--fx': `${from.x}%`,
    '--fy': `${from.y}%`,
    '--tx': `${to.x}%`,
    '--ty': `${to.y}%`,
  } as CSSProperties;
  return (
    <div className="money-fly" style={style}>
      <span className="money-bill">💵</span>
      <span className="money-bill" style={{ animationDelay: '110ms' }}>💵</span>
      <span className="money-bill" style={{ animationDelay: '220ms' }}>💵</span>
      <span className="money-amount">${fx.amount}</span>
    </div>
  );
}

function ConstructionBurst({ fx }: { fx: ConstructionFxItem }) {
  const center = tileCenterPct(fx.tileId);
  const style = {
    '--tx': `${center.x}%`,
    '--ty': `${center.y}%`,
  } as CSSProperties;
  return (
    <div className={`construction-burst construction-${fx.building}`} style={style}>
      <span className="construction-ring" />
      <span className="construction-spark construction-spark-a">✦</span>
      <span className="construction-spark construction-spark-b">✧</span>
      <span className="construction-tools">🏗️</span>
      <img
        className="construction-building"
        src={fx.building === 'hotel' ? '/assets/hotel.svg' : '/assets/house.svg'}
        alt=""
      />
    </div>
  );
}

function TileView({ tile, game, language, positions, rollingPlayerId, diceRolling, landedId }: {
  tile: Tile;
  game: GameState;
  language: Language;
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
  landedId?: number | null;
}) {
  const { row, col } = tileGridPos(tile.id);
  const side = tileSide(tile.id);
  const own = game.ownership[tile.id];
  const owner = own?.owner ? game.players.find((p) => p.id === own.owner) : null;
  const name = localizeTileName(tile, language);
  const instruction = localizeTileInstruction(tile, language);
  const tokens = game.players.filter(
    (p) => !p.bankrupt && (positions[p.id] ?? p.position) === tile.id,
  );

  return (
    <div
      className={`tile tile-${side} ${own?.mortgaged ? 'tile-mortgaged' : ''}`}
      title={`${name}: ${instruction}`}
      style={{
        gridRow: row,
        gridColumn: col,
        ...(owner ? { boxShadow: `inset 0 0 0 3px ${owner.color}` } : {}),
      }}
    >
      {landedId != null && <span key={landedId} className="tile-land-pulse" aria-hidden="true" />}
      {tile.type === 'property' && (
        <div className="tile-bar" style={{ background: GROUP_COLORS[tile.group] }}>
          {own && own.houses > 0 && (
            <span className={`tile-buildings ${own.houses === 5 ? 'tile-buildings-hotel' : ''}`}>
              {own.houses === 5 ? (
                <img className="tile-building-img tile-hotel-img" src="/assets/hotel.svg" alt={tr(language, '酒店', 'Hotel', 'Hôtel')} />
              ) : Array.from({ length: own.houses }, (_, i) => (
                <img key={i} className="tile-building-img" src="/assets/house.svg" alt={tr(language, '房子', 'House', 'Maison')} />
              ))}
            </span>
          )}
        </div>
      )}
      <div className="tile-body">
        {tile.type !== 'property' && <div className="tile-icon">{tileIcon(tile)}</div>}
        <div className="tile-name">{name}</div>
        <div className="tile-instruction">{instruction}</div>
        {isOwnable(tile) && !owner && <div className="tile-price">${tile.price}</div>}
        {own?.mortgaged && <div className="tile-mort-mark">{tr(language, '已抵押', 'Mortgaged', 'Hypothéqué')}</div>}
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
