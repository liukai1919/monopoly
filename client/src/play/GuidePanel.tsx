import {
  GROUP_COLORS, getTile, isOwnable, netWorth, ownsFullGroup, playerProperties,
  railroadsOwned, utilitiesOwned,
} from '@monopoly/shared';
import type { GameState, Language } from '@monopoly/shared';
import { isBoomTile } from '../board/deedInfo';
import { localizeGroupName, localizeIndustryName, localizeTileInstruction, localizeTileName, tr } from '../i18n';

export default function GuidePanel({ game, language, meId }: { game: GameState; language: Language; meId: string }) {
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
        <div className="guide-kicker">{tr(language, '当前讲解', 'Current Guide', 'Guide actuel')}</div>
        <h2>{phaseTitle(game, language, meId)}</h2>
        <p>{phaseExplanation(game, language, meId)}</p>
      </section>

      <section className="guide-card">
        <div className="guide-kicker">{tr(language, '你所在的格子', 'Your Space', 'Votre case')}</div>
        <div className="guide-tile-head">
          <div>
            <h3>{localizeTileName(tile, language)}</h3>
            <p>{tile.nameEn}</p>
          </div>
          {tile.type === 'property' && (
            <span className="guide-color-chip" style={{ background: GROUP_COLORS[tile.group] }}>
              {localizeGroupName(tile.group, language)}
            </span>
          )}
        </div>
        <p>{localizeTileInstruction(tile, language)}</p>
        {isOwnable(tile) && (
          <div className="guide-facts">
            <div><span>{tr(language, '价格', 'Price', 'Prix')}</span><b>${tile.price}</b></div>
            <div>
              <span>{tr(language, '状态', 'Status', 'État')}</span>
              <b>{owner ? tr(language, `${owner.name} 持有`, `Owned by ${owner.name}`, `Possédé par ${owner.name}`) : tr(language, '可购买', 'Available', 'Disponible')}</b>
            </div>
            {tile.type === 'property' && <div><span>{tr(language, '空地租金', 'Base rent', 'Loyer de base')}</span><b>${tile.rent[0]}</b></div>}
            {tile.type === 'property' && <div><span>{tr(language, '酒店租金', 'Hotel rent', 'Loyer hôtel')}</span><b>${tile.rent[5]}</b></div>}
            {tile.type === 'railroad' && <div><span>{tr(language, '铁路租金', 'Railroad rent', 'Loyer ferroviaire')}</span><b>$25-$200</b></div>}
            {tile.type === 'utility' && <div><span>{tr(language, '公用事业租金', 'Utility rent', 'Loyer service')}</span><b>{tr(language, '骰点×4/10', 'dice ×4/10', 'dés ×4/10')}</b></div>}
            {isBoomTile(game, tile.id) && (
              <div><span>{tr(language, '行业景气', 'Industry boom', 'Essor sectoriel')}</span><b>🔥 {tr(language, '租金 +50%', 'Rent +50%', 'Loyer +50%')}</b></div>
            )}
          </div>
        )}
      </section>

      <section className="guide-card">
        <div className="guide-kicker">{tr(language, '你的局势', 'Your Position', 'Votre situation')}</div>
        <div className="guide-facts">
          <div><span>{tr(language, '现金', 'Cash', 'Argent')}</span><b>${me.cash}</b></div>
          <div><span>{tr(language, '净资产', 'Net Worth', 'Valeur nette')}</span><b>${netWorth(game, meId)}</b></div>
          <div><span>{tr(language, '地产', 'Properties', 'Propriétés')}</span><b>{tr(language, `${mine.length} 张`, `${mine.length}`, `${mine.length}`)}</b></div>
          <div><span>{tr(language, '出狱卡', 'Jail Cards', 'Cartes prison')}</span><b>{tr(language, `${me.jailCards.length} 张`, `${me.jailCards.length}`, `${me.jailCards.length}`)}</b></div>
          <div><span>{tr(language, '铁路', 'Railroads', 'Chemins de fer')}</span><b>{railroadsOwned(game, meId)}</b></div>
          <div><span>{tr(language, '公用事业', 'Utilities', 'Services publics')}</span><b>{utilitiesOwned(game, meId)}</b></div>
          {game.settings.industryBoom && game.boomIndustry && (
            <div>
              <span>{tr(language, '本轮景气', 'Boom this round', 'Essor du tour')}</span>
              <b>🔥 {localizeIndustryName(game.boomIndustry, language)}</b>
            </div>
          )}
        </div>
        {fullGroups.length > 0 ? (
          <div className="guide-groups">
            {fullGroups.map((group) => (
              <span key={group} style={{ background: GROUP_COLORS[group] }}>
                {tr(language, `${localizeGroupName(group, language)}垄断`, `${localizeGroupName(group, language)} monopoly`, `Monopole ${localizeGroupName(group, language)}`)}
              </span>
            ))}
          </div>
        ) : (
          <p className="home-hint">
            {tr(language, '还没有集齐同色地块。交易页可以帮你补齐关键颜色组。', 'You do not have a complete color set yet. Trade can help fill key gaps.', 'Vous n’avez pas encore de groupe complet. Les échanges peuvent combler les couleurs clés.')}
          </p>
        )}
      </section>

      <section className="guide-card">
        <div className="guide-kicker">{tr(language, '常用规则', 'Common Rules', 'Règles utiles')}</div>
        <div className="guide-rules">
          <p>{tr(language, '集齐同色地块、且棋子停在该色组上时，才能均衡地盖房；离开色组或同组有抵押时不能盖。', 'Build evenly only after completing a color set and stopping on it; you cannot build after leaving or while the set has a mortgage.', 'Construisez équitablement seulement avec un groupe complet et votre pion dessus; impossible si vous partez ou si le groupe est hypothéqué.')}</p>
          <p>{tr(language, '落到无主地可以购买；放弃后会进入全员拍卖，别人也能低价抢走。', 'You may buy unowned property; if you decline, everyone can bid in an auction.', 'Vous pouvez acheter une propriété libre; si vous refusez, tout le monde peut enchérir.')}</p>
          <p>{tr(language, '现金不足时先去资产页抵押或卖房；资产不足才可以宣告破产。', 'If short on cash, mortgage or sell houses in Assets; bankruptcy is allowed only when assets cannot cover the debt.', 'En manque d’argent, hypothéquez ou vendez des maisons dans Actifs; la faillite n’est possible que si les actifs ne suffisent pas.')}</p>
          <p>{tr(language, '连续掷出三次双数会直接入狱，出狱那次双数不会再奖励续掷。', 'Three doubles in a row sends you to jail; doubles used to leave jail do not grant another roll.', 'Trois doubles d’affilée vous envoient en prison; un double pour sortir ne donne pas de lancer bonus.')}</p>
        </div>
      </section>
    </div>
  );
}

