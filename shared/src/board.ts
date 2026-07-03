import type { ColorGroup, OwnableTile, PropertyTile, Tile } from './types';

export const GO_SALARY = 200;
export const JAIL_POS = 10;
export const JAIL_FINE = 50;
export const START_CASH = 1500;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;
export const MORTGAGE_INTEREST = 1.1; // 赎回 = 抵押值 × 1.1

const P = (
  id: number, name: string, nameEn: string, group: ColorGroup,
  price: number, houseCost: number,
  rent: [number, number, number, number, number, number],
): PropertyTile => ({ type: 'property', id, name, nameEn, group, price, houseCost, rent });

/** 加拿大版 40 格棋盘, 索引 0 = 起点, 顺时针 */
export const BOARD: Tile[] = [
  { type: 'go', id: 0, name: '起点', nameEn: 'GO' },
  P(1, '圣约翰斯', "St. John's", 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { type: 'chest', id: 2, name: '宝箱', nameEn: 'Community Chest' },
  P(3, '夏洛特敦', 'Charlottetown', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { type: 'tax', id: 4, name: '所得税', nameEn: 'Income Tax', amount: 200 },
  { type: 'railroad', id: 5, name: 'VIA 铁路', nameEn: 'VIA Rail', price: 200 },
  P(6, '蒙克顿', 'Moncton', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550]),
  { type: 'chance', id: 7, name: '机会', nameEn: 'Chance' },
  P(8, '弗雷德里克顿', 'Fredericton', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550]),
  P(9, '哈利法克斯', 'Halifax', 'lightblue', 120, 50, [8, 40, 100, 300, 450, 600]),
  { type: 'jail', id: 10, name: '监狱 (探监)', nameEn: 'Jail' },
  P(11, '里贾纳', 'Regina', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  { type: 'utility', id: 12, name: '水电公司', nameEn: 'Hydro Power', price: 150 },
  P(13, '萨斯卡通', 'Saskatoon', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  P(14, '温尼伯', 'Winnipeg', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  { type: 'railroad', id: 15, name: 'CN 铁路', nameEn: 'CN Rail', price: 200 },
  P(16, '温莎', 'Windsor', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { type: 'chest', id: 17, name: '宝箱', nameEn: 'Community Chest' },
  P(18, '哈密尔顿', 'Hamilton', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  P(19, '伦敦', 'London', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { type: 'free-parking', id: 20, name: '免费停车', nameEn: 'Free Parking' },
  P(21, '魁北克城', 'Quebec City', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { type: 'chance', id: 22, name: '机会', nameEn: 'Chance' },
  P(23, '拉瓦尔', 'Laval', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  P(24, '蒙特利尔', 'Montreal', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  { type: 'railroad', id: 25, name: 'CP 铁路', nameEn: 'CP Rail', price: 200 },
  P(26, '密西沙加', 'Mississauga', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  P(27, '布兰普顿', 'Brampton', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  { type: 'utility', id: 28, name: '自来水厂', nameEn: 'Water Works', price: 150 },
  P(29, '渥太华', 'Ottawa', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { type: 'go-to-jail', id: 30, name: '入狱', nameEn: 'Go To Jail' },
  P(31, '埃德蒙顿', 'Edmonton', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  P(32, '维多利亚', 'Victoria', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { type: 'chest', id: 33, name: '宝箱', nameEn: 'Community Chest' },
  P(34, '卡尔加里', 'Calgary', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { type: 'railroad', id: 35, name: '落基山之光', nameEn: 'Rocky Mountaineer', price: 200 },
  { type: 'chance', id: 36, name: '机会', nameEn: 'Chance' },
  P(37, '温哥华', 'Vancouver', 'darkblue', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'tax', id: 38, name: '奢侈税', nameEn: 'Luxury Tax', amount: 100 },
  P(39, '多伦多', 'Toronto', 'darkblue', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export function isOwnable(tile: Tile): tile is OwnableTile {
  return tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility';
}

export const OWNABLE_IDS: number[] = BOARD.filter(isOwnable).map((t) => t.id);

export function groupTiles(group: ColorGroup): PropertyTile[] {
  return BOARD.filter((t): t is PropertyTile => t.type === 'property' && t.group === group);
}

export const GROUP_COLORS: Record<ColorGroup, string> = {
  brown: '#8B4513',
  lightblue: '#87CEEB',
  pink: '#D63384',
  orange: '#F28C28',
  red: '#D62828',
  yellow: '#F4C430',
  green: '#1E8449',
  darkblue: '#1F4E9C',
};

export const GROUP_NAMES: Record<ColorGroup, string> = {
  brown: '棕色', lightblue: '浅蓝', pink: '粉色', orange: '橙色',
  red: '红色', yellow: '黄色', green: '绿色', darkblue: '深蓝',
};
