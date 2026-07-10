import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  localizeCardText,
  localizeDeckName,
  localizeEtfName,
  localizeGroupName,
  localizeIndustryName,
  localizeTileInstruction,
  localizeTileName,
  localizeTokenSubtitle,
  parseLanguage,
  pickLanguage,
} from '@monopoly/shared';
import type { Language } from '@monopoly/shared';

export {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  localizeCardText,
  localizeDeckName,
  localizeEtfName,
  localizeGroupName,
  localizeIndustryName,
  localizeTileInstruction,
  localizeTileName,
  localizeTokenSubtitle,
  parseLanguage,
};
export type { Language };

export const LANGUAGE_STORAGE_KEY = 'monopoly-language';

export function tr(language: Language, zh: string, en: string, fr: string): string {
  return pickLanguage(language, zh, en, fr);
}

export function storedLanguage(): Language {
  if (typeof localStorage === 'undefined') return DEFAULT_LANGUAGE;
  return parseLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
}

export function saveLanguage(language: Language): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function formatMoney(amount: number, language: Language): string {
  return language === 'fr' ? `${amount} $` : `$${amount}`;
}

export function formatSignedMoney(amount: number, language: Language): string {
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(amount), language)}`;
}

export function formatShareCount(count: number, language: Language): string {
  if (language === 'zh') return `${count} 股`;
  if (language === 'fr') return `${count} part${count > 1 ? 's' : ''}`;
  return `${count} share${count === 1 ? '' : 's'}`;
}

const MESSAGE_TRANSLATIONS: Record<string, Record<Language, string>> = {
  游戏尚未开始: {
    zh: '游戏尚未开始',
    en: 'The game has not started yet.',
    fr: 'La partie n’a pas encore commencé.',
  },
  '大屏动画还在播放, 稍等一下': {
    zh: '大屏动画还在播放, 稍等一下',
    en: 'The big-screen animation is still playing. Give it a moment.',
    fr: 'L’animation du grand écran est encore en cours. Un instant.',
  },
  无效动作: {
    zh: '无效动作',
    en: 'Invalid action.',
    fr: 'Action invalide.',
  },
  房间不存在: {
    zh: '房间不存在',
    en: 'Room not found.',
    fr: 'Salle introuvable.',
  },
  房间不存在或已过期: {
    zh: '房间不存在或已过期',
    en: 'Room not found or expired.',
    fr: 'Salle introuvable ou expirée.',
  },
  '房间不存在, 请核对房间码': {
    zh: '房间不存在, 请核对房间码',
    en: 'Room not found. Check the room code.',
    fr: 'Salle introuvable. Vérifiez le code.',
  },
  缺少玩家标识: {
    zh: '缺少玩家标识',
    en: 'Missing player ID.',
    fr: 'Identifiant joueur manquant.',
  },
  游戏已经开始: {
    zh: '游戏已经开始',
    en: 'The game has already started.',
    fr: 'La partie a déjà commencé.',
  },
  '游戏已经开始, 这局不能中途加入了': {
    zh: '游戏已经开始, 这局不能中途加入了',
    en: 'The game has already started. You cannot join this round.',
    fr: 'La partie a déjà commencé. Vous ne pouvez pas rejoindre cette manche.',
  },
  '房间满了 (最多 6 人)': {
    zh: '房间满了 (最多 6 人)',
    en: 'Room is full (max 6 players).',
    fr: 'La salle est pleine (6 joueurs max).',
  },
  游戏已在进行中: {
    zh: '游戏已在进行中',
    en: 'A game is already in progress.',
    fr: 'Une partie est déjà en cours.',
  },
  '至少需要 2 名玩家, 可以添加 AI 凑数': {
    zh: '至少需要 2 名玩家, 可以添加 AI 凑数',
    en: 'At least 2 players are required. You can add AI players.',
    fr: 'Il faut au moins 2 joueurs. Vous pouvez ajouter des IA.',
  },
  开局失败: {
    zh: '开局失败',
    en: 'Could not start the game.',
    fr: 'Impossible de démarrer la partie.',
  },
  尚未加入房间: {
    zh: '尚未加入房间',
    en: 'You have not joined the room yet.',
    fr: 'Vous n’avez pas encore rejoint la salle.',
  },
  只有大屏可以发起结算: {
    zh: '只有大屏可以发起结算',
    en: 'Only the big screen can settle the game.',
    fr: 'Seul le grand écran peut régler la partie.',
  },
};

export function localizeMessage(message: string, language: Language): string {
  return MESSAGE_TRANSLATIONS[message]?.[language] ?? message;
}