function phaseTitle(game: GameState, language: Language, meId: string): string {
  const isMe = game.currentPlayer === meId;
  switch (game.phase) {
    case 'awaiting-roll': return isMe ? tr(language, '轮到你掷骰', 'Your roll', 'À vous de lancer') : tr(language, '等待别人掷骰', 'Waiting for a roll', 'En attente d’un lancer');
    case 'awaiting-card': return game.pendingCard?.playerId === meId ? tr(language, '轮到你抽牌', 'Draw a card', 'Piochez une carte') : tr(language, '等待抽牌', 'Waiting for card draw', 'En attente de pioche');
    case 'awaiting-buy': return isMe ? tr(language, '购买决定', 'Buy decision', 'Décision d’achat') : tr(language, '等待购买决定', 'Waiting for buy decision', 'En attente d’achat');
    case 'auction': return game.auction?.turn === meId ? tr(language, '轮到你竞拍', 'Your bid', 'À vous d’enchérir') : tr(language, '拍卖进行中', 'Auction in progress', 'Enchère en cours');
    case 'awaiting-debt': return game.debts[0]?.debtor === meId ? tr(language, '你需要筹钱', 'Raise cash', 'Réunir l’argent') : tr(language, '有人正在筹钱', 'Debt resolution', 'Dette en cours');
    case 'manage': return isMe ? tr(language, '管理资产并结束回合', 'Manage assets and end turn', 'Gérer les actifs et finir') : tr(language, '等待回合结束', 'Waiting for turn end', 'En attente de fin de tour');
    case 'game-over': return tr(language, '游戏结束', 'Game over', 'Partie terminée');
  }
}

