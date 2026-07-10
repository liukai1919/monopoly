import { memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BOARD, GROUP_COLORS, isOwnable } from '@monopoly/shared';
import type { ColorGroup, GameState, Language, Tile } from '@monopoly/shared';
import { localizeTileInstruction, localizeTileName, tr } from '../i18n';
import { BoardFxLayer, BoardTokenLayer } from './BoardLayers';
import type { BoardPoint, ConstructionFxItem, MoneyFxItem } from './BoardLayers';
import { boardTileIcon, boardTileSide, buildBoardTileInfo } from './boardScene';
import type { BoardTileInfo } from './boardScene';

interface LivingCityBoardProps {
  game: GameState;
  language: Language;
  positions: Record<string, number>;
  rollingPlayerId?: string | null;
  diceRolling?: boolean;
  moneyFx?: MoneyFxItem[];
  constructionFx?: ConstructionFxItem[];
  landedFx?: { tile: number; id: number } | null;
  children?: ReactNode;
}

/**
 * 城市棋盘仍沿用 0 → 39 的经典路径，只改变空间 geometry。
 * 道路故意有轻微折线，让八个色组看起来像独立街区，而非换皮方格。
 */
export function livingCityTilePoint(tileId: number | null): BoardPoint {
  if (tileId == null) return { x: 50, y: 50 };
  if (tileId === 0) return { x: 90, y: 90 };
  if (tileId < 10) return { x: 82 - (tileId - 1) * 8, y: tileId % 2 ? 88 : 84 };
  if (tileId === 10) return { x: 10, y: 90 };
  if (tileId < 20) return { x: tileId % 2 ? 12 : 16, y: 82 - (tileId - 11) * 8 };
  if (tileId === 20) return { x: 10, y: 10 };
  if (tileId < 30) return { x: 18 + (tileId - 21) * 8, y: tileId % 2 ? 12 : 16 };
  if (tileId === 30) return { x: 90, y: 10 };
  return { x: tileId % 2 ? 88 : 84, y: 18 + (tileId - 31) * 8 };
}

const ROUTE_POINTS = [...BOARD.map((tile) => livingCityTilePoint(tile.id)), livingCityTilePoint(0)]
  .map(({ x, y }) => `${x},${y}`)
  .join(' ');

const COLOR_GROUPS = Object.keys(GROUP_COLORS) as ColorGroup[];

export default function LivingCityBoard({
  game, language, positions, rollingPlayerId, diceRolling, moneyFx, constructionFx, landedFx, children,
}: LivingCityBoardProps) {
  const tileInfo = useMemo(() => buildBoardTileInfo(game, language), [game, language]);
  const latestTileId = game.market.recentEvents.at(-1)?.tileId;

  return (
    <div className="living-city-board">
      <CityInfrastructure game={game} latestTileId={latestTileId} />
      <div className="living-city-caption" aria-hidden="true">
        <span>{tr(language, '城市经济环线', 'CITY ECONOMY LOOP', 'BOUCLE ÉCONOMIQUE')}</span>
        <i />
      </div>
      {BOARD.map((tile) => (
        <CityTile
          key={tile.id}
          tile={tile}
          game={game}
          language={language}
          info={tileInfo.get(tile.id)}
          landedId={landedFx?.tile === tile.id ? landedFx.id : null}
          marketActive={latestTileId === tile.id}
        />
      ))}
      <div className="living-city-center">{children}</div>
      <BoardTokenLayer
        players={game.players}
        positions={positions}
        resolvePoint={livingCityTilePoint}
        rollingPlayerId={rollingPlayerId}
        diceRolling={diceRolling}
        className="living-city-token-layer"
      />
      <BoardFxLayer
        moneyFx={moneyFx}
        constructionFx={constructionFx}
        resolvePoint={livingCityTilePoint}
        className="living-city-fx-layer"
      />
    </div>
  );
}

function CityInfrastructure({ game, latestTileId }: { game: GameState; latestTileId?: number }) {
  const boomTiles = game.settings.industryBoom && game.boomIndustry
    ? BOARD.filter((tile) => tile.industries.includes(game.boomIndustry!))
    : [];

  return (
    <svg className="living-city-infrastructure" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="city-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="city-core-glow">
          <stop offset="0" stopColor="#6fffd8" stopOpacity=".28" />
          <stop offset="1" stopColor="#6fffd8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" className="city-night-sky" />
      <circle cx="50" cy="50" r="31" fill="url(#city-core-glow)" />
      {COLOR_GROUPS.map((group) => {
        const points = BOARD
          .filter((tile) => tile.type === 'property' && tile.group === group)
          .map((tile) => livingCityTilePoint(tile.id));
        const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const vertical = x < 22 || x > 78;
        return (
          <ellipse
            key={group}
            cx={x}
            cy={y}
            rx={vertical ? 6.5 : 10}
            ry={vertical ? 10 : 6.5}
            fill={GROUP_COLORS[group]}
            className="city-district-halo"
          />
        );
      })}
      <polyline points={ROUTE_POINTS} className="city-road-shadow" />
      <polyline points={ROUTE_POINTS} className="city-road" />
      <polyline points={ROUTE_POINTS} className="city-road-lanes" />
      {boomTiles.map((tile, index) => {
        const point = livingCityTilePoint(tile.id);
        return (
          <line
            key={tile.id}
            x1="50"
            y1="50"
            x2={point.x}
            y2={point.y}
            className="city-boom-link"
            style={{ '--link-delay': `${index * -0.18}s` } as CSSProperties}
          />
        );
      })}
      {latestTileId != null && (
        <line
          x1="50"
          y1="50"
          x2={livingCityTilePoint(latestTileId).x}
          y2={livingCityTilePoint(latestTileId).y}
          className="city-market-link"
          filter="url(#city-glow)"
        />
      )}
    </svg>
  );
}

