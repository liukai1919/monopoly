import {
  GROUP_COLORS, GROUP_NAMES, getTile, isOwnable, netWorth, ownsFullGroup, playerProperties,
  railroadsOwned, utilitiesOwned,
} from '@monopoly/shared';
import type { GameState } from '@monopoly/shared';

export default function GuidePanel({ game, meId }: { game: GameState; meId: string }) {
  const me = game.players.find((p) => p.id === meId)!;
  const tile = getTile(me.position);
  const owner = isOwnable(tile) && game.ownership[tile.id]?.owner
    ? game.players.find((p) => p.id === game.ownership[tile.id]?.owner)
    : null;
  const mine = playerProperties(game, meId);
  const fullGroups = [...new Set(mine.map((id) => getTile(id)).filter((t) => t.type === 'property').map((t) => t.group))]
    .filter((group) => ownsFullGroup(game, meId, group));

  return (
    <div className="guide-panel">
      <section className="guide-card guide-card-primary">
        <div className="guide-kicker">当前讲解</div>
        <h2>{phaseTitle(game, meId)}</h2>
        <p>{phaseExplanation(game, meId)}</p>
      </section>

      <section className="guide-card">
        <div className="guide-kicker">你所在的格子</div>
        <div className="guide-tile-head">
          <div>
            <h3>{tile.name}</h3>
            <p>{tile.nameEn}</p>
          </div>
          {tile.type === 'property' && (
            <span className="guide-color-chip" style={{ background: GROUP_COLORS[tile.group] }}>
              {GROUP_NAMES[tile.group]}
            </span>
          )}
        </div>
        <p>{tile.instruction}</p>
        {isOwnable(tile) && (
          <div className="guide-facts">
            <div><span>价格</span><b>${tile.price}</b></div>
            <div><span>状态</span><b>{owner ? `${owner.name} 持有` : '可购买'}</b></div>
            {tile.type === 'property' && <div><span>空地租金</span><b>${tile.rent[0]}</b></div>}
            {tile.type === 'property' && <div><span>酒店租金</span><b>${tile.rent[5]}</b></div>}
            {tile.type === 'railroad' && <div><span>铁路租金</span><b>$25-$200</b></div>}
            {tile.type === 'utility' && <div><span>公用事业租金</span><b>骰点×4/10</b></div>}
          </div>
        )}
      </section>

      <section className="guide-card">
        <div className="guide-kicker">你的局势</div>
        <div className="guide-facts">
          <div><span>现金</span><b>${me.cash}</b></div>
          <div><span>净资产</span><b>${netWorth(game, meId)}</b></div>
          <div><span>地产</span><b>{mine.length} 张</b></div>
          <div><span>出狱卡</span><b>{me.jailCards.length} 张</b></div>
          <div><span>铁路</span><b>{railroadsOwned(game, meId)} 条</b></div>
          <div><span>公用事业</span><b>{utilitiesOwned(game, meId)} 家</b></div>
        </div>
        {fullGroups.length > 0 ? (
          <div className="guide-groups">
            {fullGroups.map((group) => (
              <span key={group} style={{ background: GROUP_COLORS[group] }}>{GROUP_NAMES[group]}垄断</span>
            ))}
          </div>
        ) : (
          <p className="home-hint">还没有集齐同色地块。交易页可以帮你补齐关键颜色组。</p>
        )}
      </section>

      <section className="guide-card">
        <div className="guide-kicker">常用规则</div>
        <div className="guide-rules">
          <p>集齐同色地块后，才能均衡地盖房；同组任一地块抵押时不能盖房。</p>
          <p>落到无主地可以购买；放弃后会进入全员拍卖，别人也能低价抢走。</p>
          <p>现金不足时先去资产页抵押或卖房；资产不足才可以宣告破产。</p>
          <p>连续掷出三次双数会直接入狱，出狱那次双数不会再奖励续掷。</p>
        </div>
      </section>
    </div>
  );
}

function phaseTitle(game: GameState, meId: string): string {
  const isMe = game.currentPlayer === meId;
  switch (game.phase) {
    case 'awaiting-roll': return isMe ? '轮到你掷骰' : '等待别人掷骰';
    case 'awaiting-card': return game.pendingCard?.playerId === meId ? '轮到你抽牌' : '等待抽牌';
    case 'awaiting-buy': return isMe ? '购买决定' : '等待购买决定';
    case 'auction': return game.auction?.turn === meId ? '轮到你竞拍' : '拍卖进行中';
    case 'awaiting-debt': return game.debts[0]?.debtor === meId ? '你需要筹钱' : '有人正在筹钱';
    case 'manage': return isMe ? '管理资产并结束回合' : '等待回合结束';
    case 'game-over': return '游戏结束';
  }
}

function phaseExplanation(game: GameState, meId: string): string {
  const current = game.players.find((p) => p.id === game.currentPlayer);
  switch (game.phase) {
    case 'awaiting-roll':
      return game.currentPlayer === meId
        ? '先确认是否要盖房、赎回或交易，然后掷骰移动。'
        : `现在是 ${current?.name ?? '其他玩家'} 的行动时间。`;
    case 'awaiting-card': {
      const pending = game.pendingCard;
      const player = game.players.find((p) => p.id === pending?.playerId);
      const deckName = pending?.deck === 'chance' ? '机会' : '宝箱';
      return pending?.playerId === meId
        ? `点行动页的按钮亲手抽一张${deckName}卡，效果会立即结算。`
        : `${player?.name ?? '玩家'} 正在抽${deckName}卡。`;
    }
    case 'awaiting-buy': {
      const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
      return game.currentPlayer === meId
        ? `${tile?.name ?? '这块地'}可以买下，现金不够或不想买时会送去拍卖。`
        : `${current?.name ?? '玩家'} 正在考虑是否购买 ${tile?.name ?? '地块'}。`;
    }
    case 'auction': {
      const tile = game.auction ? getTile(game.auction.tileId) : null;
      return `拍卖 ${tile?.name ?? '地块'}，出价必须高于当前最高价；退出后不能再回来。`;
    }
    case 'awaiting-debt':
      return game.debts[0]?.debtor === meId
        ? '去资产页抵押、卖房筹钱；现金足够后会自动付清债务。'
        : '债务玩家需要先处理现金缺口，游戏会在结清后继续。';
    case 'manage':
      return game.currentPlayer === meId
        ? '这是整理阶段，可以盖房、抵押、发起交易，然后结束回合。'
        : `${current?.name ?? '玩家'} 正在整理资产。`;
    case 'game-over':
      return '胜负已经结算，可以在大屏上开始下一局。';
  }
}
