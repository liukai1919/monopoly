import {
  BOARD, GO_SALARY, GROUP_NAMES, JAIL_FINE, JAIL_POS, START_CASH, TOTAL_HOTELS, TOTAL_HOUSES,
  groupTiles, isOwnable,
} from '../board';
import { CHANCE_CARDS, CHEST_CARDS, getCard } from '../cards';
import { DEFAULT_LANGUAGE, localizeCardText, localizeDeckName, pickLanguage } from '../i18n';
import { createEmptyPortfolio, createMarket, industriesForEtf, recordMarketEvent } from '../market';
import { quoteEtfBuyCostCents, quoteEtfSale } from '../portfolio';
import { settleMarketRound } from '../pricingEngine';
import type {
  Action, ApplyResult, AuctionState, Card, ColorGroup, GameEvent, GameSettings, GameState,
  EtfId, IndustryTag, PlayerState, RNG, TradeSide,
} from '../types';
import {
  alivePlayers, canBuild, canMortgage, canSellHouse, canUnmortgage, computeRent,
  getPlayer, getTile, liquidationValue, mortgageValue, netWorth, ownsFullGroup,
  playerProperties, unmortgageCost,
} from './helpers';

export const AUCTION_TURN_MS = 25_000;
const JAIL_CARD_IDS = { chance: 8, chest: 104 } as const;

interface Ctx { events: GameEvent[]; rng: RNG; }

// ---------------------------------------------------------------- 建局

export interface SeatInfo {
  id: string; name: string; emoji: string; tokenId?: string; color: string; isAi: boolean;
}

export function createGame(
  seats: SeatInfo[], settings: Partial<GameSettings> = {}, rng: RNG = Math.random,
): GameState {
  if (seats.length < 2 || seats.length > 6) throw new Error('需要 2-6 名玩家');
  const players: PlayerState[] = seats.map((seat) => ({
    ...seat,
    connected: true,
    cash: START_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: [],
    bankrupt: false,
  }));
  const ownership: GameState['ownership'] = {};
  for (const tile of BOARD) {
    if (isOwnable(tile)) ownership[tile.id] = { owner: null, houses: 0, mortgaged: false };
  }
  const state: GameState = {
    phase: 'awaiting-roll',
    players,
    currentPlayer: players[0]!.id,
    ownership,
    housesRemaining: TOTAL_HOUSES,
    hotelsRemaining: TOTAL_HOTELS,
    dice: null,
    doublesCount: 0,
    suppressDoubles: false,
    pendingBuyTile: null,
    pendingCard: null,
    auction: null,
    debts: [],
    trade: null,
    chanceDeck: shuffle(CHANCE_CARDS.map((c) => c.id), rng),
    chestDeck: shuffle(CHEST_CARDS.map((c) => c.id), rng),
    pot: 0,
    market: createMarket(),
    portfolios: Object.fromEntries(players.map((p) => [p.id, createEmptyPortfolio()])),
    turnCount: 0,
    winner: null,
    settings: {
      freeParkingPot: false,
      maxTurns: null,
      diceStyle: 'classic',
      soundEnabled: true,
      language: DEFAULT_LANGUAGE,
      ...settings,
    },
    log: [],
  };
  log(state, pickLanguage(
    state.settings.language,
    `游戏开始! 每人 $${START_CASH}, ${players[0]!.name} 先行`,
    `Game started! Each player has $${START_CASH}; ${players[0]!.name} goes first`,
    `La partie commence! Chaque joueur a ${START_CASH} $; ${players[0]!.name} joue en premier`,
  ));
  return state;
}

function shuffle(arr: number[], rng: RNG): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------------------------------------------------------------- 入口

export function applyAction(
  state: GameState, playerId: string, action: Action, rng: RNG = Math.random,
): ApplyResult {
  const s = structuredClone(state);
  const ctx: Ctx = { events: [], rng };
  const player = s.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: '未知玩家' };
  if (player.bankrupt) return { ok: false, error: '你已破产出局' };
  if (s.phase === 'game-over') return { ok: false, error: '游戏已结束' };

  const error = dispatch(s, ctx, player, action);
  if (error) return { ok: false, error };
  return { ok: true, state: s, events: ctx.events };
}

export function settleGame(state: GameState): ApplyResult {
  const s = structuredClone(state);
  const ctx: Ctx = { events: [], rng: Math.random };
  const error = manualSettlementError(s);
  if (error) return { ok: false, error };
  finishByNetWorth(s, ctx, '主持人发起结算! 按净资产结算');
  return { ok: true, state: s, events: ctx.events };
}

