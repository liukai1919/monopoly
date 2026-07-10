// ---------- 棋盘 ----------
export type ColorGroup =
  | 'brown' | 'lightblue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'darkblue';

export type DiceStyle = 'classic' | 'maple' | 'neon';
export type IndustryTag =
  | 'realEstate'
  | 'finance'
  | 'energy'
  | 'tech'
  | 'logistics'
  | 'utilities'
  | 'tourism'
  | 'industrial';

export type EtfId =
  | 'CAN-REAL'
  | 'CAN-FIN'
  | 'CAN-ENE'
  | 'CAN-TECH'
  | 'CAN-LOGI'
  | 'CAN-UTIL'
  | 'CAN-TOUR'
  | 'CAN-IND';

interface TileBase {
  id: number;
  name: string;      // 中文名
  nameEn: string;    // 英文名
  instruction: string;
  industries: IndustryTag[];
}

export interface PropertyTile extends TileBase {
  type: 'property';
  group: ColorGroup;
  price: number;
  houseCost: number;
  /** 租金表: [空地, 1房, 2房, 3房, 4房, 酒店] */
  rent: [number, number, number, number, number, number];
}
export interface RailroadTile extends TileBase { type: 'railroad'; price: number; }
export interface UtilityTile extends TileBase { type: 'utility'; price: number; }
export interface TaxTile extends TileBase { type: 'tax'; amount: number; }
export interface CardTile extends TileBase { type: 'chance' | 'chest'; }
export interface CornerTile extends TileBase { type: 'go' | 'jail' | 'free-parking' | 'go-to-jail'; }

export type Tile = PropertyTile | RailroadTile | UtilityTile | TaxTile | CardTile | CornerTile;
export type OwnableTile = PropertyTile | RailroadTile | UtilityTile;

// ---------- 卡牌 ----------
export type CardEffect =
  | { kind: 'move-to'; tileId: number }                      // 前进到某格(经过起点领薪水)
  | { kind: 'move-nearest'; target: 'railroad' | 'utility' } // 有主时付特殊租金
  | { kind: 'move-back'; steps: number }
  | { kind: 'money'; amount: number }                        // 与银行结算, 正收负付
  | { kind: 'money-each'; amount: number }                   // 正: 每位玩家给你; 负: 你给每位玩家
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  | { kind: 'go-to-jail' }
  | { kind: 'jail-card' };

export interface Card { id: number; deck: 'chance' | 'chest'; text: string; effect: CardEffect; }

// ---------- 玩家 ----------
export interface PlayerState {
  id: string;
  name: string;
  emoji: string;
  tokenId?: string;
  color: string;
  isAi: boolean;
  connected: boolean;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: ('chance' | 'chest')[];
  bankrupt: boolean;
}

export interface Ownership {
  owner: string | null;
  houses: number;      // 0-4, 5 = 酒店
  mortgaged: boolean;
}

// ---------- 回合阶段 ----------
export type TurnPhase =
  | 'awaiting-roll'   // 等当前玩家掷骰(含监狱决策)
  | 'awaiting-buy'    // 落在无主地: 买 or 送拍卖
  | 'awaiting-card'   // 落在机会/宝箱: 等玩家亲手抽牌
  | 'auction'         // 拍卖进行中
  | 'awaiting-debt'   // 有人资不抵债, 变卖筹钱中
  | 'manage'          // 本回合行动结束, 可管理资产/交易, 然后结束回合
  | 'game-over';

export interface AuctionState {
  tileId: number;
  queue: number[];              // 后续待拍卖地块(破产清算时可能有多块)
  participants: string[];
  folded: string[];
  highBid: number;
  highBidder: string | null;
  turn: string;                 // 轮到谁表态
  deadline: number;             // epoch ms, 超时服务器自动弃拍
}

export interface Debt {
  debtor: string;
  creditor: string | null;      // null = 银行
  amount: number;
  reason: string;
  kind: PaymentKind;            // 结清时用于归类统计
  tileId?: number;
}

export interface TradeSide { cash: number; properties: number[]; jailCards: number; }
export interface TradeOffer { id: string; from: string; to: string; give: TradeSide; get: TradeSide; }

export interface PendingCardDraw {
  playerId: string;
  deck: 'chance' | 'chest';
  diceSum: number;
  tileId: number;
}

export type MarketRegime = 'bull' | 'neutral' | 'bear';
export type MarketPolarity = 'bullish' | 'bearish';
export type MarketEventKind =
  | 'property-bought'
  | 'rent-paid'
  | 'railroad-rent'
  | 'utility-rent'
  | 'build'
  | 'sell-house'
  | 'mortgage'
  | 'unmortgage'
  | 'tax-paid'
  | 'bankruptcy'
  | 'etf-bought'
  | 'etf-sold'
  | 'etf-forced-sold';

export type IndustryScoreMap = Record<IndustryTag, number>;
export type Portfolio = Record<EtfId, number>;

export interface EtfState {
  id: EtfId;
  name: string;
  industries: IndustryTag[];
  priceCents: number;
  lastPriceCents: number;
  historyCents: number[];
}

