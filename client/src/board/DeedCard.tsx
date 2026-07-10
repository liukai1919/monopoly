import { GROUP_COLORS, computeRent, getTile, isOwnable } from '@monopoly/shared';
import type { GameState, Language } from '@monopoly/shared';
import { localizeGroupName, localizeIndustryName, localizeTileName, tr } from '../i18n';
import { currentRentTierIndex, isBoomTile, rentRows } from './deedInfo';

/** 落格时棋盘中央自动亮出的地契详情卡 */
export default function DeedCard({ game, language, tileId }: {
  game: GameState;
  language: Language;
  tileId: number;
}) {
  const tile = getTile(tileId);
  if (!isOwnable(tile)) return null;

  const own = game.ownership[tileId];
  const owner = own?.owner ? game.players.find((p) => p.id === own.owner) : null;
  const boom = isBoomTile(game, tileId);
  const tier = currentRentTierIndex(game, tileId);
  const bandColor = tile.type === 'property' ? GROUP_COLORS[tile.group]
    : tile.type === 'railroad' ? '#3d4a55' : '#5f7a8a';
  const typeLabel = tile.type === 'railroad'
    ? tr(language, '铁路产权', 'Railroad Deed', 'Titre ferroviaire')
    : tile.type === 'utility'
      ? tr(language, '公用事业', 'Utility', 'Service public')
      : tr(language, '房地产卡', 'Property Deed', 'Titre de propriété');

  const liveRent = owner && !own?.mortgaged && tile.type !== 'utility'
    ? computeRent(game, tileId, 0)
    : null;

  return (
    <div className="deed-card">
      <div className="deed-band" style={{ background: bandColor }}>
        <span>{typeLabel}</span>
        {tile.type === 'property' && <span>{localizeGroupName(tile.group, language)}</span>}
      </div>
      <div className="deed-title">
        {localizeTileName(tile, language)}
        {language !== 'en' && <span className="deed-title-en">{tile.nameEn}</span>}
      </div>
      <div className="deed-meta">
        {tr(language, '标价', 'Price', 'Prix')} ${tile.price}
        {tile.type === 'property' && <> · {tr(language, '建房', 'House', 'Maison')} ${tile.houseCost}</>}
      </div>
      <div className="deed-owner">
        {owner ? (
          <>
            <span className="deed-owner-chip" style={{ borderColor: owner.color }}>{owner.emoji}</span>
            <b style={{ color: owner.color }}>{owner.name}</b>
            {tile.type === 'property' && own!.houses > 0 && (
              <span>
                {own!.houses === 5
                  ? ` · ${tr(language, '酒店', 'Hotel', 'Hôtel')}`
                  : ` · ${tr(language, `${own!.houses} 栋房`, `${own!.houses} house(s)`, `${own!.houses} maison(s)`)}`}
              </span>
            )}
            {liveRent != null && (
              <span className="deed-live-rent">
                {tr(language, '当前租金', 'Current rent', 'Loyer actuel')} <b>${liveRent}</b>
              </span>
            )}
          </>
        ) : (
          <span>{tr(language, '无主 · 可购买 / 可拍卖', 'Unowned · buy or auction', 'Sans propriétaire · achat ou enchère')}</span>
        )}
      </div>
      <div className="deed-rent-table">
        {rentRows(tile, language).map(([label, value], i) => (
          <div className={`deed-row ${i === tier ? 'deed-row-current' : ''}`} key={label}>
            <span>{label}</span>
            <b>
              {value}
              {i === tier && <em className="deed-row-mark">◀ {tr(language, '当前', 'now', 'actuel')}</em>}
            </b>
          </div>
        ))}
      </div>
      <div className="deed-tags">
        {tile.industries.map((industry) => (
          <span className="deed-tag" key={industry}>{localizeIndustryName(industry, language)}</span>
        ))}
        {boom && <span className="deed-tag deed-tag-boom">🔥 {tr(language, '景气 +50%', 'Boom +50%', 'Essor +50%')}</span>}
        {own?.mortgaged && <span className="deed-tag deed-tag-warn">{tr(language, '已抵押', 'Mortgaged', 'Hypothéqué')}</span>}
      </div>
    </div>
  );
}