function dispatch(s: GameState, ctx: Ctx, player: PlayerState, action: Action): string | null {
  const isCurrent = player.id === s.currentPlayer;
  const inTurnPhase = s.phase === 'awaiting-roll' || s.phase === 'manage';
  const isDebtor = s.phase === 'awaiting-debt' && s.debts[0]?.debtor === player.id;
  const owesDebt = s.debts.some((debt) => debt.debtor === player.id);

  switch (action.type) {
    case 'roll': {
      if (s.phase !== 'awaiting-roll' || !isCurrent) return '现在不能掷骰子';
      doRoll(s, ctx, player);
      return null;
    }
    case 'jail-pay': {
      if (s.phase !== 'awaiting-roll' || !isCurrent || !player.inJail) return '现在不能保释';
      if (player.cash < JAIL_FINE) return '现金不足';
      pay(s, ctx, player, JAIL_FINE, null, true, JAIL_POS);
      player.inJail = false;
      player.jailTurns = 0;
      log(s, `${player.name} 交了 $${JAIL_FINE} 保释金出狱`);
      return null;
    }
    case 'jail-card': {
      if (s.phase !== 'awaiting-roll' || !isCurrent || !player.inJail) return '现在不能使用出狱卡';
      const deck = player.jailCards.pop();
      if (!deck) return '你没有出狱卡';
      (deck === 'chance' ? s.chanceDeck : s.chestDeck).push(JAIL_CARD_IDS[deck]);
      player.inJail = false;
      player.jailTurns = 0;
      log(s, `${player.name} 使用出狱卡出狱`);
      return null;
    }
    case 'draw-card': {
      if (s.phase !== 'awaiting-card' || !isCurrent || !s.pendingCard || s.pendingCard.playerId !== player.id) {
        return '现在不能抽牌';
      }
      const pending = s.pendingCard;
      s.pendingCard = null;
      drawCard(s, ctx, player, pending.deck, pending.diceSum);
      settleFlow(s, ctx);
      return null;
    }
    case 'buy': {
      if (s.phase !== 'awaiting-buy' || !isCurrent || s.pendingBuyTile == null) return '现在不能购买';
      const tile = getTile(s.pendingBuyTile);
      if (!isOwnable(tile)) return '该地块不可购买';
      if (player.cash < tile.price) return '现金不足, 只能送去拍卖';
      player.cash -= tile.price;
      s.ownership[tile.id]!.owner = player.id;
      s.pendingBuyTile = null;
      ctx.events.push({ type: 'cash', from: player.id, to: null, amount: tile.price, tileId: tile.id });
      recordMarketEvent(s, {
        kind: 'property-bought',
        polarity: 'bullish',
        playerId: player.id,
        tileId: tile.id,
        amount: tile.price,
      });
      log(s, `${player.name} 以 $${tile.price} 买下了 ${tile.name}`);
      emitMonopolyEvents(s, ctx, player.id, [tile.id]);
      settleFlow(s, ctx);
      return null;
    }
    case 'decline-buy': {
      if (s.phase !== 'awaiting-buy' || !isCurrent || s.pendingBuyTile == null) return '现在没有待购地块';
      const tileId = s.pendingBuyTile;
      s.pendingBuyTile = null;
      log(s, `${player.name} 放弃购买 ${getTile(tileId).name}, 开始拍卖!`);
      startAuction(s, [tileId]);
      settleFlow(s, ctx);
      return null;
    }
    case 'bid': {
      const a = s.auction;
      if (s.phase !== 'auction' || !a || a.turn !== player.id) return '还没轮到你出价';
      if (!Number.isInteger(action.amount) || action.amount <= a.highBid) {
        return `出价必须高于当前价 $${a.highBid}`;
      }
      if (action.amount > player.cash) return '出价超过了你的现金';
      a.highBid = action.amount;
      a.highBidder = player.id;
      log(s, `${player.name} 出价 $${action.amount} 竞拍 ${getTile(a.tileId).name}`);
      advanceAuction(s, ctx);
      return null;
    }
    case 'pass-bid': {
      const a = s.auction;
      if (s.phase !== 'auction' || !a || a.turn !== player.id) return '还没轮到你表态';
      a.folded.push(player.id);
      log(s, `${player.name} 退出竞拍`);
      advanceAuction(s, ctx);
      return null;
    }
    case 'build': {
      if (!(isCurrent && inTurnPhase)) return '只能在自己回合盖房';
      const reason = canBuild(s, player.id, action.tileId);
      if (reason) return reason;
      const tile = getTile(action.tileId);
      if (tile.type !== 'property') return '该地块不能盖房';
      const own = s.ownership[tile.id]!;
      player.cash -= tile.houseCost;
      own.houses += 1;
      if (own.houses === 5) {
        s.hotelsRemaining -= 1;
        s.housesRemaining += 4;
        log(s, `${player.name} 在 ${tile.name} 建起了酒店!`);
      } else {
        s.housesRemaining -= 1;
        log(s, `${player.name} 在 ${tile.name} 盖了第 ${own.houses} 栋房`);
      }
      ctx.events.push({ type: 'cash', from: player.id, to: null, amount: tile.houseCost, tileId: tile.id });
      ctx.events.push({
        type: 'build',
        playerId: player.id,
        tileId: tile.id,
        building: own.houses === 5 ? 'hotel' : 'house',
        level: own.houses,
      });
      recordMarketEvent(s, {
        kind: 'build',
        polarity: 'bullish',
        playerId: player.id,
        tileId: tile.id,
        amount: tile.houseCost,
        industries: marketIndustries(['realEstate', ...tile.industries]),
      });
      return null;
    }
    case 'sell-house': {
      if (!((isCurrent && inTurnPhase) || isDebtor)) return '现在不能卖房';
      const reason = canSellHouse(s, player.id, action.tileId);
      if (reason) return reason;
      const tile = getTile(action.tileId);
      if (tile.type !== 'property') return '该地块没有房子';
      const own = s.ownership[tile.id]!;
      let saleProceeds = 0;
      if (own.houses === 5) {
        if (s.housesRemaining >= 4) {
          own.houses = 4;
          s.hotelsRemaining += 1;
          s.housesRemaining -= 4;
          saleProceeds = Math.floor(tile.houseCost / 2);
          player.cash += saleProceeds;
          log(s, `${player.name} 把 ${tile.name} 的酒店降级为 4 栋房 (+$${saleProceeds})`);
        } else {
          // 银行房子不够, 只能整体清拆
          const gain = Math.floor((5 * tile.houseCost) / 2);
          own.houses = 0;
          s.hotelsRemaining += 1;
          saleProceeds = gain;
          player.cash += gain;
          log(s, `银行房屋短缺, ${player.name} 整体拆除了 ${tile.name} 的酒店 (+$${gain})`);
        }
      } else {
        own.houses -= 1;
        s.housesRemaining += 1;
        saleProceeds = Math.floor(tile.houseCost / 2);
        player.cash += saleProceeds;
        log(s, `${player.name} 卖掉了 ${tile.name} 的一栋房 (+$${saleProceeds})`);
      }
      ctx.events.push({ type: 'cash', from: null, to: player.id, amount: saleProceeds, tileId: tile.id });
      recordMarketEvent(s, {
        kind: 'sell-house',
        polarity: 'bearish',
        playerId: player.id,
        tileId: tile.id,
        amount: saleProceeds,
        industries: marketIndustries(['realEstate', ...tile.industries]),
      });
      if (s.phase === 'awaiting-debt') settleFlow(s, ctx);
      return null;
    }
    case 'mortgage': {
      if (!((isCurrent && inTurnPhase) || isDebtor)) return '现在不能抵押';
      const reason = canMortgage(s, player.id, action.tileId);
      if (reason) return reason;
      const tile = getTile(action.tileId);
      if (!isOwnable(tile)) return '不能抵押';
      s.ownership[tile.id]!.mortgaged = true;
      player.cash += mortgageValue(tile);
      ctx.events.push({ type: 'cash', from: null, to: player.id, amount: mortgageValue(tile), tileId: tile.id });
      recordMarketEvent(s, {
        kind: 'mortgage',
        polarity: 'bearish',
        playerId: player.id,
        tileId: tile.id,
        amount: mortgageValue(tile),
        industries: ['finance'],
      });
      log(s, `${player.name} 抵押了 ${tile.name} (+$${mortgageValue(tile)})`);
      if (s.phase === 'awaiting-debt') settleFlow(s, ctx);
      return null;
    }
    case 'unmortgage': {
      if (!(isCurrent && inTurnPhase)) return '只能在自己回合赎回';
      const reason = canUnmortgage(s, player.id, action.tileId);
      if (reason) return reason;
      const tile = getTile(action.tileId);
      if (!isOwnable(tile)) return '不能赎回';
      player.cash -= unmortgageCost(tile);
      s.ownership[tile.id]!.mortgaged = false;
      ctx.events.push({ type: 'cash', from: player.id, to: null, amount: unmortgageCost(tile), tileId: tile.id });
      recordMarketEvent(s, {
        kind: 'unmortgage',
        polarity: 'bullish',
        playerId: player.id,
        tileId: tile.id,
        amount: unmortgageCost(tile),
        industries: ['finance'],
      });
      log(s, `${player.name} 赎回了 ${tile.name} (-$${unmortgageCost(tile)})`);
      return null;
    }
    case 'buy-etf': {
      if (owesDebt) return '先结清债务, 不能买入 ETF';
      const reason = validateEtfOrder(s, action.etfId, action.shares);
      if (reason) return reason;
      const portfolio = ensurePortfolio(s, player.id);
      const costCash = Math.ceil(quoteEtfBuyCostCents(s, action.etfId, action.shares) / 100);
      if (player.cash < costCash) return '现金不足，无法买入 ETF';
      player.cash -= costCash;
      portfolio[action.etfId] += action.shares;
      ctx.events.push({ type: 'cash', from: player.id, to: null, amount: costCash });
      recordMarketEvent(s, {
        kind: 'etf-bought',
        polarity: 'bullish',
        playerId: player.id,
        amount: costCash,
        magnitude: Math.min(2, Math.max(0.25, action.shares * 0.25)),
        industries: marketIndustries(industriesForEtf(action.etfId)),
      });
      log(s, `${player.name} 买入 ${action.shares} 股 ${action.etfId} ETF (-$${costCash})`);
      return null;
    }
    case 'sell-etf': {
      const reason = validateEtfOrder(s, action.etfId, action.shares);
      if (reason) return reason;
      const portfolio = ensurePortfolio(s, player.id);
      if (portfolio[action.etfId] < action.shares) return 'ETF 持仓不足';
      const forced = isDebtor;
      const quote = quoteEtfSale(s, action.etfId, action.shares, forced);
      portfolio[action.etfId] -= action.shares;
      player.cash += quote.netCash;
      ctx.events.push({ type: 'cash', from: null, to: player.id, amount: quote.netCash });
      recordMarketEvent(s, {
        kind: forced ? 'etf-forced-sold' : 'etf-sold',
        polarity: 'bearish',
        playerId: player.id,
        amount: quote.netCash,
        magnitude: Math.min(forced ? 4 : 2, Math.max(0.25, action.shares * (forced ? 0.35 : 0.2))),
        industries: marketIndustries(industriesForEtf(action.etfId)),
      });
      log(s, `${player.name} ${forced ? '火售' : '卖出'} ${action.shares} 股 ${action.etfId} ETF (+$${quote.netCash})`);
      if (forced) settleFlow(s, ctx);
      return null;
    }
    case 'propose-trade': {
      if (!inTurnPhase) return '拍卖或筹钱时不能交易';
      if (s.trade) return '已有一个交易待处理';
      const other = s.players.find((p) => p.id === action.to);
      if (!other || other.bankrupt || other.id === player.id) return '交易对象无效';
      const bad = validateTradeSide(s, player.id, action.give) ?? validateTradeSide(s, other.id, action.get);
      if (bad) return bad;
      if (isEmptyTrade(action.give, action.get)) return '交易内容为空';
      s.trade = {
        id: Math.floor(ctx.rng() * 1e9).toString(36),
        from: player.id, to: other.id,
        give: action.give, get: action.get,
      };
      log(s, `${player.name} 向 ${other.name} 发起交易: ${describeTrade(s.trade)}`);
      return null;
    }
    case 'respond-trade': {
      const t = s.trade;
      if (!t || t.to !== player.id) return '没有待你回应的交易';
      if (!inTurnPhase) return '现在不能回应交易';
      s.trade = null;
      if (!action.accept) {
        log(s, `${player.name} 拒绝了交易`);
        return null;
      }
      const bad = validateTradeSide(s, t.from, t.give) ?? validateTradeSide(s, t.to, t.get);
      if (bad) {
        log(s, `交易已失效: ${bad}`);
        return null;
      }
      executeTrade(s, ctx, t.from, t.to, t.give);
      executeTrade(s, ctx, t.to, t.from, t.get);
      log(s, `交易达成! ${describeTrade(t)}`);
      return null;
    }
    case 'cancel-trade': {
      if (!s.trade || s.trade.from !== player.id) return '没有你发起的交易';
      s.trade = null;
      log(s, `${player.name} 撤回了交易`);
      return null;
    }
    case 'declare-bankruptcy': {
      if (!isDebtor) return '你现在没有待偿债务';
      const debt = s.debts[0]!;
      if (liquidationValue(s, player.id) >= debt.amount) {
        return '你还有资产可以变卖或抵押, 不能破产';
      }
      executeBankruptcy(s, ctx, player.id);
      settleFlow(s, ctx);
      return null;
    }
    case 'end-turn': {
      if (s.phase !== 'manage' || !isCurrent) return '现在不能结束回合';
      advanceTurn(s, ctx);
      return null;
    }
    default:
      return '未知动作';
  }
}

