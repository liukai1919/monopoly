import { BOARD, isOwnable, ownsFullGroup } from '@monopoly/shared';
import type { GameState, Language, Tile } from '@monopoly/shared';
import { isBoomTile, liveRentLabel } from './deedInfo';

export interface BoardTileInfo {
  rentLabel: string | null;
  monopoly: boolean;
  boom: boolean;
}

/** 两种棋盘共享的纯展示模型；每次服务器广播只计算一次。 */
export function buildBoardTileInfo(game: GameState, language: Language): Map<number, BoardTileInfo> {
  const map = new Map<number, BoardTileInfo>();
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

export function boardTileSide(id: number): 'corner' | 'bottom' | 'left' | 'top' | 'right' {
  if (id % 10 === 0) return 'corner';
  if (id < 10) return 'bottom';
  if (id < 20) return 'left';
  if (id < 30) return 'top';
  return 'right';
}

const TILE_ICONS: Record<string, string> = {
  railroad: '🚆', utility: '', tax: '💸', chance: '❓', chest: '🎁',
  go: '➜', jail: '🚔', 'free-parking': '🅿️', 'go-to-jail': '👮',
};

export function boardTileIcon(tile: Tile): string {
  if (tile.type === 'utility') return tile.id === 12 ? '💡' : '🚰';
  return TILE_ICONS[tile.type] ?? '';
}
