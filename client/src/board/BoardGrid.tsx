import { memo, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { BOARD, GROUP_COLORS } from '@monopoly/shared';
import { tr } from '../i18n';
import { BoardFxLayer, BoardLandingPulse, BoardTokenLayer } from './BoardLayers';
import type { BoardAdapterProps } from './BoardLayers';
import { boardTileIcon, buildBoardScene } from './boardScene';
import type { BoardTileViewModel } from './boardScene';

export type { ConstructionFxItem, MoneyFxItem } from './BoardLayers';

/** 40 格在 11×11 网格中的位置 (1-indexed) */
function tileGridPos(id: number): { row: number; col: number } {
  if (id <= 10) return { row: 11, col: 11 - id };
  if (id <= 20) return { row: 11 - (id - 10), col: 1 };
  if (id <= 30) return { row: 1, col: id - 19 };
  return { row: id - 29, col: 11 };
}

export default function ClassicBoardAdapter({
  game, language, positions, rollingPlayerId, diceRolling, moneyFx, constructionFx, landedFx, children,
}: BoardAdapterProps) {
  const scene = useMemo(() => buildBoardScene(game, language), [game, language]);
  return (
    <div className="board-grid">
      {BOARD.map((tile) => (
        <TileView
          key={tile.id}
          view={scene.get(tile.id)!}
          language={language}
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

const TileView = memo(function TileView({ view, language, landedId }: {
  view: BoardTileViewModel;
  language: BoardAdapterProps['language'];
  landedId?: number | null;
}) {
  const { tile, side, name, instruction, ownable, ownership: own, owner } = view;
  const { row, col } = tileGridPos(tile.id);
  const classes = [
    'tile',
    `tile-${side}`,
    owner ? 'tile-owned' : '',
    view.monopoly ? 'tile-monopoly' : '',
    view.boom ? 'tile-boom' : '',
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
      <BoardLandingPulse id={landedId} className="tile-land-pulse" />
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
          {owner ? view.rentLabel : `$${view.price}`}
        </div>
      )}
      {owner && (
        <span className="tile-owner-chip" style={{ borderColor: owner.color }}>{owner.emoji}</span>
      )}
      {view.boom && <span className="tile-boom-chip" aria-hidden="true">🔥</span>}
      {own?.mortgaged && (
        <div className="tile-mort-stamp">{tr(language, '抵押', 'MORTGAGED', 'HYPOTHÉQUÉ')}</div>
      )}
    </div>
  );
});