export interface MarketEvent {
  id: string;
  turn: number;
  kind: MarketEventKind;
  industry: IndustryTag;
  etfId: EtfId;
  polarity: MarketPolarity;
  magnitude: number;
  playerId?: string;
  affectedPlayerId?: string;
  tileId?: number;
  amount?: number;
  headline: string;
  driverText: string;
}

export interface MarketState {
  regime: MarketRegime;
  etfs: Record<EtfId, EtfState>;
  signals: IndustryScoreMap;
  activityThisTurn: IndustryScoreMap;
  sentimentThisTurn: IndustryScoreMap;
  totalActivityThisTurn: number;
  nextEventId: number;
  recentEvents: MarketEvent[];
}

export interface GameSettings {
  freeParkingPot: boolean;      // 房规: 税款进免费停车奖池
  maxTurns: number | null;      // 回合上限, 到达后按净资产分胜负 (null = 玩到只剩一人)
  diceStyle: DiceStyle;
  soundEnabled: boolean;
}

export interface LogEntry { text: string; ts: number; }

// ---------- 终局统计 ----------
export type PaymentKind = 'rent' | 'tax' | 'card' | 'gift' | 'repairs' | 'bail' | 'other';

export interface PlayerEtfStats {
  /** 当前持仓的成本 (分), 平均成本法, 含买入手续费 */
  costCents: Record<EtfId, number>;
  /** 已实现盈亏 (分): 卖出净得 - 卖出部分成本; 破产没收计为全额亏损 */
  realizedCents: number;
  /** 累计投入 (分) */
  investedCents: number;
}

export interface PlayerStats {
  rentReceived: number;
  rentPaid: number;
  taxesPaid: number;            // 税款 + 维修费 + 保释金
  salaryReceived: number;       // 经过起点领的薪水
  cardGains: number;            // 卡牌正向收入 + 礼金收入
  cardLosses: number;           // 卡牌罚款 + 礼金支出
  jailVisits: number;
  propertiesBought: number;     // 直购 + 拍得
  auctionWins: number;
  buildSpend: number;
  bankruptAtTurn: number | null;
  etf: PlayerEtfStats;
}

export interface RentRecord { payerId: string; ownerId: string; tileId: number; amount: number; }
export interface AuctionRecord { winnerId: string; tileId: number; bid: number; listPrice: number; }
export interface WindfallRecord { playerId: string; amount: number; text: string; }

export interface GameStats {
  players: Record<string, PlayerStats>;
  /** 每整轮结束时各玩家净资产快照, 列序与 s.players 对齐; [0] 为开局 */
  netWorthHistory: number[][];
  biggestRent: RentRecord | null;
  bestAuction: AuctionRecord | null;      // 最低 bid/listPrice
  biggestWindfall: WindfallRecord | null;
}

export interface GameState {
  phase: TurnPhase;
  players: PlayerState[];
  currentPlayer: string;
  ownership: Record<number, Ownership>;
  housesRemaining: number;
  hotelsRemaining: number;
  dice: [number, number] | null;
  doublesCount: number;
  suppressDoubles: boolean;     // 出狱那次掷骰即使双数也不能续掷
  pendingBuyTile: number | null;
  pendingCard: PendingCardDraw | null;
  auction: AuctionState | null;
  debts: Debt[];
  trade: TradeOffer | null;
  chanceDeck: number[];
  chestDeck: number[];
  pot: number;                  // 免费停车奖池
  market: MarketState;
  portfolios: Record<string, Portfolio>;
  turnCount: number;
  winner: string | null;
  settings: GameSettings;
  log: LogEntry[];
  stats: GameStats;
}

// ---------- 玩家动作 ----------
export type Action =
  | { type: 'roll' }
  | { type: 'jail-pay' }
  | { type: 'jail-card' }
  | { type: 'draw-card' }
  | { type: 'buy' }
  | { type: 'decline-buy' }
  | { type: 'bid'; amount: number }
  | { type: 'pass-bid' }
  | { type: 'build'; tileId: number }
  | { type: 'sell-house'; tileId: number }
  | { type: 'mortgage'; tileId: number }
  | { type: 'unmortgage'; tileId: number }
  | { type: 'buy-etf'; etfId: EtfId; shares: number }
  | { type: 'sell-etf'; etfId: EtfId; shares: number }
  | { type: 'propose-trade'; to: string; give: TradeSide; get: TradeSide }
  | { type: 'respond-trade'; accept: boolean }
  | { type: 'cancel-trade' }
  | { type: 'declare-bankruptcy' }
  | { type: 'end-turn' };

// ---------- 动画事件 ----------
export type GameEvent =
  | { type: 'dice'; playerId: string; dice: [number, number] }
  | { type: 'move'; playerId: string; path: number[]; teleport?: boolean }
  | { type: 'card'; deck: 'chance' | 'chest'; text: string; playerId: string }
  /** 一笔现金转移; from/to 为 null 表示银行(含奖池) */
  | { type: 'cash'; from: string | null; to: string | null; amount: number; tileId?: number }
  | { type: 'bankrupt'; playerId: string; creditorId: string | null }
  /** playerId 刚集齐 group 色组 */
  | { type: 'monopoly'; playerId: string; group: ColorGroup }
  | { type: 'game-over'; winner: string };

export type RNG = () => number;

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
