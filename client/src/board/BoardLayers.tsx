import type { CSSProperties } from 'react';
import { getPlayerToken } from '@monopoly/shared';
import type { PlayerState } from '@monopoly/shared';

export interface BoardPoint {
  x: number;
  y: number;
}

export type TilePointResolver = (tileId: number | null) => BoardPoint;

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

/** 同格多子的扇形偏移 (vh) */
const STACK_OFFSETS: [number, number][] = [
  [0, 0], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1], [0, -2.2],
];

/**
 * 两种棋盘共用的持久棋子层。adapter 只提供 tile → 百分比坐标的 geometry。
 */
export function BoardTokenLayer({
  players, positions, resolvePoint, rollingPlayerId, diceRolling, className = '',
}: {
  players: PlayerState[];
  positions: Record<string, number>;
  resolvePoint: TilePointResolver;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
  className?: string;
}) {
  const alive = players.filter((p) => !p.bankrupt);
  const stackIndex = new Map<string, number>();
  const perTile = new Map<number, number>();
  for (const player of alive) {
    const pos = positions[player.id] ?? player.position;
    const n = perTile.get(pos) ?? 0;
    stackIndex.set(player.id, n);
    perTile.set(pos, n + 1);
  }

  return (
    <div className={`token-layer ${className}`.trim()} aria-hidden="true">
      {alive.map((player) => {
        const pos = positions[player.id] ?? player.position;
        const { x, y } = resolvePoint(pos);
        const [ox, oy] = STACK_OFFSETS[stackIndex.get(player.id) ?? 0] ?? [0, 0];
        const token = getPlayerToken(player.tokenId);
        const isRolling = diceRolling && player.id === rollingPlayerId;
        return (
          <span
            key={player.id}
            className={`token token-glide ${isRolling ? 'token-rolling' : ''}`}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              '--stack-x': `${ox}vh`,
              '--stack-y': `${oy}vh`,
              borderColor: player.color,
              background: `${player.color}33`,
            } as CSSProperties}
            title={`${player.name}${token ? ` - ${token.name}` : ''}`}
          >
            {player.emoji}
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

export function BoardFxLayer({ moneyFx, constructionFx, resolvePoint, className = '' }: {
  moneyFx?: MoneyFxItem[];
  constructionFx?: ConstructionFxItem[];
  resolvePoint: TilePointResolver;
  className?: string;
}) {
  if (!moneyFx?.length && !constructionFx?.length) return null;
  return (
    <div className={`board-fx-layer ${className}`.trim()}>
      {moneyFx?.map((fx) => <MoneyFly key={fx.id} fx={fx} resolvePoint={resolvePoint} />)}
      {constructionFx?.map((fx) => <ConstructionBurst key={fx.id} fx={fx} resolvePoint={resolvePoint} />)}
    </div>
  );
}

function MoneyFly({ fx, resolvePoint }: { fx: MoneyFxItem; resolvePoint: TilePointResolver }) {
  const from = resolvePoint(fx.fromTile);
  const to = resolvePoint(fx.toTile);
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

function ConstructionBurst({ fx, resolvePoint }: {
  fx: ConstructionFxItem;
  resolvePoint: TilePointResolver;
}) {
  const center = resolvePoint(fx.tileId);
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
