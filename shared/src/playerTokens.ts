export type PlayerTokenCategory = 'historical' | 'mascot';

export interface PlayerToken {
  id: string;
  emoji: string;
  name: string;
  subtitle: string;
  category: PlayerTokenCategory;
}

export const PLAYER_TOKENS = [
  { id: 'terry-fox', emoji: '🏃', name: 'Terry Fox', subtitle: '希望马拉松', category: 'historical' },
  { id: 'viola-desmond', emoji: '💵', name: 'Viola Desmond', subtitle: '民权先驱', category: 'historical' },
  { id: 'louis-riel', emoji: '🧭', name: 'Louis Riel', subtitle: '梅蒂斯领袖', category: 'historical' },
  { id: 'laura-secord', emoji: '🕯️', name: 'Laura Secord', subtitle: '战时信使', category: 'historical' },
  { id: 'mary-ann-shadd', emoji: '📰', name: 'Mary Ann Shadd Cary', subtitle: '记者与废奴主义者', category: 'historical' },
  { id: 'tommy-douglas', emoji: '⚕️', name: 'Tommy Douglas', subtitle: '公共医疗推动者', category: 'historical' },
  { id: 'agnes-macphail', emoji: '🗳️', name: 'Agnes Macphail', subtitle: '首位女性国会议员', category: 'historical' },
  { id: 'alexander-bell', emoji: '☎️', name: 'Alexander Graham Bell', subtitle: '发明家', category: 'historical' },
  { id: 'maple-beaver', emoji: '🦫', name: 'Maple Beaver', subtitle: '枫糖筑坝师', category: 'mascot' },
  { id: 'mountie-moose', emoji: '🫎', name: 'Mountie Moose', subtitle: '巡逻驼鹿', category: 'mascot' },
  { id: 'hockey-loon', emoji: '🏒', name: 'Hockey Loon', subtitle: '冰上潜鸟', category: 'mascot' },
  { id: 'polar-bear', emoji: '🐻‍❄️', name: 'Aurora Bear', subtitle: '极光北极熊', category: 'mascot' },
  { id: 'northern-fox', emoji: '🦊', name: 'Northern Fox', subtitle: '北境狐狸', category: 'mascot' },
  { id: 'prairie-bison', emoji: '🦬', name: 'Prairie Bison', subtitle: '草原野牛', category: 'mascot' },
  { id: 'maple-leaf', emoji: '🍁', name: 'Maple Leaf', subtitle: '红枫化身', category: 'mascot' },
  { id: 'snowy-owl', emoji: '🦉', name: 'Snowy Owl', subtitle: '雪原猫头鹰', category: 'mascot' },
] as const satisfies readonly PlayerToken[];

export type PlayerTokenId = (typeof PLAYER_TOKENS)[number]['id'];

export const DEFAULT_PLAYER_TOKEN_ID: PlayerTokenId = 'maple-beaver';

export function getPlayerToken(id: string | undefined): PlayerToken | null {
  return PLAYER_TOKENS.find((token) => token.id === id) ?? null;
}

export function getPlayerTokenByEmoji(emoji: string | undefined): PlayerToken | null {
  return PLAYER_TOKENS.find((token) => token.emoji === emoji) ?? null;
}