function phaseExplanation(game: GameState, language: Language, meId: string): string {
  const current = game.players.find((p) => p.id === game.currentPlayer);
  switch (game.phase) {
    case 'awaiting-roll':
      return game.currentPlayer === meId
        ? tr(language, '掷骰前可以赎回或交易，停在自己色组上时还能先盖房，然后掷骰移动。', 'Before rolling, you can unmortgage, trade, or build if you are on your own color set.', 'Avant de lancer, vous pouvez lever une hypothèque, échanger ou construire si vous êtes sur votre groupe.')
        : tr(language, `现在是 ${current?.name ?? '其他玩家'} 的行动时间。`, `It is ${current?.name ?? 'another player'}'s turn.`, `C’est le tour de ${current?.name ?? 'un autre joueur'}.`);
    case 'awaiting-card': {
      const pending = game.pendingCard;
      const player = game.players.find((p) => p.id === pending?.playerId);
      const deckName = pending ? tr(language, pending.deck === 'chance' ? '机会' : '宝箱', pending.deck === 'chance' ? 'Chance' : 'Community Chest', pending.deck === 'chance' ? 'Chance' : 'Caisse commune') : '';
      return pending?.playerId === meId
        ? tr(language, `点行动页的按钮亲手抽一张${deckName}卡，效果会立即结算。`, `Use Action to draw a ${deckName} card; its effect resolves immediately.`, `Utilisez Action pour piocher une carte ${deckName}; son effet se résout aussitôt.`)
        : tr(language, `${player?.name ?? '玩家'} 正在抽${deckName}卡。`, `${player?.name ?? 'A player'} is drawing a ${deckName} card.`, `${player?.name ?? 'Un joueur'} pioche une carte ${deckName}.`);
    }
    case 'awaiting-buy': {
      const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
      const tileLabel = tile ? localizeTileName(tile, language) : tr(language, '这块地', 'this property', 'cette propriété');
      return game.currentPlayer === meId
        ? tr(language, `${tileLabel}可以买下，现金不够或不想买时会送去拍卖。`, `${tileLabel} is available. If you cannot or do not want to buy, it goes to auction.`, `${tileLabel} est disponible. Si vous ne voulez pas ou ne pouvez pas acheter, elle part aux enchères.`)
        : tr(language, `${current?.name ?? '玩家'} 正在考虑是否购买 ${tileLabel}。`, `${current?.name ?? 'A player'} is deciding whether to buy ${tileLabel}.`, `${current?.name ?? 'Un joueur'} décide s’il achète ${tileLabel}.`);
    }
    case 'auction': {
      const tile = game.auction ? getTile(game.auction.tileId) : null;
      const tileLabel = tile ? localizeTileName(tile, language) : tr(language, '地块', 'property', 'propriété');
      return tr(language, `拍卖 ${tileLabel}，出价必须高于当前最高价；退出后不能再回来。`, `Auction for ${tileLabel}: bids must beat the high bid; passing is final.`, `Enchère pour ${tileLabel}: l’offre doit dépasser la meilleure; passer est définitif.`);
    }
    case 'awaiting-debt':
      return game.debts[0]?.debtor === meId
        ? tr(language, '去资产页抵押、卖房筹钱；现金足够后会自动付清债务。', 'Use Assets to mortgage or sell houses; the debt pays automatically once you have enough cash.', 'Utilisez Actifs pour hypothéquer ou vendre; la dette sera payée dès que l’argent suffit.')
        : tr(language, '债务玩家需要先处理现金缺口，游戏会在结清后继续。', 'The debtor must cover the cash gap before play continues.', 'Le débiteur doit combler le manque d’argent avant de continuer.');
    case 'manage':
      return game.currentPlayer === meId
        ? tr(language, '这是整理阶段，可以抵押、发起交易，停在自己色组上时还能盖房，然后结束回合。', 'This is management: mortgage, trade, build on your own color set, then end the turn.', 'Phase de gestion: hypothéquez, échangez, construisez sur votre groupe, puis terminez.')
        : tr(language, `${current?.name ?? '玩家'} 正在整理资产。`, `${current?.name ?? 'A player'} is managing assets.`, `${current?.name ?? 'Un joueur'} gère ses actifs.`);
    case 'game-over':
      return tr(language, '胜负已经结算，可以在大屏上开始下一局。', 'The result is settled; start the next game on the big screen.', 'Le résultat est réglé; lancez la prochaine partie sur le grand écran.');
  }
}