// ---------------------------------------------------------------- 掷骰与移动

function doRoll(s: GameState, ctx: Ctx, player: PlayerState): void {
  const d1 = rollDie(ctx.rng);
  const d2 = rollDie(ctx.rng);
  s.dice = [d1, d2];
  ctx.events.push({ type: 'dice', playerId: player.id, dice: [d1, d2] });
  log(s, `${player.name} 掷出 ${d1} + ${d2}`);
  const sum = d1 + d2;

  if (player.inJail) {
    if (d1 === d2) {
      player.inJail = false;
      player.jailTurns = 0;
      s.suppressDoubles = true;
      log(s, `${player.name} 掷出双数, 成功出狱!`);
      moveWalk(s, ctx, player, sum);
      resolveLanding(s, ctx, player, sum);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= 3) {
        log(s, `${player.name} 第三次没掷出双数, 必须交 $${JAIL_FINE} 出狱`);
        charge(s, ctx, player, JAIL_FINE, null, `监狱保释金`, true, JAIL_POS);
        player.inJail = false;
        player.jailTurns = 0;
        s.suppressDoubles = true;
        moveWalk(s, ctx, player, sum);
        resolveLanding(s, ctx, player, sum);
      } else {
        log(s, `${player.name} 没掷出双数, 继续蹲监狱 (第 ${player.jailTurns} 次)`);
        s.phase = 'manage';
        return;
      }
    }
    settleFlow(s, ctx);
    return;
  }

  if (d1 === d2) {
    s.doublesCount += 1;
    if (s.doublesCount >= 3) {
      log(s, `${player.name} 连掷三次双数, 涉嫌作弊, 直接入狱!`);
      sendToJail(s, ctx, player);
      settleFlow(s, ctx);
      return;
    }
  } else {
    s.doublesCount = 0;
  }

  moveWalk(s, ctx, player, sum);
  resolveLanding(s, ctx, player, sum);
  settleFlow(s, ctx);
}

