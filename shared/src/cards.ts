import type { Card } from './types';

/** 机会卡 id: 0-15, 宝箱卡 id: 100-115。效果同经典版, 文案加拿大风味 */
export const CHANCE_CARDS: Card[] = [
  { id: 0, deck: 'chance', text: '前进到起点, 领取 $200', effect: { kind: 'move-to', tileId: 0 } },
  { id: 1, deck: 'chance', text: '前进到蒙特利尔 Montreal', effect: { kind: 'move-to', tileId: 24 } },
  { id: 2, deck: 'chance', text: '前进到温哥华 Vancouver', effect: { kind: 'move-to', tileId: 37 } },
  { id: 3, deck: 'chance', text: '前进到里贾纳 Regina', effect: { kind: 'move-to', tileId: 11 } },
  { id: 4, deck: 'chance', text: '前进到最近的铁路。若已有主人, 付双倍租金; 若无主, 可以购买', effect: { kind: 'move-nearest', target: 'railroad' } },
  { id: 5, deck: 'chance', text: '前进到最近的铁路。若已有主人, 付双倍租金; 若无主, 可以购买', effect: { kind: 'move-nearest', target: 'railroad' } },
  { id: 6, deck: 'chance', text: '前进到最近的公用事业。若已有主人, 掷骰子付点数 10 倍的费用', effect: { kind: 'move-nearest', target: 'utility' } },
  { id: 7, deck: 'chance', text: '银行派发股息, 收 $50', effect: { kind: 'money', amount: 50 } },
  { id: 8, deck: 'chance', text: '出狱卡 — 保留到需要时使用', effect: { kind: 'jail-card' } },
  { id: 9, deck: 'chance', text: '后退 3 格', effect: { kind: 'move-back', steps: 3 } },
  { id: 10, deck: 'chance', text: '直接入狱! 不经过起点, 不领 $200', effect: { kind: 'go-to-jail' } },
  { id: 11, deck: 'chance', text: '冬季风暴! 房屋维修: 每栋房 $25, 每座酒店 $100', effect: { kind: 'repairs', perHouse: 25, perHotel: 100 } },
  { id: 12, deck: 'chance', text: '401 高速上超速, 罚款 $15', effect: { kind: 'money', amount: -15 } },
  { id: 13, deck: 'chance', text: '乘 VIA 铁路旅行, 前进到 VIA 铁路 (经过起点领 $200)', effect: { kind: 'move-to', tileId: 5 } },
  { id: 14, deck: 'chance', text: '你当选业主委员会主席, 付给每位玩家 $50', effect: { kind: 'money-each', amount: -50 } },
  { id: 15, deck: 'chance', text: '你的建房贷款获批, 收 $150', effect: { kind: 'money', amount: 150 } },
];

export const CHEST_CARDS: Card[] = [
  { id: 100, deck: 'chest', text: '回到起点, 领取 $200', effect: { kind: 'move-to', tileId: 0 } },
  { id: 101, deck: 'chest', text: '银行算错汇率, 你多收 $200', effect: { kind: 'money', amount: 200 } },
  { id: 102, deck: 'chest', text: '诊所挂号费, 付 $50', effect: { kind: 'money', amount: -50 } },
  { id: 103, deck: 'chest', text: '自家枫糖浆卖爆了, 收 $50', effect: { kind: 'money', amount: 50 } },
  { id: 104, deck: 'chest', text: '出狱卡 — 保留到需要时使用', effect: { kind: 'jail-card' } },
  { id: 105, deck: 'chest', text: '直接入狱! 不经过起点, 不领 $200', effect: { kind: 'go-to-jail' } },
  { id: 106, deck: 'chest', text: '度假基金到期, 收 $100', effect: { kind: 'money', amount: 100 } },
  { id: 107, deck: 'chest', text: 'CRA 给你退税, 收 $20', effect: { kind: 'money', amount: 20 } },
  { id: 108, deck: 'chest', text: '今天是你的生日, 每位玩家给你 $10', effect: { kind: 'money-each', amount: 10 } },
  { id: 109, deck: 'chest', text: '人寿保险分红, 收 $100', effect: { kind: 'money', amount: 100 } },
  { id: 110, deck: 'chest', text: '牙医账单 (医保不包!), 付 $100', effect: { kind: 'money', amount: -100 } },
  { id: 111, deck: 'chest', text: '孩子冰球夏令营报名费, 付 $50', effect: { kind: 'money', amount: -50 } },
  { id: 112, deck: 'chest', text: '周末帮邻居铲雪, 收 $25', effect: { kind: 'money', amount: 25 } },
  { id: 113, deck: 'chest', text: '街道除冰翻修: 每栋房 $40, 每座酒店 $115', effect: { kind: 'repairs', perHouse: 40, perHotel: 115 } },
  { id: 114, deck: 'chest', text: '枫糖节烘焙比赛第二名, 收 $10', effect: { kind: 'money', amount: 10 } },
  { id: 115, deck: 'chest', text: '收到远房亲戚的遗产, 收 $100', effect: { kind: 'money', amount: 100 } },
];

const ALL_CARDS = new Map<number, Card>([...CHANCE_CARDS, ...CHEST_CARDS].map((c) => [c.id, c]));

export function getCard(id: number): Card {
  const card = ALL_CARDS.get(id);
  if (!card) throw new Error(`unknown card ${id}`);
  return card;
}
