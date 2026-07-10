import {
  computeRent, getTile, isBoomTile, railroadsOwned, utilitiesOwned,
} from '@monopoly/shared';
import type { GameState, Language, Tile } from '@monopoly/shared';
import { tr } from '../i18n';

/** 地契租金表 (中/英/法), 大屏地契卡与手机资产卡共用 */
export function rentRows(tile: Tile, language: Language): [string, string][] {
  if (tile.type === 'property') {
    return [
      [tr(language, '空地租金', 'Base rent', 'Loyer de base'), `$${tile.rent[0]}`],
      [tr(language, '1 栋房', '1 house', '1 maison'), `$${tile.rent[1]}`],
      [tr(language, '2 栋房', '2 houses', '2 maisons'), `$${tile.rent[2]}`],
      [tr(language, '3 栋房', '3 houses', '3 maisons'), `$${tile.rent[3]}`],
      [tr(language, '4 栋房', '4 houses', '4 maisons'), `$${tile.rent[4]}`],
      [tr(language, '酒店', 'Hotel', 'Hôtel'), `$${tile.rent[5]}`],
    ];
  }
  if (tile.type === 'railroad') {
    return [
      [tr(language, '拥有 1 条铁路', 'Own 1 railroad', 'Posséder 1 chemin de fer'), '$25'],
      [tr(language, '拥有 2 条铁路', 'Own 2 railroads', 'Posséder 2 chemins de fer'), '$50'],
      [tr(language, '拥有 3 条铁路', 'Own 3 railroads', 'Posséder 3 chemins de fer'), '$100'],
      [tr(language, '拥有 4 条铁路', 'Own 4 railroads', 'Posséder 4 chemins de fer'), '$200'],
    ];
  }
  if (tile.type === 'utility') {
    return [
      [tr(language, '拥有 1 家', 'Own 1 utility', 'Posséder 1 service'), tr(language, '骰点 ×4', 'Dice total ×4', 'Total des dés ×4')],
      [tr(language, '拥有 2 家', 'Own 2 utilities', 'Posséder 2 services'), tr(language, '骰点 ×10', 'Dice total ×10', 'Total des dés ×10')],
      [tr(language, '机会卡指定', 'Chance card', 'Carte Chance'), tr(language, '骰点 ×10', 'Dice total ×10', 'Total des dés ×10')],
    ];
  }
  return [];
}

/** 当前生效的租金档在 rentRows 里的行号; 无主返回 null */
export function currentRentTierIndex(game: GameState, tileId: number): number | null {
  const tile = getTile(tileId);
  const own = game.ownership[tileId];
  if (!own?.owner) return null;
  if (tile.type === 'property') return own.houses;
  if (tile.type === 'railroad') return railroadsOwned(game, own.owner) - 1;
  if (tile.type === 'utility') return utilitiesOwned(game, own.owner) === 2 ? 1 : 0;
  return null;
}

/** 棋盘格子上的实时租金短标签; 无主/抵押返回 null */
export function liveRentLabel(game: GameState, tileId: number, language: Language): string | null {
  const tile = getTile(tileId);
  const own = game.ownership[tileId];
  if (!own?.owner || own.mortgaged) return null;
  if (tile.type === 'utility') {
    const mult = utilitiesOwned(game, own.owner) === 2 ? 10 : 4;
    return tr(language, `租 骰×${mult}`, `Rent ⚄×${mult}`, `Loyer ⚄×${mult}`);
  }
  const rent = computeRent(game, tileId, 0);
  return tr(language, `租 $${rent}`, `Rent $${rent}`, `Loyer $${rent}`);
}

export { isBoomTile };