function rollDie(rng: RNG): number {
  return 1 + Math.floor(rng() * 6);
}

function moveWalk(s: GameState, ctx: Ctx, player: PlayerState, steps: number): void {
  const from = player.position;
  const path: number[] = [];
  for (let i = 1; i <= steps; i++) path.push((from + i) % 40);
  player.position = path[path.length - 1]!;
  ctx.events.push({ type: 'move', playerId: player.id, path });
  if (player.position < from) {
    player.cash += GO_SALARY;
    ctx.events.push({ type: 'cash', from: null, to: player.id, amount: GO_SALARY, tileId: 0 });
    log(s, `${player.name} 经过起点, 领取 $${GO_SALARY}`);
  }
}

function moveBack(s: GameState, ctx: Ctx, player: PlayerState, steps: number): void {
  const from = player.position;
  const path: number[] = [];
  for (let i = 1; i <= steps; i++) path.push((from - i + 40) % 40);
  player.position = path[path.length - 1]!;
  ctx.events.push({ type: 'move', playerId: player.id, path });
}

function sendToJail(s: GameState, ctx: Ctx, player: PlayerState): void {
  player.position = JAIL_POS;
  player.inJail = true;
  player.jailTurns = 0;
  ctx.events.push({ type: 'move', playerId: player.id, path: [JAIL_POS], teleport: true });
  log(s, `${player.name} 被关进了监狱`);
}

// ---------------------------------------------------------------- 落格结算

