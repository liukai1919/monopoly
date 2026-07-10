import { BOARD } from './board';
import {
  DEFAULT_LANGUAGE, INDUSTRY_NAMES_I18N, localizeIndustryName, localizeMarketName, localizeOpponentLabel,
  localizePlayerLabel, localizeTileName,
} from './i18n';
import { STOCK_INITIAL_PRICE_CENTS, roundSignal, smoothSignal } from './pricingEngine';
import type {
  EtfId, EtfState, GameState, IndustryScoreMap, IndustryTag, Language, MarketEvent,
  MarketEventKind, MarketPolarity, MarketState, Portfolio,
} from './types';

const MAX_RECENT_EVENTS = 16;

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

export const INDUSTRY_NAMES: Record<IndustryTag, string> = INDUSTRY_NAMES_I18N.zh;

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
        priceCents: STOCK_INITIAL_PRICE_CENTS,
        lastPriceCents: STOCK_INITIAL_PRICE_CENTS,
        historyCents: [STOCK_INITIAL_PRICE_CENTS],
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
    nextEventId: 1,
    recentEvents: [],
  };
}

export function industriesForEtf(etfId: EtfId): IndustryTag[] {
  return ETF_DEFINITIONS[etfId]?.industries ?? [];
}

export function recordMarketEvent(s: GameState, input: MarketEventInput): void {
  const industries = unique(input.industries ?? industriesForTile(input.tileId));
  if (industries.length === 0) return;

  const baseMagnitude = input.magnitude ?? magnitudeFromAmount(input.amount);
  const signedMagnitude = input.polarity === 'bullish' ? baseMagnitude : -baseMagnitude;
  const perIndustrySignal = smoothSignal(signedMagnitude / industries.length);
  const perIndustryActivity = smoothSignal(Math.abs(input.amount ?? baseMagnitude * 100) / industries.length);
  s.market.totalActivityThisTurn = smoothSignal(s.market.totalActivityThisTurn + Math.abs(input.amount ?? baseMagnitude * 100));

  for (const industry of industries) {
    const etfId = ETF_BY_INDUSTRY[industry];
    s.market.signals[industry] = smoothSignal(s.market.signals[industry] + perIndustrySignal);
    s.market.activityThisTurn[industry] = smoothSignal(s.market.activityThisTurn[industry] + perIndustryActivity);
    s.market.sentimentThisTurn[industry] = smoothSignal(s.market.sentimentThisTurn[industry] + perIndustrySignal);
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
  const language = s.settings?.language ?? DEFAULT_LANGUAGE;
  const eventId = s.market.nextEventId ?? s.market.recentEvents.length + 1;
  s.market.nextEventId = eventId + 1;
  const id = `m-${eventId}`;
  const context = {
    industry: localizeIndustryName(industry, language),
    city: tile ? localizeTileName(tile, language) : localizeMarketName(language),
    player: player?.name ?? localizePlayerLabel(language),
    affected: affected?.name ?? localizeOpponentLabel(language),
    amount: input.amount ? formatMarketAmount(input.amount, language) : '',
  };
  const { headline, driverText } = marketCopy(input.kind, input.polarity, context, language);
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
  language: Language,
): { headline: string; driverText: string } {
  const amount = c.amount ? ` ${c.amount}` : '';
  if (language === 'en') {
    switch (kind) {
      case 'property-bought':
        return {
          headline: `Capital flows into ${c.city}; ${c.industry} gains attention`,
          driverText: `${c.player} bought ${c.city}, lifting ${c.industry} demand`,
        };
      case 'rent-paid':
        return {
          headline: `${c.city} rent income rises; ${c.industry} strengthens`,
          driverText: `${c.affected} paid rent at ${c.city}${amount}`,
        };
      case 'railroad-rent':
        return {
          headline: 'Rail traffic strengthens; CAN-LOGI gains momentum',
          driverText: `${c.affected} paid railroad rent${amount}`,
        };
      case 'utility-rent':
        return {
          headline: 'Utility cash flow improves; CAN-UTIL finds support',
          driverText: `${c.affected} paid utility fees${amount}`,
        };
      case 'build':
        return {
          headline: `${c.city} development upgrades lift real estate demand`,
          driverText: `${c.player} invested in construction at ${c.city}${amount}`,
        };
      case 'sell-house':
        return {
          headline: 'Property selling pressure weighs on real estate',
          driverText: `${c.player} sold buildings at ${c.city}${amount}`,
        };
      case 'mortgage':
        return {
          headline: 'Mortgage demand rises; credit risk weighs on finance',
          driverText: `${c.player} mortgaged ${c.city} for cash${amount}`,
        };
      case 'unmortgage':
        return {
          headline: 'Mortgage redemptions rise; finance sentiment improves',
          driverText: `${c.player} unmortgaged ${c.city}${amount}`,
        };
      case 'tax-paid':
        return {
          headline: 'Taxes drain cash from the board; liquidity tightens',
          driverText: `${c.player} paid ${c.city}${amount}`,
        };
      case 'bankruptcy':
        return {
          headline: 'Bankruptcy shocks credit markets; finance comes under pressure',
          driverText: `${c.player} declared bankruptcy, raising bad-debt concerns`,
        };
      case 'etf-bought':
        return {
          headline: `${c.industry} ETF sees buying inflows`,
          driverText: `${c.player} bought ${c.industry} ETF${amount}`,
        };
      case 'etf-sold':
        return {
          headline: `${c.industry} ETF sees profit-taking`,
          driverText: `${c.player} sold ${c.industry} ETF${amount}`,
        };
      case 'etf-forced-sold':
        return {
          headline: `${c.industry} ETF faces forced-selling pressure`,
          driverText: `${c.player} fire-sold ${c.industry} ETF to cover debt${amount}`,
        };
      default:
        return {
          headline: polarity === 'bullish' ? `${c.industry} gets a boost` : `${c.industry} comes under pressure`,
          driverText: `${c.player}'s action moved ${c.industry}`,
        };
    }
  }

  if (language === 'fr') {
    switch (kind) {
      case 'property-bought':
        return {
          headline: `Les capitaux affluent vers ${c.city}; le secteur ${c.industry} attire l’attention`,
          driverText: `${c.player} achète ${c.city}, ce qui stimule la demande en ${c.industry}`,
        };
      case 'rent-paid':
        return {
          headline: `Les loyers de ${c.city} montent; le secteur ${c.industry} se renforce`,
          driverText: `${c.affected} paie un loyer à ${c.city}${amount}`,
        };
      case 'railroad-rent':
        return {
          headline: 'Le trafic ferroviaire progresse; CAN-LOGI gagne de l’élan',
          driverText: `${c.affected} paie un loyer ferroviaire${amount}`,
        };
      case 'utility-rent':
        return {
          headline: 'Les flux des services publics s’améliorent; CAN-UTIL est soutenu',
          driverText: `${c.affected} paie des frais de services publics${amount}`,
        };
      case 'build':
        return {
          headline: `Le développement de ${c.city} stimule la demande immobilière`,
          driverText: `${c.player} investit dans la construction à ${c.city}${amount}`,
        };
      case 'sell-house':
        return {
          headline: 'Les ventes de bâtiments pèsent sur l’immobilier',
          driverText: `${c.player} vend des bâtiments à ${c.city}${amount}`,
        };
      case 'mortgage':
        return {
          headline: 'La demande de prêts hypothécaires monte; la finance subit la pression du risque',
          driverText: `${c.player} hypothèque ${c.city} pour obtenir des liquidités${amount}`,
        };
      case 'unmortgage':
        return {
          headline: 'Les rachats d’hypothèques augmentent; le sentiment financier s’améliore',
          driverText: `${c.player} lève l’hypothèque sur ${c.city}${amount}`,
        };
      case 'tax-paid':
        return {
          headline: 'Les taxes retirent des liquidités du plateau',
          driverText: `${c.player} paie ${c.city}${amount}`,
        };
      case 'bankruptcy':
        return {
          headline: 'Une faillite secoue le crédit; la finance est sous pression',
          driverText: `${c.player} déclare faillite, alimentant les craintes de créances douteuses`,
        };
      case 'etf-bought':
        return {
          headline: `Le FNB ${c.industry} reçoit des achats`,
          driverText: `${c.player} achète le FNB ${c.industry}${amount}`,
        };
      case 'etf-sold':
        return {
          headline: `Le FNB ${c.industry} subit des prises de bénéfices`,
          driverText: `${c.player} vend le FNB ${c.industry}${amount}`,
        };
      case 'etf-forced-sold':
        return {
          headline: `Le FNB ${c.industry} subit une vente forcée`,
          driverText: `${c.player} vend en urgence le FNB ${c.industry} pour payer sa dette${amount}`,
        };
      default:
        return {
          headline: polarity === 'bullish' ? `${c.industry} reçoit une impulsion` : `${c.industry} est sous pression`,
          driverText: `L’action de ${c.player} influence ${c.industry}`,
        };
    }
  }

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
    case 'etf-bought':
      return {
        headline: `${c.industry}ETF 获得买盘流入`,
        driverText: `${c.player} 买入${c.industry}ETF${amount}`,
      };
    case 'etf-sold':
      return {
        headline: `${c.industry}ETF 出现获利了结`,
        driverText: `${c.player} 卖出${c.industry}ETF${amount}`,
      };
    case 'etf-forced-sold':
      return {
        headline: `${c.industry}ETF 遭遇强制抛售压力`,
        driverText: `${c.player} 为偿债火售${c.industry}ETF${amount}`,
      };
    default:
      return {
        headline: polarity === 'bullish' ? `${c.industry}板块获得利好` : `${c.industry}板块承压`,
        driverText: `${c.player} 的行动影响了${c.industry}`,
      };
  }
}

function formatMarketAmount(amount: number, language: Language): string {
  return language === 'fr' ? `${amount} $` : `$${amount}`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
