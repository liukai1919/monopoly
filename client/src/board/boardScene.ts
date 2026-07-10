import { BOARD, isOwnable, ownsFullGroup } from '@monopoly/shared';
import type { GameState, Language, Ownership, PlayerState, Tile } from '@monopoly/shared';
import { localizeTileInstruction, localizeTileName } from '../i18n';
import { isBoomTile, liveRentLabel } from './deedInfo';

export interface BoardTileViewModel {
  tile: Tile;
  side: ReturnType<typeof boardTileSide>;
  name: string;
  instruction: string;
  ownable: boolean;
  ownership: Ownership | undefined;
  owner: PlayerState | null;
  price: number | null;
  rentLabel: string | null;
  monopoly: boolean;
  boom: boolean;
}

/** 两种棋盘共享的纯展示模型；每次服务器广播只计算一次。 */
export function buildBoardScene(game: GameState, language: Language): Map<number, BoardTileViewModel> {
  const map = new Map<number, BoardTileViewModel>();
  for (const tile of BOARD) {
    const ownable = isOwnable(tile);
    const own = game.ownership[tile.id];
    const owner = own?.owner ? game.players.find((player) => player.id === own.owner) ?? null : null;
    map.set(tile.id, {
      tile,
      side: boardTileSide(tile.id),
      name: localizeTileName(tile, language),
      instruction: localizeTileInstruction(tile, language),
      ownable,
      ownership: own,
      owner,
      price: ownable ? tile.price : null,
      rentLabel: ownable ? liveRentLabel(game, tile.id, language) : null,
      monopoly: tile.type === 'property' && !!own?.owner && ownsFullGroup(game, own.owner, tile.group),
      boom: ownable && isBoomTile(game, tile.id),
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

const TILE_ICONS: Partial<Record<Tile['type'], string>> = {
  railroad: '🚆', utility: '', tax: '💸', chance: '❓', chest: '🎁',
  go: '➜', jail: '🚔', 'free-parking': '🅿️', 'go-to-jail': '👮',
};

export function boardTileIcon(tile: Tile): string {
  if (tile.type === 'utility') return tile.id === 12 ? '💡' : '🚰';
  return TILE_ICONS[tile.type] ?? '';
}