function resolveLanding(
  s: GameState, ctx: Ctx, player: PlayerState, diceSum: number,
  opts: { railDouble?: boolean; utilTen?: boolean } = {},
): void {
  const tile = getTile(player.position);

  if (isOwnable(tile)) {
    const own = s.ownership[tile.id]!;
    if (!own.owner) {
      s.pendingBuyTile = tile.id;
      log(s, `${player.name} 来到无主的 ${tile.name} (标价 $${tile.price})`);
    } else if (own.owner !== player.id) {
      const rent = computeRent(s, tile.id, diceSum, opts);
      if (rent > 0) {
        const owner = getPlayer(s, own.owner);
        recordMarketEvent(s, {
          kind: tile.type === 'railroad' ? 'railroad-rent' : tile.type === 'utility' ? 'utility-rent' : 'rent-paid',
          polarity: 'bullish',
          playerId: owner.id,
          affectedPlayerId: player.id,
          tileId: tile.id,
          amount: rent,
        });
        charge(s, ctx, player, rent, owner.id, `${tile.name} 的租金`, false, tile.id);
      } else if (own.mortgaged) {
        log(s, `${tile.name} 已被抵押, 不用付租金`);
      }
    }
    return;
  }

  switch (tile.type) {
    case 'tax':
      log(s, `${player.name} 落在 ${tile.name}`);
      recordMarketEvent(s, {
        kind: 'tax-paid',
        polarity: 'bearish',
        playerId: player.id,
        tileId: tile.id,
        amount: tile.amount,
        industries: ['finance'],
      });
      charge(s, ctx, player, tile.amount, null, tile.name, true, tile.id);
      return;
    case 'chance':
    case 'chest':
      queueCardDraw(s, player, tile.type, diceSum);
      return;
    case 'go-to-jail':
      sendToJail(s, ctx, player);
      return;
    case 'free-parking':
      if (s.settings.freeParkingPot && s.pot > 0) {
        player.cash += s.pot;
        ctx.events.push({ type: 'cash', from: null, to: player.id, amount: s.pot, tileId: tile.id });
        log(s, `${player.name} 落在免费停车, 领走奖池 $${s.pot}!`);
        s.pot = 0;
      }
      return;
    default:
      return;
  }
}

function drawCard(
  s: GameState, ctx: Ctx, player: PlayerState, deck: 'chance' | 'chest', diceSum: number,
): void {
  const pile = deck === 'chance' ? s.chanceDeck : s.chestDeck;
  const cardId = pile.shift();
  if (cardId == null) throw new Error('牌堆空了');
  const card = getCard(cardId);
  if (card.effect.kind !== 'jail-card') pile.push(cardId); // 出狱卡被玩家保留
  const cardText = localizeCardText(card, s.settings.language);
  const deckName = localizeDeckName(deck, s.settings.language);
  ctx.events.push({ type: 'card', deck, text: cardText, playerId: player.id });
  log(s, pickLanguage(
    s.settings.language,
    `${player.name} 抽到${deckName}卡:「${cardText}」`,
    `${player.name} drew a ${deckName} card: "${cardText}"`,
    `${player.name} pioche une carte ${deckName}: « ${cardText} »`,
  ));
  applyCardEffect(s, ctx, player, card, diceSum);
}

function queueCardDraw(
  s: GameState, player: PlayerState, deck: 'chance' | 'chest', diceSum: number,
): void {
  const tile = getTile(player.position);
  s.pendingCard = { playerId: player.id, deck, diceSum, tileId: tile.id };
  const deckName = localizeDeckName(deck, s.settings.language);
  log(s, pickLanguage(
    s.settings.language,
    `${player.name} 来到${deckName}格, 请在手机上亲手抽一张${deckName}卡`,
    `${player.name} landed on ${deckName}; draw a ${deckName} card on the phone`,
    `${player.name} arrive sur ${deckName}; piochez une carte ${deckName} sur le téléphone`,
  ));
}

function applyCardEffect(
  s: GameState, ctx: Ctx, player: PlayerState, card: Card, diceSum: number,
): void {
  const e = card.effect;
  switch (e.kind) {
    case 'move-to': {
      moveToTile(s, ctx, player, e.tileId);
      resolveLanding(s, ctx, player, diceSum);
      return;
    }
    case 'move-nearest': {
      const targetId = nearestTile(player.position, e.target);
      moveToTile(s, ctx, player, targetId);
      if (e.target === 'utility') {
        const freshSum = rollDie(ctx.rng) + rollDie(ctx.rng);
        log(s, `${player.name} 掷出 ${freshSum} 点计算费用`);
        resolveLanding(s, ctx, player, freshSum, { utilTen: true });
      } else {
        resolveLanding(s, ctx, player, diceSum, { railDouble: true });
      }
      return;
    }
    case 'move-back': {
      moveBack(s, ctx, player, e.steps);
      resolveLanding(s, ctx, player, diceSum);
      return;
    }
    case 'money': {
      if (e.amount >= 0) {
        player.cash += e.amount;
        ctx.events.push({ type: 'cash', from: null, to: player.id, amount: e.amount });
      } else {
        charge(s, ctx, player, -e.amount, null, '卡牌费用', true);
      }
      return;
    }
    case 'money-each': {
      const others = alivePlayers(s).filter((p) => p.id !== player.id);
      if (e.amount > 0) {
        for (const other of others) charge(s, ctx, other, e.amount, player.id, `给 ${player.name} 的礼金`);
      } else {
        for (const other of others) charge(s, ctx, player, -e.amount, other.id, `付给 ${other.name}`);
      }
      return;
    }
    case 'repairs': {
      let total = 0;
      for (const id of playerProperties(s, player.id)) {
        const houses = s.ownership[id]!.houses;
        if (houses === 5) total += e.perHotel;
        else total += houses * e.perHouse;
      }
      if (total > 0) charge(s, ctx, player, total, null, '房屋维修费', true);
      else log(s, `${player.name} 没有建筑, 逃过一劫`);
      return;
    }
    case 'go-to-jail':
      sendToJail(s, ctx, player);
      return;
    case 'jail-card':
      player.jailCards.push(card.deck);
      return;
  }
}

function moveToTile(s: GameState, ctx: Ctx, player: PlayerState, tileId: number): void {
  const steps = (tileId - player.position + 40) % 40;
  if (steps === 0) return;
  moveWalk(s, ctx, player, steps);
}

