import {
  GROUP_COLORS, canBuild, canMortgage, canSellHouse, canUnmortgage, getTile, isOwnable,
  mortgageValue, playerProperties, unmortgageCost,
} from '@monopoly/shared';
import type { Action, GameState, Language } from '@monopoly/shared';
import { currentRentTierIndex, isBoomTile, rentRows } from '../board/deedInfo';
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
              {isBoomTile(game, id) && (
                <span className="tag tag-boom">🔥 {tr(language, '景气 +50%', 'Boom +50%', 'Essor +50%')}</span>
              )}
              <span className="tag">{tr(language, '抵押值', 'Mortgage value', 'Valeur hypothèque')} ${mortgageValue(tile)}</span>
            </div>

            <div className="title-deed">
              {rentRows(tile, language).map(([label, value], i) => (
                <div
                  className={`title-deed-row ${i === currentRentTierIndex(game, id) ? 'title-deed-row-current' : ''}`}
                  key={label}
                >
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