const CityTile = memo(function CityTile({
  tile, game, language, info, landedId, marketActive,
}: {
  tile: Tile;
  game: GameState;
  language: Language;
  info?: BoardTileInfo;
  landedId?: number | null;
  marketActive: boolean;
}) {
  const point = livingCityTilePoint(tile.id);
  const side = boardTileSide(tile.id);
  const own = game.ownership[tile.id];
  const owner = own?.owner ? game.players.find((player) => player.id === own.owner) : null;
  const ownable = isOwnable(tile);
  const name = localizeTileName(tile, language);
  const instruction = localizeTileInstruction(tile, language);
  const accent = tile.type === 'property' ? GROUP_COLORS[tile.group] : cityTileAccent(tile);
  const classes = [
    'living-city-tile',
    `living-city-tile-${side}`,
    ownable ? 'living-city-tile-ownable' : 'living-city-tile-event',
    owner ? 'is-owned' : 'is-unowned',
    info?.monopoly ? 'is-monopoly' : '',
    info?.boom ? 'is-boom' : '',
    own?.mortgaged ? 'is-mortgaged' : '',
    marketActive ? 'is-market-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      data-side={side}
      title={`${name}: ${instruction}`}
      aria-label={`${name}. ${instruction}`}
      style={{
        '--city-x': `${point.x}%`,
        '--city-y': `${point.y}%`,
        '--city-accent': accent,
        ...(owner ? { '--owner-color': owner.color } : {}),
      } as CSSProperties}
    >
      {landedId != null && <span key={landedId} className="city-land-pulse" aria-hidden="true" />}
      <span className="city-tile-index">{String(tile.id).padStart(2, '0')}</span>
      <span className="city-tile-accent" />
      <div className="city-tile-main">
        {tile.type !== 'property' && <span className="city-tile-icon">{boardTileIcon(tile)}</span>}
        {tile.type === 'property' && <CityBuildings houses={own?.houses ?? 0} />}
        <span className="city-tile-name">{name}</span>
        {ownable && language !== 'en' && <span className="city-tile-name-en">{tile.nameEn}</span>}
      </div>
      {ownable ? (
        <span className={`city-tile-value ${owner ? 'is-rent' : ''}`}>
          {owner ? info?.rentLabel : `$${tile.price}`}
        </span>
      ) : (
        <span className="city-tile-value city-tile-action">{shortInstruction(tile, language)}</span>
      )}
      {owner && <span className="city-owner-node" style={{ borderColor: owner.color }}>{owner.emoji}</span>}
      {info?.boom && <span className="city-boom-node" aria-label={tr(language, '景气行业', 'Boom industry', 'Secteur en essor')}>🔥</span>}
      {own?.mortgaged && <span className="city-mortgage-shutter">{tr(language, '抵押', 'CLOSED', 'FERMÉ')}</span>}
    </div>
  );
});

function CityBuildings({ houses }: { houses: number }) {
  if (houses <= 0) return <span className="city-vacant-lot" aria-hidden="true"><i /><i /><i /></span>;
  if (houses === 5) return <span className="city-hotel" aria-hidden="true"><i /><i /><i /><i /></span>;
  return (
    <span className="city-buildings" aria-hidden="true">
      {Array.from({ length: houses }, (_, index) => <i key={index} style={{ height: `${45 + index * 13}%` }} />)}
    </span>
  );
}

function shortInstruction(tile: Tile, language: Language): string {
  if (tile.type === 'tax') return `$${tile.amount}`;
  if (tile.type === 'chance') return tr(language, '抽机会', 'CHANCE', 'CHANCE');
  if (tile.type === 'chest') return tr(language, '抽宝箱', 'CHEST', 'CAISSE');
  if (tile.type === 'go') return tr(language, '领取 $200', 'COLLECT $200', 'RECEVEZ 200 $');
  if (tile.type === 'jail') return tr(language, '探监 / 监狱', 'JUST VISITING', 'EN VISITE');
  if (tile.type === 'free-parking') return tr(language, '自由停靠', 'FREE STOP', 'ARRÊT LIBRE');
  return tr(language, '立即入狱', 'GO TO JAIL', 'EN PRISON');
}

function cityTileAccent(tile: Tile): string {
  switch (tile.type) {
    case 'property': return GROUP_COLORS[tile.group];
    case 'railroad': return '#95a6ba';
    case 'utility': return '#59c9d6';
    case 'chance': return '#b690ff';
    case 'chest': return '#f5bd57';
    case 'tax': return '#ff7272';
    case 'go': return '#7bffc1';
    case 'jail': return '#91a1b5';
    case 'free-parking': return '#70d7ff';
    case 'go-to-jail': return '#ff896f';
  }
}