function nearestTile(from: number, type: 'railroad' | 'utility'): number {
  for (let i = 1; i <= 40; i++) {
    const tile = BOARD[(from + i) % 40]!;
    if (tile.type === type) return tile.id;
  }
  throw new Error('unreachable');
}

// ---------------------------------------------------------------- 收付款与债务

/** 立即支付 (调用方保证付得起) */
function pay(
  s: GameState, ctx: Ctx, payer: PlayerState, amount: number,
  creditorId: string | null, toPot: boolean, tileId?: number,
): void {
  payer.cash -= amount;
  let received: string | null = null;
  if (creditorId) {
    const creditor = getPlayer(s, creditorId);
    if (!creditor.bankrupt) {
      creditor.cash += amount;
      received = creditor.id;
    }
  } else if (toPot && s.settings.freeParkingPot) {
    s.pot += amount;
  }
  ctx.events.push({ type: 'cash', from: payer.id, to: received, amount, tileId });
}

/** 向玩家收钱; 现金不够则挂账进入筹钱流程 */
function charge(
  s: GameState, ctx: Ctx, payer: PlayerState, amount: number,
  creditorId: string | null, reason: string, toPot = false, tileId?: number,
): void {
  if (amount <= 0) return;
  if (payer.cash >= amount) {
    pay(s, ctx, payer, amount, creditorId, toPot, tileId);
    const to = creditorId ? getPlayer(s, creditorId).name : '银行';
    log(s, `${payer.name} 付给${to} $${amount} (${reason})`);
  } else {
    s.debts.push({ debtor: payer.id, creditor: creditorId, amount, reason });
    log(s, `${payer.name} 现金不足以支付 $${amount} (${reason}), 需要变卖资产筹钱!`);
  }
}

function settleDebts(s: GameState, ctx: Ctx): void {
  while (s.debts.length > 0) {
    const debt = s.debts[0]!;
    const debtor = getPlayer(s, debt.debtor);
    if (debtor.bankrupt) {
      s.debts.shift();
      continue;
    }
    if (debtor.cash < debt.amount) break;
    pay(s, ctx, debtor, debt.amount, debt.creditor, true);
    const to = debt.creditor ? getPlayer(s, debt.creditor).name : '银行';
    log(s, `${debtor.name} 付清了欠${to}的 $${debt.amount} (${debt.reason})`);
    s.debts.shift();
  }
}

function executeBankruptcy(s: GameState, ctx: Ctx, debtorId: string): void {
  const debtor = getPlayer(s, debtorId);
  const debt = s.debts.find((d) => d.debtor === debtorId)!;
  const creditor = debt.creditor ? getPlayer(s, debt.creditor) : null;
  recordMarketEvent(s, {
    kind: 'bankruptcy',
    polarity: 'bearish',
    playerId: debtor.id,
    affectedPlayerId: creditor?.id,
    amount: debt.amount,
    industries: ['finance', 'realEstate'],
  });
  log(s, `${debtor.name} 破产了! 全部资产移交给${creditor ? creditor.name : '银行'}`);
  ctx.events.push({
    type: 'bankrupt',
    playerId: debtor.id,
    creditorId: creditor && !creditor.bankrupt ? creditor.id : null,
  });

  // 建筑折半卖回银行, 收益并入现金
  const props = playerProperties(s, debtorId);
  let salvage = 0;
  for (const id of props) {
    const tile = getTile(id);
    const own = s.ownership[id]!;
    if (tile.type === 'property' && own.houses > 0) {
      if (own.houses === 5) {
        s.hotelsRemaining += 1;
        salvage += Math.floor((5 * tile.houseCost) / 2);
      } else {
        s.housesRemaining += own.houses;
        salvage += Math.floor((own.houses * tile.houseCost) / 2);
      }
      own.houses = 0;
    }
  }
  if (salvage > 0) {
    debtor.cash += salvage;
    ctx.events.push({ type: 'cash', from: null, to: debtor.id, amount: salvage });
  }

  // 现金
  if (creditor && !creditor.bankrupt && debtor.cash > 0) {
    creditor.cash += debtor.cash;
    ctx.events.push({ type: 'cash', from: debtor.id, to: creditor.id, amount: debtor.cash });
  }
  debtor.cash = 0;

  // ETF 持仓随破产资产一起转移；欠银行破产时直接清空。
  const debtorPortfolio = ensurePortfolio(s, debtorId);
  if (creditor && !creditor.bankrupt) {
    const creditorPortfolio = ensurePortfolio(s, creditor.id);
    for (const [etfId, shares] of Object.entries(debtorPortfolio) as [EtfId, number][]) {
      creditorPortfolio[etfId] += shares;
    }
  }
  s.portfolios[debtorId] = createEmptyPortfolio();

  // 地产
  const toAuction: number[] = [];
  for (const id of props) {
    const own = s.ownership[id]!;
    if (creditor && !creditor.bankrupt) {
      own.owner = creditor.id;
    } else {
      own.owner = null;
      own.mortgaged = false;
      toAuction.push(id);
    }
  }
  if (creditor && !creditor.bankrupt) emitMonopolyEvents(s, ctx, creditor.id, props);

  // 出狱卡
  if (creditor && !creditor.bankrupt) {
    creditor.jailCards.push(...debtor.jailCards);
  } else {
    for (const deck of debtor.jailCards) {
      (deck === 'chance' ? s.chanceDeck : s.chestDeck).push(JAIL_CARD_IDS[deck]);
    }
  }
  debtor.jailCards = [];
  debtor.bankrupt = true;
  s.debts = s.debts.filter((d) => d.debtor !== debtorId);
  if (s.trade && (s.trade.from === debtorId || s.trade.to === debtorId)) s.trade = null;

  if (checkWin(s, ctx)) return;

  if (toAuction.length > 0) {
    log(s, `${toAuction.map((id) => getTile(id).name).join('、')} 将被逐一拍卖`);
    if (s.auction) s.auction.queue.push(...toAuction);
    else startAuction(s, toAuction);
  }
}

