import type {
  Card, ColorGroup, EtfId, IndustryTag, Language, Tile,
} from './types';
import type { PlayerToken } from './playerTokens';

export const DEFAULT_LANGUAGE: Language = 'zh';

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

export function parseLanguage(value: unknown): Language {
  return value === 'en' || value === 'fr' || value === 'zh' ? value : DEFAULT_LANGUAGE;
}

export function pickLanguage<T>(language: Language, zh: T, en: T, fr: T): T {
  if (language === 'en') return en;
  if (language === 'fr') return fr;
  return zh;
}

export function localizeTileName(tile: Tile, language: Language): string {
  return pickLanguage(language, tile.name, tile.nameEn, tile.nameFr);
}

export function localizeTileInstruction(tile: Tile, language: Language): string {
  return pickLanguage(language, tile.instruction, tile.instructionEn, tile.instructionFr);
}

export function localizeCardText(card: Card, language: Language): string {
  return pickLanguage(language, card.text, card.textEn, card.textFr);
}

export function localizeDeckName(deck: 'chance' | 'chest', language: Language): string {
  if (deck === 'chance') return pickLanguage(language, '机会', 'Chance', 'Chance');
  return pickLanguage(language, '宝箱', 'Community Chest', 'Caisse commune');
}

export const GROUP_NAMES_I18N: Record<Language, Record<ColorGroup, string>> = {
  zh: {
    brown: '棕色',
    lightblue: '浅蓝',
    pink: '粉色',
    orange: '橙色',
    red: '红色',
    yellow: '黄色',
    green: '绿色',
    darkblue: '深蓝',
  },
  en: {
    brown: 'Brown',
    lightblue: 'Light Blue',
    pink: 'Pink',
    orange: 'Orange',
    red: 'Red',
    yellow: 'Yellow',
    green: 'Green',
    darkblue: 'Dark Blue',
  },
  fr: {
    brown: 'Brun',
    lightblue: 'Bleu clair',
    pink: 'Rose',
    orange: 'Orange',
    red: 'Rouge',
    yellow: 'Jaune',
    green: 'Vert',
    darkblue: 'Bleu foncé',
  },
};

export function localizeGroupName(group: ColorGroup, language: Language): string {
  return GROUP_NAMES_I18N[language][group];
}

export const INDUSTRY_NAMES_I18N: Record<Language, Record<IndustryTag, string>> = {
  zh: {
    realEstate: '地产',
    finance: '金融',
    energy: '能源',
    tech: '科技',
    logistics: '物流交通',
    utilities: '公用事业',
    tourism: '旅游文化',
    industrial: '工业工程',
  },
  en: {
    realEstate: 'Real Estate',
    finance: 'Finance',
    energy: 'Energy',
    tech: 'Technology',
    logistics: 'Logistics',
    utilities: 'Utilities',
    tourism: 'Tourism',
    industrial: 'Industrial',
  },
  fr: {
    realEstate: 'Immobilier',
    finance: 'Finance',
    energy: 'Énergie',
    tech: 'Technologie',
    logistics: 'Logistique',
    utilities: 'Services publics',
    tourism: 'Tourisme',
    industrial: 'Industrie',
  },
};

export function localizeIndustryName(industry: IndustryTag, language: Language): string {
  return INDUSTRY_NAMES_I18N[language][industry];
}

const ETF_NAMES_I18N: Record<Language, Record<EtfId, string>> = {
  zh: {
    'CAN-REAL': '加拿大地产 ETF',
    'CAN-FIN': '加拿大金融 ETF',
    'CAN-ENE': '加拿大能源 ETF',
    'CAN-TECH': '加拿大科技 ETF',
    'CAN-LOGI': '加拿大物流交通 ETF',
    'CAN-UTIL': '加拿大公用事业 ETF',
    'CAN-TOUR': '加拿大旅游文化 ETF',
    'CAN-IND': '加拿大工业工程 ETF',
  },
  en: {
    'CAN-REAL': 'Canada Real Estate ETF',
    'CAN-FIN': 'Canada Finance ETF',
    'CAN-ENE': 'Canada Energy ETF',
    'CAN-TECH': 'Canada Technology ETF',
    'CAN-LOGI': 'Canada Logistics ETF',
    'CAN-UTIL': 'Canada Utilities ETF',
    'CAN-TOUR': 'Canada Tourism ETF',
    'CAN-IND': 'Canada Industrial ETF',
  },
  fr: {
    'CAN-REAL': 'FNB immobilier canadien',
    'CAN-FIN': 'FNB finance canadienne',
    'CAN-ENE': 'FNB énergie canadienne',
    'CAN-TECH': 'FNB technologie canadienne',
    'CAN-LOGI': 'FNB logistique canadienne',
    'CAN-UTIL': 'FNB services publics canadiens',
    'CAN-TOUR': 'FNB tourisme canadien',
    'CAN-IND': 'FNB industrie canadienne',
  },
};

export function localizeEtfName(etfId: EtfId, language: Language): string {
  return ETF_NAMES_I18N[language][etfId];
}

export function localizeTokenSubtitle(token: PlayerToken, language: Language): string {
  return pickLanguage(language, token.subtitle, token.subtitleEn, token.subtitleFr);
}

export function localizeBankName(language: Language): string {
  return pickLanguage(language, '银行', 'the bank', 'la banque');
}

export function localizeMarketName(language: Language): string {
  return pickLanguage(language, '市场', 'the market', 'le marché');
}

export function localizePlayerLabel(language: Language): string {
  return pickLanguage(language, '玩家', 'player', 'joueur');
}

export function localizeOpponentLabel(language: Language): string {
  return pickLanguage(language, '对手', 'opponent', 'adversaire');
}
