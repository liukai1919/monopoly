import {
  GROUP_COLORS, canBuild, canMortgage, canSellHouse, canUnmortgage, getTile, isOwnable,
  mortgageValue, playerProperties, unmortgageCost,
} from '@monopoly/shared';
import type { Action, GameState, Language } from '@monopoly/shared';
import { localizeGroupName, localizeTileInstruction, localizeTileName, tr } from '../i18n';

export default function AssetsPanel({ game, language, meId, act }: {
  game: GameState;
  language: Language;
  meId: string;
  act: (a: Action) => void;
}) {
  const mine = playerProperties(game, meId).sort((a, b) => a - b);
  const isMyTurn = game.currentPlayer === meId
    && (game.phase === 'awaiting-roll' || game.phase === 'manage');
  const isDebtor = game.phase === 'awaiting-debt' && game.debts[0]?.debtor === meId;
  const canAct = isMyTurn || isDebtor;

  if (mine.length === 0) {
    return <div className="panel-note">{tr(language, '你还没有任何地产, 落到无主地时买下它!', 'You do not own property yet. Buy one when you land on an unowned space.', 'Vous ne possédez pas encore de propriété. Achetez-en une en arrivant sur une case libre.')}</div>;
  }

  return (
    <div className="assets-panel">
      {!canAct && <p className="home-hint">{tr(language, '现在只能查看, 轮到你时才能操作', 'View only for now; actions unlock on your turn.', 'Consultation seulement; les actions seront disponibles à votre tour.')}</p>}
      {mine.map((id) => {
        const tile = getTile(id);
        if (!isOwnable(tile)) return null;
        const own = game.ownership[id]!;
        const color = tile.type === 'property' ? GROUP_COLORS[tile.group]
          : tile.type === 'railroad' ? '#444' : '#7f8c8d';
        const buildErr = canBuild(game, meId, id);
        const sellErr = canSellHouse(game, meId, id);
        const mortErr = canMortgage(game, meId, id);
        const unmortErr = canUnmortgage(game, meId, id);
        return (
          <div className="asset-card" key={id} style={{ borderColor: color }}>
            <div className="asset-card-band" style={{ background: color }}>
              <span>{assetTypeLabel(tile.type, language)}</span>
              {tile.type === 'property' && <span>{localizeGroupName(tile.group, language)}</span>}
            </div>
            <div className="asset-card-head">
              <div>
                <div className="asset-card-title">{localizeTileName(tile, language)}</div>
                <div className="asset-card-subtitle">{tile.nameEn}</div>
              </div>
              <div className="asset-card-price">${tile.price}</div>
            </div>

            <p className="asset-card-instruction">{localizeTileInstruction(tile, language)}</p>

            <div className="asset-card-status">
              {tile.type === 'property' && own.houses > 0 && (
                <span className="tag">
                  {own.houses === 5
                    ? tr(language, '酒店', 'Hotel', 'Hôtel')
                    : tr(language, `${own.houses} 栋房`, `${own.houses} house${own.houses > 1 ? 's' : ''}`, `${own.houses} maison${own.houses > 1 ? 's' : ''}`)}
                </span>
              )}
              {own.mortgaged && <span className="tag tag-warn">{tr(language, '已抵押', 'Mortgaged', 'Hypothéqué')}</span>}
              <span className="tag">{tr(language, '抵押值', 'Mortgage value', 'Valeur hypothèque')} ${mortgageValue(tile)}</span>
            </div>

            <div className="title-deed">
              {rentRows(tile, language).map(([label, value]) => (
                <div className="title-deed-row" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>

            {tile.type === 'property' && (
              <div className="asset-card-costs">
                <span>{tr(language, '建房', 'Build', 'Construire')} ${tile.houseCost}</span>
                <span>{tr(language, '赎回', 'Unmortgage', 'Lever')} ${unmortgageCost(tile)}</span>
              </div>
            )}

            {canAct && (
              <div className="asset-btns">
                {tile.type === 'property' && !isDebtor && (
                  <button
                    className={`btn btn-sm ${buildErr ? 'btn-dim' : ''}`}
                    aria-disabled={!!buildErr}
                    title={buildErr ?? tr(language, '盖房', 'Build', 'Construire')}
                    onClick={() => act({ type: 'build', tileId: id })}
                  >
                    {tr(language, '盖房', 'Build', 'Construire')} ${tile.houseCost}
                  </button>
                )}
                {tile.type === 'property' && own.houses > 0 && (
                  <button
                    className={`btn btn-sm ${sellErr ? 'btn-dim' : ''}`}
                    aria-disabled={!!sellErr}
                    title={sellErr ?? tr(language, '卖房', 'Sell house', 'Vendre maison')}
                    onClick={() => act({ type: 'sell-house', tileId: id })}
                  >
                    {tr(language, '卖房', 'Sell house', 'Vendre maison')} +${Math.floor(tile.houseCost / 2)}
                  </button>
                )}
                {!own.mortgaged ? (
                  <button
                    className={`btn btn-sm ${mortErr ? 'btn-dim' : ''}`}
                    aria-disabled={!!mortErr}
                    title={mortErr ?? tr(language, '抵押', 'Mortgage', 'Hypothéquer')}
                    onClick={() => act({ type: 'mortgage', tileId: id })}
                  >
                    {tr(language, '抵押', 'Mortgage', 'Hypothéquer')} +${mortgageValue(tile)}
                  </button>
                ) : !isDebtor && (
                  <button
                    className={`btn btn-sm ${unmortErr ? 'btn-dim' : ''}`}
                    aria-disabled={!!unmortErr}
                    title={unmortErr ?? tr(language, '赎回', 'Unmortgage', 'Lever')}
                    onClick={() => act({ type: 'unmortgage', tileId: id })}
                  >
                    {tr(language, '赎回', 'Unmortgage', 'Lever')} -${unmortgageCost(tile)}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function assetTypeLabel(type: 'property' | 'railroad' | 'utility', language: Language): string {
  if (type === 'railroad') return tr(language, '铁路产权', 'Railroad Deed', 'Titre ferroviaire');
  if (type === 'utility') return tr(language, '公用事业', 'Utility', 'Service public');
  return tr(language, '房地产卡', 'Property Deed', 'Titre de propriété');
}

function rentRows(tile: ReturnType<typeof getTile>, language: Language): [string, string][] {
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