function checkWin(s: GameState, ctx: Ctx): boolean {
  const alive = alivePlayers(s);
  if (alive.length === 1) {
    const winner = alive[0]!;
    s.winner = winner.id;
    s.phase = 'game-over';
    ctx.events.push({ type: 'game-over', winner: winner.id });
    log(s, `🏆 ${winner.name} 是最后的地产大亨, 获得胜利!`);
    return true;
  }
  return false;
}

function manualSettlementError(s: GameState): string | null {
  if (s.phase === 'game-over') return '游戏已结束';
  if (s.debts.length > 0 || s.phase === 'awaiting-debt') return '还有未结清债务, 先完成筹钱或破产处理';
  if (s.auction || s.phase === 'auction') return '拍卖结束后再结算';
  if (s.pendingCard || s.phase === 'awaiting-card') return '先抽卡并完成结算';
  if (s.pendingBuyTile != null || s.phase === 'awaiting-buy') return '先处理购买或拍卖再结算';
  return null;
}

function finishByNetWorth(s: GameState, ctx: Ctx, reason: string): void {
  const ranked = alivePlayers(s).sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id));
  const winner = ranked[0]!;
  s.trade = null;
  s.winner = winner.id;
  s.phase = 'game-over';
  ctx.events.push({ type: 'game-over', winner: winner.id });
  log(s, `${reason}, 🏆 ${winner.name} 以 $${netWorth(s, winner.id)} 获胜!`);
}

// ---------------------------------------------------------------- 拍卖

function startAuction(s: GameState, tileIds: number[]): void {
  const [first, ...rest] = tileIds;
  if (first == null) return;
  const alive = alivePlayers(s);
  const startIdx = Math.max(0, s.players.findIndex((p) => p.id === s.currentPlayer));
  const ordered = [...s.players.slice(startIdx + 1), ...s.players.slice(0, startIdx + 1)]
    .filter((p) => !p.bankrupt)
    .map((p) => p.id);
  s.auction = {
    tileId: first,
    queue: rest,
    participants: ordered.length ? ordered : alive.map((p) => p.id),
    folded: [],
    highBid: 0,
    highBidder: null,
    turn: ordered[0] ?? alive[0]!.id,
    deadline: Date.now() + AUCTION_TURN_MS,
  };
}

function advanceAuction(s: GameState, ctx: Ctx): void {
  const a = s.auction!;
  const active = a.participants.filter((p) => !a.folded.includes(p));

  if (a.highBidder) {
    const others = active.filter((p) => p !== a.highBidder);
    if (others.length === 0) {
      finishAuction(s, ctx, true);
      return;
    }
    a.turn = nextParticipant(a, others);
  } else {
    if (active.length === 0) {
      finishAuction(s, ctx, false);
      return;
    }
    a.turn = nextParticipant(a, active);
  }
  a.deadline = Date.now() + AUCTION_TURN_MS;
}

function nextParticipant(a: AuctionState, candidates: string[]): string {
  const idx = a.participants.indexOf(a.turn);
  for (let i = 1; i <= a.participants.length; i++) {
    const p = a.participants[(idx + i) % a.participants.length]!;
    if (candidates.includes(p)) return p;
  }
  return candidates[0]!;
}

function finishAuction(s: GameState, ctx: Ctx, sold: boolean): void {
  const a = s.auction!;
  const tile = getTile(a.tileId);
  if (sold && a.highBidder) {
    const winner = getPlayer(s, a.highBidder);
    winner.cash -= a.highBid;
    s.ownership[a.tileId]!.owner = winner.id;
    ctx.events.push({ type: 'cash', from: winner.id, to: null, amount: a.highBid, tileId: a.tileId });
    if (isOwnable(tile)) {
      recordMarketEvent(s, {
        kind: 'property-bought',
        polarity: 'bullish',
        playerId: winner.id,
        tileId: tile.id,
        amount: a.highBid,
      });
    }
    log(s, `${winner.name} 以 $${a.highBid} 拍得 ${tile.name}!`);
    emitMonopolyEvents(s, ctx, winner.id, [a.tileId]);
  } else {
    log(s, `没有人出价, ${tile.name} 流拍, 仍归银行所有`);
  }

  if (a.queue.length > 0) {
    startAuction(s, a.queue);
    return;
  }
  s.auction = null;
  settleFlow(s, ctx);
}

// ---------------------------------------------------------------- 交易

function validateEtfOrder(s: GameState, etfId: EtfId, shares: number): string | null {
  if (!s.market.etfs[etfId]) return '未知 ETF';
  if (!Number.isInteger(shares) || shares <= 0) return 'ETF 股数必须是正整数';
  return null;
}

function ensurePortfolio(s: GameState, playerId: string): GameState['portfolios'][string] {
  s.portfolios[playerId] ??= createEmptyPortfolio();
  return s.portfolios[playerId]!;
}

