import {
  GROUP_COLORS, GROUP_NAMES, canBuild, canMortgage, canSellHouse, canUnmortgage, getTile, isOwnable,
  mortgageValue, playerProperties, unmortgageCost,
} from '@monopoly/shared';
import type { Action, GameState } from '@monopoly/shared';

export default function AssetsPanel({ game, meId, act }: {
  game: GameState;
  meId: string;
  act: (a: Action) => void;
}) {
  const mine = playerProperties(game, meId).sort((a, b) => a - b);
  const isMyTurn = game.currentPlayer === meId
    && (game.phase === 'awaiting-roll' || game.phase === 'manage');
  const isDebtor = game.phase === 'awaiting-debt' && game.debts[0]?.debtor === meId;
  const canAct = isMyTurn || isDebtor;

  if (mine.length === 0) {
    return <div className="panel-note">你还没有任何地产, 落到无主地时买下它!</div>;
  }

  return (
    <div className="assets-panel">
      {!canAct && <p className="home-hint">现在只能查看, 轮到你时才能操作</p>}
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
              <span>{assetTypeLabel(tile.type)}</span>
              {tile.type === 'property' && <span>{GROUP_NAMES[tile.group]}</span>}
            </div>
            <div className="asset-card-head">
              <div>
                <div className="asset-card-title">{tile.name}</div>
                <div className="asset-card-subtitle">{tile.nameEn}</div>
              </div>
              <div className="asset-card-price">${tile.price}</div>
            </div>

            <p className="asset-card-instruction">{tile.instruction}</p>

            <div className="asset-card-status">
              {tile.type === 'property' && own.houses > 0 && (
                <span className="tag">
                  {own.houses === 5 ? '酒店' : `${own.houses} 栋房`}
                </span>
              )}
              {own.mortgaged && <span className="tag tag-warn">已抵押</span>}
              <span className="tag">抵押值 ${mortgageValue(tile)}</span>
            </div>

            <div className="title-deed">
              {rentRows(tile).map(([label, value]) => (
                <div className="title-deed-row" key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>

            {tile.type === 'property' && (
              <div className="asset-card-costs">
                <span>建房 ${tile.houseCost}</span>
                <span>赎回 ${unmortgageCost(tile)}</span>
              </div>
            )}

            {canAct && (
              <div className="asset-btns">
                {tile.type === 'property' && !isDebtor && (
                  <button
                    className={`btn btn-sm ${buildErr ? 'btn-dim' : ''}`}
                    onClick={() => act({ type: 'build', tileId: id })}
                  >
                    盖房 ${tile.houseCost}
                  </button>
                )}
                {tile.type === 'property' && own.houses > 0 && (
                  <button
                    className={`btn btn-sm ${sellErr ? 'btn-dim' : ''}`}
                    onClick={() => act({ type: 'sell-house', tileId: id })}
                  >
                    卖房 +${Math.floor(tile.houseCost / 2)}
                  </button>
                )}
                {!own.mortgaged ? (
                  <button
                    className={`btn btn-sm ${mortErr ? 'btn-dim' : ''}`}
                    onClick={() => act({ type: 'mortgage', tileId: id })}
                  >
                    抵押 +${mortgageValue(tile)}
                  </button>
                ) : !isDebtor && (
                  <button
                    className={`btn btn-sm ${unmortErr ? 'btn-dim' : ''}`}
                    onClick={() => act({ type: 'unmortgage', tileId: id })}
                  >
                    赎回 -${unmortgageCost(tile)}
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

function assetTypeLabel(type: 'property' | 'railroad' | 'utility'): string {
  if (type === 'railroad') return '铁路产权';
  if (type === 'utility') return '公用事业';
  return '房地产卡';
}

function rentRows(tile: ReturnType<typeof getTile>): [string, string][] {
  if (tile.type === 'property') {
    return [
      ['空地租金', `$${tile.rent[0]}`],
      ['1 栋房', `$${tile.rent[1]}`],
      ['2 栋房', `$${tile.rent[2]}`],
      ['3 栋房', `$${tile.rent[3]}`],
      ['4 栋房', `$${tile.rent[4]}`],
      ['酒店', `$${tile.rent[5]}`],
    ];
  }
  if (tile.type === 'railroad') {
    return [
      ['拥有 1 条铁路', '$25'],
      ['拥有 2 条铁路', '$50'],
      ['拥有 3 条铁路', '$100'],
      ['拥有 4 条铁路', '$200'],
    ];
  }
  if (tile.type === 'utility') {
    return [
      ['拥有 1 家', '骰点 ×4'],
      ['拥有 2 家', '骰点 ×10'],
      ['机会卡指定', '骰点 ×10'],
    ];
  }
  return [];
}
