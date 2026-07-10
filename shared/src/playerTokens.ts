export type PlayerTokenCategory = 'historical' | 'mascot';

export interface PlayerToken {
  id: string;
  emoji: string;
  name: string;
  subtitle: string;
  subtitleEn: string;
  subtitleFr: string;
  category: PlayerTokenCategory;
}

export const PLAYER_TOKENS = [
  {
    id: 'terry-fox',
    emoji: '🏃',
    name: 'Terry Fox',
    subtitle: '希望马拉松',
    subtitleEn: 'Marathon of Hope',
    subtitleFr: 'Marathon de l’espoir',
    category: 'historical',
  },
  {
    id: 'viola-desmond',
    emoji: '💵',
    name: 'Viola Desmond',
    subtitle: '民权先驱',
    subtitleEn: 'Civil rights trailblazer',
    subtitleFr: 'Pionnière des droits civiques',
    category: 'historical',
  },
  {
    id: 'louis-riel',
    emoji: '🧭',
    name: 'Louis Riel',
    subtitle: '梅蒂斯领袖',
    subtitleEn: 'Métis leader',
    subtitleFr: 'Chef métis',
    category: 'historical',
  },
  {
    id: 'laura-secord',
    emoji: '🕯️',
    name: 'Laura Secord',
    subtitle: '战时信使',
    subtitleEn: 'Wartime messenger',
    subtitleFr: 'Messagère en temps de guerre',
    category: 'historical',
  },
  {
    id: 'mary-ann-shadd',
    emoji: '📰',
    name: 'Mary Ann Shadd Cary',
    subtitle: '记者与废奴主义者',
    subtitleEn: 'Journalist and abolitionist',
    subtitleFr: 'Journaliste et abolitionniste',
    category: 'historical',
  },
  {
    id: 'tommy-douglas',
    emoji: '⚕️',
    name: 'Tommy Douglas',
    subtitle: '公共医疗推动者',
    subtitleEn: 'Public healthcare champion',
    subtitleFr: 'Défenseur de la santé publique',
    category: 'historical',
  },
  {
    id: 'agnes-macphail',
    emoji: '🗳️',
    name: 'Agnes Macphail',
    subtitle: '首位女性国会议员',
    subtitleEn: 'First woman MP',
    subtitleFr: 'Première députée fédérale',
    category: 'historical',
  },
  {
    id: 'alexander-bell',
    emoji: '☎️',
    name: 'Alexander Graham Bell',
    subtitle: '发明家',
    subtitleEn: 'Inventor',
    subtitleFr: 'Inventeur',
    category: 'historical',
  },
  {
    id: 'maple-beaver',
    emoji: '🦫',
    name: 'Maple Beaver',
    subtitle: '枫糖筑坝师',
    subtitleEn: 'Maple dam builder',
    subtitleFr: 'Bâtisseur de barrages à l’érable',
    category: 'mascot',
  },
  {
    id: 'mountie-moose',
    emoji: '🫎',
    name: 'Mountie Moose',
    subtitle: '巡逻驼鹿',
    subtitleEn: 'Patrol mountie',
    subtitleFr: 'Patrouilleur monté',
    category: 'mascot',
  },
  {
    id: 'hockey-loon',
    emoji: '🏒',
    name: 'Hockey Loon',
    subtitle: '冰上潜鸟',
    subtitleEn: 'Rink regular',
    subtitleFr: 'Habitué de la patinoire',
    category: 'mascot',
  },
  {
    id: 'polar-bear',
    emoji: '🐻‍❄️',
    name: 'Aurora Bear',
    subtitle: '极光北极熊',
    subtitleEn: 'Northern lights guardian',
    subtitleFr: 'Gardien des aurores',
    category: 'mascot',
  },
  {
    id: 'northern-fox',
    emoji: '🦊',
    name: 'Northern Fox',
    subtitle: '北境狐狸',
    subtitleEn: 'Northern scout',
    subtitleFr: 'Éclaireur du Nord',
    category: 'mascot',
  },
  {
    id: 'prairie-bison',
    emoji: '🦬',
    name: 'Prairie Bison',
    subtitle: '草原野牛',
    subtitleEn: 'Prairie powerhouse',
    subtitleFr: 'Force des Prairies',
    category: 'mascot',
  },
  {
    id: 'maple-leaf',
    emoji: '🍁',
    name: 'Maple Leaf',
    subtitle: '红枫化身',
    subtitleEn: 'Red maple spirit',
    subtitleFr: 'Esprit de l’érable rouge',
    category: 'mascot',
  },
  {
    id: 'snowy-owl',
    emoji: '🦉',
    name: 'Snowy Owl',
    subtitle: '雪原猫头鹰',
    subtitleEn: 'Snowfield lookout',
    subtitleFr: 'Guetteur des neiges',
    category: 'mascot',
  },
] as const satisfies readonly PlayerToken[];

export type PlayerTokenId = (typeof PLAYER_TOKENS)[number]['id'];

export const DEFAULT_PLAYER_TOKEN_ID: PlayerTokenId = 'maple-beaver';

export function getPlayerToken(id: string | undefined): PlayerToken | null {
  return PLAYER_TOKENS.find((token) => token.id === id) ?? null;
}

export function getPlayerTokenByEmoji(emoji: string | undefined): PlayerToken | null {
  return PLAYER_TOKENS.find((token) => token.emoji === emoji) ?? null;
}
