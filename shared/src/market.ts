import { BOARD } from './board';
import type {
  EtfId, EtfState, GameState, IndustryScoreMap, IndustryTag, MarketEvent,
  MarketEventKind, MarketPolarity, MarketState, Portfolio,
} from './types';

const INITIAL_PRICE_CENTS = 10_000;
const MAX_RECENT_EVENTS = 16;
const SIGNAL_PRECISION = 4;

export const ALL_INDUSTRIES: IndustryTag[] = [
  'realEstate',
  'finance',
  'energy',
  'tech',
  'logistics',
  'utilities',
  'tourism',
  'industrial',
];

export const INDUSTRY_NAMES: Record<IndustryTag, string> = {
  realEstate: '地产',
  finance: '金融',
  energy: '能源',
  tech: '科技',
  logistics: '物流交通',
  utilities: '公用事业',
  tourism: '旅游文化',
  industrial: '工业工程',
};

export const ETF_DEFINITIONS: Record<EtfId, Omit<EtfState, 'priceCents' | 'lastPriceCents' | 'historyCents'>> = {
  'CAN-REAL': { id: 'CAN-REAL', name: '加拿大地产 ETF', industries: ['realEstate'] },
  'CAN-FIN': { id: 'CAN-FIN', name: '加拿大金融 ETF', industries: ['finance'] },
  'CAN-ENE': { id: 'CAN-ENE', name: '加拿大能源 ETF', industries: ['energy'] },
  'CAN-TECH': { id: 'CAN-TECH', name: '加拿大科技 ETF', industries: ['tech'] },
  'CAN-LOGI': { id: 'CAN-LOGI', name: '加拿大物流交通 ETF', industries: ['logistics'] },
  'CAN-UTIL': { id: 'CAN-UTIL', name: '加拿大公用事业 ETF', industries: ['utilities'] },
  'CAN-TOUR': { id: 'CAN-TOUR', name: '加拿大旅游文化 ETF', industries: ['tourism'] },
  'CAN-IND': { id: 'CAN-IND', name: '加拿大工业工程 ETF', industries: ['industrial'] },
};

const ETF_BY_INDUSTRY = Object.fromEntries(
  Object.values(ETF_DEFINITIONS).flatMap((etf) => etf.industries.map((industry) => [industry, etf.id])),
) as Record<IndustryTag, EtfId>;

export interface MarketEventInput {
  kind: MarketEventKind;
  polarity: MarketPolarity;
  playerId?: string;
  affectedPlayerId?: string;
  tileId?: number;
  amount?: number;
  magnitude?: number;
  industries?: IndustryTag[];
}

export function emptyIndustryScores(): IndustryScoreMap {
  return Object.fromEntries(ALL_INDUSTRIES.map((tag) => [tag, 0])) as IndustryScoreMap;
}

export function createEmptyPortfolio(): Portfolio {
  return Object.fromEntries(Object.keys(ETF_DEFINITIONS).map((id) => [id, 0])) as Portfolio;
}

export function createMarket(): MarketState {
  const etfs = Object.fromEntries(
    Object.entries(ETF_DEFINITIONS).map(([id, def]) => [
      id,
      {
        ...def,
        priceCents: INITIAL_PRICE_CENTS,
        lastPriceCents: INITIAL_PRICE_CENTS,
        historyCents: [INITIAL_PRICE_CENTS],
      },
    ]),
  ) as Record<EtfId, EtfState>;

  return {
    regime: 'neutral',
    etfs,
    signals: emptyIndustryScores(),
    activityThisTurn: emptyIndustryScores(),
    sentimentThisTurn: emptyIndustryScores(),
    totalActivityThisTurn: 0,
    recentEvents: [],
  };
}

export function recordMarketEvent(s: GameState, input: MarketEventInput): void {
  const industries = unique(input.industries ?? industriesForTile(input.tileId));
  if (industries.length === 0) return;

  const baseMagnitude = input.magnitude ?? magnitudeFromAmount(input.amount);
  const signedMagnitude = input.polarity === 'bullish' ? baseMagnitude : -baseMagnitude;
  const perIndustrySignal = roundSignal(signedMagnitude / industries.length);
  const perIndustryActivity = roundSignal(Math.abs(input.amount ?? baseMagnitude * 100) / industries.length);
  s.market.totalActivityThisTurn = roundSignal(s.market.totalActivityThisTurn + Math.abs(input.amount ?? baseMagnitude * 100));

  for (const industry of industries) {
    const etfId = ETF_BY_INDUSTRY[industry];
    s.market.signals[industry] = roundSignal(s.market.signals[industry] + perIndustrySignal);
    s.market.activityThisTurn[industry] = roundSignal(s.market.activityThisTurn[industry] + perIndustryActivity);
    s.market.sentimentThisTurn[industry] = roundSignal(s.market.sentimentThisTurn[industry] + perIndustrySignal);
    s.market.recentEvents.push(toMarketEvent(s, input, industry, etfId, Math.abs(perIndustrySignal)));
  }

  if (s.market.recentEvents.length > MAX_RECENT_EVENTS) {
    s.market.recentEvents.splice(0, s.market.recentEvents.length - MAX_RECENT_EVENTS);
  }
}

