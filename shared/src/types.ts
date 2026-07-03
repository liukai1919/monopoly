// ---------- 棋盘 ----------
export type ColorGroup =
  | 'brown' | 'lightblue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'darkblue';

export interface PropertyTile {
  type: 'property';
  id: number;
  name: string;      // 中文名
  nameEn: string;    // 英文名
  group: ColorGroup;
  price: number;
  houseCost: number;
  /** 租金表: [空地, 1房, 2房, 3房, 4房, 酒店] */
  rent: [number, number, number, number, number, number];
}
export interface RailroadTile { type: 'railroad'; id: number; name: string; nameEn: string; price: number; }
export interface UtilityTile { type: 'utility'; id: number; name: string; nameEn: string; price: number; }
export interface TaxTile { type: 'tax'; id: number; name: string; nameEn: string; amount: number; }
export interface CardTile { type: 'chance' | 'chest'; id: number; name: string; nameEn: string; }
export interface CornerTile { type: 'go' | 'jail' | 'free-parking' | 'go-to-jail'; id: number; name: string; nameEn: string; }

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
}

export interface TradeSide { cash: number; properties: number[]; jailCards: number; }
export interface TradeOffer { id: string; from: string; to: string; give: TradeSide; get: TradeSide; }

export interface GameSettings {
  freeParkingPot: boolean;      // 房规: 税款进免费停车奖池
  maxTurns: number | null;      // 回合上限, 到达后按净资产分胜负 (null = 玩到只剩一人)
}

export interface LogEntry { text: string; ts: number; }

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
  auction: AuctionState | null;
  debts: Debt[];
  trade: TradeOffer | null;
  chanceDeck: number[];
  chestDeck: number[];
  pot: number;                  // 免费停车奖池
  turnCount: number;
  winner: string | null;
  settings: GameSettings;
  log: LogEntry[];
}

// ---------- 玩家动作 ----------
export type Action =
  | { type: 'roll' }
  | { type: 'jail-pay' }
  | { type: 'jail-card' }
  | { type: 'buy' }
  | { type: 'decline-buy' }
  | { type: 'bid'; amount: number }
  | { type: 'pass-bid' }
  | { type: 'build'; tileId: number }
  | { type: 'sell-house'; tileId: number }
  | { type: 'mortgage'; tileId: number }
  | { type: 'unmortgage'; tileId: number }
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
  | { type: 'game-over'; winner: string };

export type RNG = () => number;

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