function validateTradeSide(s: GameState, ownerId: string, side: TradeSide): string | null {
  const owner = getPlayer(s, ownerId);
  if (!Number.isInteger(side.cash) || side.cash < 0) return '交易金额无效';
  if (side.cash > owner.cash) return `${owner.name} 的现金不够`;
  if (!Number.isInteger(side.jailCards) || side.jailCards < 0 || side.jailCards > owner.jailCards.length) {
    return `${owner.name} 没有那么多出狱卡`;
  }
  for (const tileId of side.properties) {
    const own = s.ownership[tileId];
    const tile = BOARD[tileId];
    if (!own || !tile || !isOwnable(tile)) return '交易中包含无效地块';
    if (own.owner !== ownerId) return `${tile.name} 不属于 ${owner.name}`;
    if (tile.type === 'property') {
      const group = groupTiles(tile.group);
      if (group.some((t) => (s.ownership[t.id]?.houses ?? 0) > 0)) {
        return `${tile.name} 同色组上有建筑, 先卖掉才能交易`;
      }
    }
  }
  return null;
}

function isEmptyTrade(give: TradeSide, get: TradeSide): boolean {
  const empty = (x: TradeSide) => x.cash === 0 && x.properties.length === 0 && x.jailCards === 0;
  return empty(give) && empty(get);
}

/** 把 side 里的资产从 fromId 转给 toId (已校验) */
function executeTrade(s: GameState, ctx: Ctx, fromId: string, toId: string, side: TradeSide): void {
  const from = getPlayer(s, fromId);
  const to = getPlayer(s, toId);
  from.cash -= side.cash;
  to.cash += side.cash;
  if (side.cash > 0) ctx.events.push({ type: 'cash', from: fromId, to: toId, amount: side.cash });
  for (const tileId of side.properties) s.ownership[tileId]!.owner = toId;
  for (let i = 0; i < side.jailCards; i++) {
    const deck = from.jailCards.pop();
    if (deck) to.jailCards.push(deck);
  }
  emitMonopolyEvents(s, ctx, toId, side.properties);
}

function describeTrade(t: { give: TradeSide; get: TradeSide }): string {
  const part = (x: TradeSide) => {
    const bits: string[] = [];
    if (x.cash > 0) bits.push(`$${x.cash}`);
    if (x.properties.length) bits.push(x.properties.map((id) => getTile(id).name).join('、'));
    if (x.jailCards > 0) bits.push(`${x.jailCards} 张出狱卡`);
    return bits.length ? bits.join(' + ') : '(无)';
  };
  return `付出 ${part(t.give)} ⇄ 换取 ${part(t.get)}`;
}

// ---------------------------------------------------------------- 回合推进

/**
 * 每次结算后的统一调度: 债务 → 拍卖 → 待购 → 回合继续。
 * 是引擎里唯一决定 phase 的地方 (除 game-over / 明确设置外)。
 */
function settleFlow(s: GameState, ctx: Ctx): void {
  if (s.winner) {
    s.phase = 'game-over';
    return;
  }
  settleDebts(s, ctx);
  if (s.debts.length > 0) {
    s.phase = 'awaiting-debt';
    return;
  }
  if (s.auction) {
    s.phase = 'auction';
    return;
  }
  if (s.pendingCard) {
    s.phase = 'awaiting-card';
    return;
  }
  if (s.pendingBuyTile != null) {
    s.phase = 'awaiting-buy';
    return;
  }
  continueTurn(s, ctx);
}

function continueTurn(s: GameState, ctx: Ctx): void {
  const cur = getPlayer(s, s.currentPlayer);
  if (cur.bankrupt) {
    advanceTurn(s, ctx);
    return;
  }
  if (s.dice && s.dice[0] === s.dice[1] && !cur.inJail && !s.suppressDoubles) {
    s.phase = 'awaiting-roll';
    log(s, `双数! ${cur.name} 可以再掷一次`);
    return;
  }
  s.phase = 'manage';
}

function advanceTurn(s: GameState, ctx: Ctx): void {
  s.trade = null;
  s.pendingBuyTile = null;
  s.pendingCard = null;
  s.turnCount += 1;

  if (s.settings.maxTurns && s.turnCount >= s.settings.maxTurns) {
    finishByNetWorth(s, ctx, '达到回合上限! 按净资产结算');
    return;
  }

  const idx = s.players.findIndex((p) => p.id === s.currentPlayer);
  let nextIdx = idx;
  for (let i = 1; i <= s.players.length; i++) {
    nextIdx = (idx + i) % s.players.length;
    const next = s.players[nextIdx]!;
    if (!next.bankrupt) {
      s.currentPlayer = next.id;
      break;
    }
  }
  if (nextIdx <= idx) s.market = settleMarketRound(s.market);
  s.dice = null;
  s.doublesCount = 0;
  s.suppressDoubles = false;
  s.phase = 'awaiting-roll';
  const cur = getPlayer(s, s.currentPlayer);
  log(s, `—— 轮到 ${cur.name} ——`);
}

// ---------------------------------------------------------------- 日志

function log(s: GameState, text: string): void {
  s.log.push({ text, ts: Date.now() });
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}

function marketIndustries(industries: IndustryTag[]): IndustryTag[] {
  return [...new Set(industries)];
}

/** tileIds 刚交割给 playerId; 若某色组因此集齐, 广播垄断事件 */
function emitMonopolyEvents(s: GameState, ctx: Ctx, playerId: string, tileIds: number[]): void {
  const groups = new Set<ColorGroup>();
  for (const id of tileIds) {
    const tile = BOARD[id];
    if (tile?.type === 'property') groups.add(tile.group);
  }
  for (const group of groups) {
    if (ownsFullGroup(s, playerId, group)) {
      ctx.events.push({ type: 'monopoly', playerId, group });
      log(s, `🎩 ${getPlayer(s, playerId).name} 集齐${GROUP_NAMES[group]}色组, 垄断达成!`);
    }
  }
}
