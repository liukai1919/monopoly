import type {
  CardTile, ColorGroup, CornerTile, IndustryTag, OwnableTile, PropertyTile, RailroadTile, TaxTile, Tile, UtilityTile,
} from './types';

export const GO_SALARY = 200;
export const JAIL_POS = 10;
export const JAIL_FINE = 50;
export const START_CASH = 1500;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;
export const MORTGAGE_INTEREST = 1.1; // 赎回 = 抵押值 × 1.1

const P = (
  id: number, name: string, nameEn: string, nameFr: string, group: ColorGroup,
  price: number, houseCost: number,
  rent: [number, number, number, number, number, number],
  industries: IndustryTag[],
): PropertyTile => ({
  type: 'property',
  id,
  name,
  nameEn,
  nameFr,
  group,
  price,
  houseCost,
  rent,
  instruction: `买地 / 收租 / 集齐同色且停在组内可盖房`,
  instructionEn: 'Buy property, collect rent, and build after you own the color set and stop on it',
  instructionFr: 'Achetez, percevez le loyer et construisez quand vous possédez le groupe et vous y arrêtez',
  industries,
});

const R = (id: number, name: string, nameEn: string, nameFr: string): RailroadTile => ({
  type: 'railroad',
  id,
  name,
  nameEn,
  nameFr,
  price: 200,
  instruction: '买铁路, 拥有越多租金越高',
  instructionEn: 'Buy railroads; rent rises as you own more',
  instructionFr: 'Achetez des chemins de fer; le loyer augmente avec le nombre possédé',
  industries: ['logistics'],
});

const U = (id: number, name: string, nameEn: string, nameFr: string): UtilityTile => ({
  type: 'utility',
  id,
  name,
  nameEn,
  nameFr,
  price: 150,
  instruction: '买公用事业, 按骰点收租',
  instructionEn: 'Buy utilities and charge rent based on the dice total',
  instructionFr: 'Achetez des services publics et facturez selon le total des dés',
  industries: ['utilities'],
});

const T = (id: number, name: string, nameEn: string, nameFr: string, amount: number): TaxTile => ({
  type: 'tax',
  id,
  name,
  nameEn,
  nameFr,
  amount,
  instruction: `向银行缴税 $${amount}`,
  instructionEn: `Pay $${amount} tax to the bank`,
  instructionFr: `Payez ${amount} $ d’impôt à la banque`,
  industries: ['finance'],
});

const C = (type: CardTile['type'], id: number, name: string, nameEn: string, nameFr: string): CardTile => ({
  type,
  id,
  name,
  nameEn,
  nameFr,
  instruction: type === 'chance' ? '停在这里, 亲手抽机会卡' : '停在这里, 亲手抽宝箱卡',
  instructionEn: type === 'chance'
    ? 'Land here and draw a Chance card yourself'
    : 'Land here and draw a Community Chest card yourself',
  instructionFr: type === 'chance'
    ? 'Arrêtez-vous ici et piochez vous-même une carte Chance'
    : 'Arrêtez-vous ici et piochez vous-même une carte Caisse commune',
  industries: [],
});

const O = (
  type: CornerTile['type'],
  id: number,
  name: string,
  nameEn: string,
  nameFr: string,
  instruction: string,
  instructionEn: string,
  instructionFr: string,
): CornerTile => ({
  type,
  id,
  name,
  nameEn,
  nameFr,
  instruction,
  instructionEn,
  instructionFr,
  industries: [],
});

