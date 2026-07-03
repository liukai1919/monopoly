import {
  GROUP_COLORS, canBuild, canMortgage, canSellHouse, canUnmortgage, getTile, isOwnable,
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
          <div className="asset-row" key={id}>
            <div className="asset-info">
              <span className="asset-dot" style={{ background: color }} />
              <span className="asset-name">
                {tile.name}
                {own.houses > 0 && (
                  <span className="asset-houses">
                    {own.houses === 5 ? ' 🏨' : ` ${'🏠'.repeat(own.houses)}`}
                  </span>
                )}
                {own.mortgaged && <span className="tag tag-warn">已抵押</span>}
              </span>
            </div>
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
