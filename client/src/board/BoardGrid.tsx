import { memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BOARD, GROUP_COLORS, getPlayerToken, isOwnable, ownsFullGroup } from '@monopoly/shared';
import type { GameState, Language, PlayerState, Tile } from '@monopoly/shared';
import { localizeTileInstruction, localizeTileName, tr } from '../i18n';
import { isBoomTile, liveRentLabel } from './deedInfo';

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

/** 每个可购格的展示信息, 每次广播算一次 (棋子移动的高频重渲染不重复算) */
interface TileInfo {
  rentLabel: string | null;
  monopoly: boolean;
  boom: boolean;
}

function buildTileInfoMap(game: GameState, language: Language): Map<number, TileInfo> {
  const map = new Map<number, TileInfo>();
  for (const tile of BOARD) {
    if (!isOwnable(tile)) continue;
    const own = game.ownership[tile.id];
    map.set(tile.id, {
      rentLabel: liveRentLabel(game, tile.id, language),
      monopoly: tile.type === 'property' && !!own?.owner && ownsFullGroup(game, own.owner, tile.group),
      boom: isBoomTile(game, tile.id),
    });
  }
  return map;
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
  const tileInfo = useMemo(() => buildTileInfoMap(game, language), [game, language]);
  const hasFx = (moneyFx && moneyFx.length > 0) || (constructionFx && constructionFx.length > 0);
  return (
    <div className="board-grid">
      {BOARD.map((tile) => (
        <TileView
          key={tile.id}
          tile={tile}
          game={game}
          language={language}
          info={tileInfo.get(tile.id)}
          landedId={landedFx?.tile === tile.id ? landedFx.id : null}
        />
      ))}
      <div className="board-center">{children}</div>
      <TokenLayer
        players={game.players}
        positions={positions}
        rollingPlayerId={rollingPlayerId}
        diceRolling={diceRolling}
      />
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

/** 同格多子的扇形偏移 (vh) */
const STACK_OFFSETS: [number, number][] = [
  [0, 0], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1], [0, -2.2],
];

/**
 * 棋盘级棋子层: 每个棋子节点持久化 (key=玩家id, 永不重挂载),
 * left/top 过渡让逐格移动连成滑行, 也让格子组件不再随移动重渲染。
 */
function TokenLayer({ players, positions, rollingPlayerId, diceRolling }: {
  players: PlayerState[];
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
}) {
  const alive = players.filter((p) => !p.bankrupt);
  const stackIndex = new Map<string, number>();
  const perTile = new Map<number, number>();
  for (const p of alive) {
    const pos = positions[p.id] ?? p.position;
    const n = perTile.get(pos) ?? 0;
    stackIndex.set(p.id, n);
    perTile.set(pos, n + 1);
  }

  return (
    <div className="token-layer" aria-hidden="true">
      {alive.map((p) => {
        const pos = positions[p.id] ?? p.position;
        const { x, y } = tileCenterPct(pos);
        const [ox, oy] = STACK_OFFSETS[stackIndex.get(p.id) ?? 0] ?? [0, 0];
        const token = getPlayerToken(p.tokenId);
        const isRolling = diceRolling && p.id === rollingPlayerId;
        return (
          <span
            key={p.id}
            className={`token token-glide ${isRolling ? 'token-rolling' : ''}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              '--stack-x': `${ox}vh`,
              '--stack-y': `${oy}vh`,
              borderColor: p.color,
              background: `${p.color}33`,
            } as CSSProperties}
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
  );
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

const TileView = memo(function TileView({ tile, game, language, info, landedId }: {
  tile: Tile;
  game: GameState;
  language: Language;
  info?: TileInfo;
  landedId?: number | null;
}) {
  const { row, col } = tileGridPos(tile.id);
  const side = tileSide(tile.id);
  const own = game.ownership[tile.id];
  const owner = own?.owner ? game.players.find((p) => p.id === own.owner) : null;
  const name = localizeTileName(tile, language);
  const instruction = localizeTileInstruction(tile, language);
  const ownable = isOwnable(tile);
  const classes = [
    'tile',
    `tile-${side}`,
    owner ? 'tile-owned' : '',
    info?.monopoly ? 'tile-monopoly' : '',
    info?.boom ? 'tile-boom' : '',
    own?.mortgaged ? 'tile-mortgaged' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      title={`${name}: ${instruction}`}
      style={{
        gridRow: row,
        gridColumn: col,
        ...(owner ? { '--owner-color': owner.color } : {}),
      } as CSSProperties}
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
        {ownable && language !== 'en' && <div className="tile-name-en">{tile.nameEn}</div>}
        {!ownable && <div className="tile-instruction">{instruction}</div>}
      </div>
      {ownable && !own?.mortgaged && (
        <div className={`tile-price-band ${owner ? 'tile-price-band-rent' : ''}`}>
          {owner ? info?.rentLabel : `$${tile.price}`}
        </div>
      )}
      {owner && (
        <span className="tile-owner-chip" style={{ borderColor: owner.color }}>{owner.emoji}</span>
      )}
      {info?.boom && <span className="tile-boom-chip" aria-hidden="true">🔥</span>}
      {own?.mortgaged && (
        <div className="tile-mort-stamp">{tr(language, '抵押', 'MORTGAGED', 'HYPOTHÉQUÉ')}</div>
      )}
    </div>
  );
});
