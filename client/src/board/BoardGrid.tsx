import { memo, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BOARD, GROUP_COLORS, isOwnable } from '@monopoly/shared';
import type { GameState, Language, Tile } from '@monopoly/shared';
import { localizeTileInstruction, localizeTileName, tr } from '../i18n';
import { BoardFxLayer, BoardTokenLayer } from './BoardLayers';
import type { ConstructionFxItem, MoneyFxItem } from './BoardLayers';
import { boardTileIcon, boardTileSide, buildBoardTileInfo } from './boardScene';
import type { BoardTileInfo } from './boardScene';

export type { ConstructionFxItem, MoneyFxItem } from './BoardLayers';

/** 40 格在 11×11 网格中的位置 (1-indexed) */
function tileGridPos(id: number): { row: number; col: number } {
  if (id <= 10) return { row: 11, col: 11 - id };
  if (id <= 20) return { row: 11 - (id - 10), col: 1 };
  if (id <= 30) return { row: 1, col: id - 19 };
  return { row: id - 29, col: 11 };
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
  const tileInfo = useMemo(() => buildBoardTileInfo(game, language), [game, language]);
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
      <BoardTokenLayer
        players={game.players}
        positions={positions}
        resolvePoint={classicTilePoint}
        rollingPlayerId={rollingPlayerId}
        diceRolling={diceRolling}
      />
      <BoardFxLayer moneyFx={moneyFx} constructionFx={constructionFx} resolvePoint={classicTilePoint} />
    </div>
  );
}

/** 网格轴心位置: 角格 1.5fr, 中间 9 格各 1fr, 总宽 12fr */
function axisCenterPct(i: number): number {
  if (i === 1) return (0.75 / 12) * 100;
  if (i === 11) return (11.25 / 12) * 100;
  return (i / 12) * 100;
}

function classicTilePoint(tileId: number | null): { x: number; y: number } {
  if (tileId == null) return { x: 50, y: 50 }; // 银行 = 棋盘中央
  const { row, col } = tileGridPos(tileId);
  return { x: axisCenterPct(col), y: axisCenterPct(row) };
}

const TileView = memo(function TileView({ tile, game, language, info, landedId }: {
  tile: Tile;
  game: GameState;
  language: Language;
  info?: BoardTileInfo;
  landedId?: number | null;
}) {
  const { row, col } = tileGridPos(tile.id);
  const side = boardTileSide(tile.id);
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
        {tile.type !== 'property' && <div className="tile-icon">{boardTileIcon(tile)}</div>}
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