function industriesForTile(tileId: number | undefined): IndustryTag[] {
  if (tileId == null) return [];
  return BOARD[tileId]?.industries ?? [];
}

function magnitudeFromAmount(amount: number | undefined): number {
  if (!amount || amount <= 0) return 0.5;
  return roundSignal(Math.min(20, Math.max(0.5, amount / 100)));
}

function toMarketEvent(
  s: GameState,
  input: MarketEventInput,
  industry: IndustryTag,
  etfId: EtfId,
  magnitude: number,
): MarketEvent {
  const tile = input.tileId != null ? BOARD[input.tileId] : undefined;
  const player = input.playerId ? s.players.find((p) => p.id === input.playerId) : undefined;
  const affected = input.affectedPlayerId ? s.players.find((p) => p.id === input.affectedPlayerId) : undefined;
  const id = `m-${s.turnCount}-${s.market.recentEvents.length + 1}`;
  const context = {
    industry: INDUSTRY_NAMES[industry],
    city: tile?.name ?? '市场',
    player: player?.name ?? '玩家',
    affected: affected?.name ?? '对手',
    amount: input.amount ? `$${input.amount}` : '',
  };
  const { headline, driverText } = marketCopy(input.kind, input.polarity, context);
  return {
    id,
    turn: s.turnCount,
    kind: input.kind,
    industry,
    etfId,
    polarity: input.polarity,
    magnitude,
    playerId: input.playerId,
    affectedPlayerId: input.affectedPlayerId,
    tileId: input.tileId,
    amount: input.amount,
    headline,
    driverText,
  };
}

function marketCopy(
  kind: MarketEventKind,
  polarity: MarketPolarity,
  c: { industry: string; city: string; player: string; affected: string; amount: string },
): { headline: string; driverText: string } {
  const amount = c.amount ? ` ${c.amount}` : '';
  switch (kind) {
    case 'property-bought':
      return {
        headline: `资本流入${c.city}, ${c.industry}板块获得关注`,
        driverText: `${c.player} 买下${c.city}, 带来${c.industry}需求`,
      };
    case 'rent-paid':
      return {
        headline: `${c.city}租金收入升温, ${c.industry}板块走强`,
        driverText: `${c.affected} 在${c.city}支付租金${amount}`,
      };
    case 'railroad-rent':
      return {
        headline: `铁路系统客流走强, 物流交通 ETF 获得动能`,
        driverText: `${c.affected} 支付铁路租金${amount}`,
      };
    case 'utility-rent':
      return {
        headline: `公用事业现金流改善, CAN-UTIL 获得支撑`,
        driverText: `${c.affected} 支付公用事业费用${amount}`,
      };
    case 'build':
      return {
        headline: `${c.city}开发升级, 地产与${c.industry}需求抬升`,
        driverText: `${c.player} 在${c.city}投资建设${amount}`,
      };
    case 'sell-house':
      return {
        headline: `房产抛售压力浮现, 地产市场承压`,
        driverText: `${c.player} 拆售${c.city}建筑变现${amount}`,
      };
    case 'mortgage':
      return {
        headline: `抵押需求上升, 信贷风险压制金融 ETF`,
        driverText: `${c.player} 抵押${c.city}获得现金${amount}`,
      };
    case 'unmortgage':
      return {
        headline: `抵押赎回增加, 金融市场风险偏好回升`,
        driverText: `${c.player} 赎回${c.city}抵押${amount}`,
      };
    case 'tax-paid':
      return {
        headline: `系统税费回收现金, 市场流动性收紧`,
        driverText: `${c.player} 支付${c.city}${amount}`,
      };
    case 'bankruptcy':
      return {
        headline: `破产事件冲击信贷市场, 金融 ETF 承压`,
        driverText: `${c.player} 宣告破产, 坏账担忧升温`,
      };
    default:
      return {
        headline: polarity === 'bullish' ? `${c.industry}板块获得利好` : `${c.industry}板块承压`,
        driverText: `${c.player} 的行动影响了${c.industry}`,
      };
  }
}

function roundSignal(value: number): number {
  return Number(value.toFixed(SIGNAL_PRECISION));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