/** 加拿大版 40 格棋盘, 索引 0 = 起点, 顺时针 */
export const BOARD: Tile[] = [
  O(
    'go',
    0,
    '起点',
    'GO',
    'Départ',
    `经过或停在这里领取 $${GO_SALARY}`,
    `Collect $${GO_SALARY} when you pass or land here`,
    `Recevez ${GO_SALARY} $ en passant ou en vous arrêtant ici`,
  ),
  P(1, '圣约翰斯', "St. John's", 'Saint-Jean', 'brown', 60, 50, [2, 10, 30, 90, 160, 250], ['logistics', 'tourism']),
  C('chest', 2, '宝箱', 'Community Chest', 'Caisse commune'),
  P(3, '夏洛特敦', 'Charlottetown', 'Charlottetown', 'brown', 60, 50, [4, 20, 60, 180, 320, 450], ['tourism', 'realEstate']),
  T(4, '所得税', 'Income Tax', 'Impôt sur le revenu', 200),
  R(5, 'VIA 铁路', 'VIA Rail', 'VIA Rail'),
  P(6, '蒙克顿', 'Moncton', 'Moncton', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550], ['logistics', 'industrial']),
  C('chance', 7, '机会', 'Chance', 'Chance'),
  P(8, '弗雷德里克顿', 'Fredericton', 'Fredericton', 'lightblue', 100, 50, [6, 30, 90, 270, 400, 550], ['tech', 'tourism']),
  P(9, '哈利法克斯', 'Halifax', 'Halifax', 'lightblue', 120, 50, [8, 40, 100, 300, 450, 600], ['logistics', 'tourism']),
  O(
    'jail',
    10,
    '监狱 (探监)',
    'Jail',
    'Prison',
    '路过只是探监, 入狱后需保释或掷双数',
    'Passing by is just visiting; bail out or roll doubles if jailed',
    'Passer ici est une simple visite; payez une caution ou faites un double si vous êtes en prison',
  ),
  P(11, '里贾纳', 'Regina', 'Regina', 'pink', 140, 100, [10, 50, 150, 450, 625, 750], ['energy', 'industrial']),
  U(12, '水电公司', 'Hydro Power', 'Hydroélectricité'),
  P(13, '萨斯卡通', 'Saskatoon', 'Saskatoon', 'pink', 140, 100, [10, 50, 150, 450, 625, 750], ['energy', 'industrial']),
  P(14, '温尼伯', 'Winnipeg', 'Winnipeg', 'pink', 160, 100, [12, 60, 180, 500, 700, 900], ['logistics', 'industrial']),
  R(15, 'CN 铁路', 'CN Rail', 'CN Rail'),
  P(16, '温莎', 'Windsor', 'Windsor', 'orange', 180, 100, [14, 70, 200, 550, 750, 950], ['industrial', 'logistics']),
  C('chest', 17, '宝箱', 'Community Chest', 'Caisse commune'),
  P(18, '哈密尔顿', 'Hamilton', 'Hamilton', 'orange', 180, 100, [14, 70, 200, 550, 750, 950], ['industrial', 'realEstate']),
  P(19, '伦敦', 'London', 'London', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000], ['tech', 'tourism']),
  O(
    'free-parking',
    20,
    '免费停车',
    'Free Parking',
    'Stationnement gratuit',
    '休息一回合; 开启房规时可领取奖池',
    'Rest here; collect the pot if the house rule is on',
    'Repos; recevez la cagnotte si la règle maison est activée',
  ),
  P(21, '魁北克城', 'Quebec City', 'Québec', 'red', 220, 150, [18, 90, 250, 700, 875, 1050], ['tourism', 'tech']),
  C('chance', 22, '机会', 'Chance', 'Chance'),
  P(23, '拉瓦尔', 'Laval', 'Laval', 'red', 220, 150, [18, 90, 250, 700, 875, 1050], ['tech', 'realEstate']),
  P(24, '蒙特利尔', 'Montreal', 'Montréal', 'red', 240, 150, [20, 100, 300, 750, 925, 1100], ['tech', 'tourism']),
  R(25, 'CP 铁路', 'CP Rail', 'CP Rail'),
  P(26, '密西沙加', 'Mississauga', 'Mississauga', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150], ['logistics', 'realEstate']),
  P(27, '布兰普顿', 'Brampton', 'Brampton', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150], ['logistics', 'industrial']),
  U(28, '自来水厂', 'Water Works', 'Service des eaux'),
  P(29, '渥太华', 'Ottawa', 'Ottawa', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200], ['tech', 'finance']),
  O(
    'go-to-jail',
    30,
    '入狱',
    'Go To Jail',
    'Allez en prison',
    '直接进监狱, 不经过起点',
    'Go directly to Jail; do not pass GO',
    'Allez directement en prison; ne passez pas par Départ',
  ),
  P(31, '埃德蒙顿', 'Edmonton', 'Edmonton', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275], ['energy', 'industrial']),
  P(32, '维多利亚', 'Victoria', 'Victoria', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275], ['tourism', 'realEstate']),
  C('chest', 33, '宝箱', 'Community Chest', 'Caisse commune'),
  P(34, '卡尔加里', 'Calgary', 'Calgary', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400], ['energy', 'finance']),
  R(35, '落基山之光', 'Rocky Mountaineer', 'Rocky Mountaineer'),
  C('chance', 36, '机会', 'Chance', 'Chance'),
  P(37, '温哥华', 'Vancouver', 'Vancouver', 'darkblue', 350, 200, [35, 175, 500, 1100, 1300, 1500], ['realEstate', 'logistics']),
  T(38, '奢侈税', 'Luxury Tax', 'Taxe de luxe', 100),
  P(39, '多伦多', 'Toronto', 'Toronto', 'darkblue', 400, 200, [50, 200, 600, 1400, 1700, 2000], ['finance', 'realEstate']),
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
