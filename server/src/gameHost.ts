import type { Server } from 'socket.io';
import { applyAction, decideAction, settleGame, whoMustAct } from '@monopoly/shared';
import type { Action, GameEvent } from '@monopoly/shared';
import { touch, type Room } from './rooms';

const AI_THINK_MS = Number(process.env.AI_THINK_MS ?? 700);
const TURN_TRANSITION_LOCK_MS = 1900;

/** 把最新状态广播给房间里的所有屏幕, 并调度 AI / 拍卖超时 */
export function broadcast(io: Server, room: Room, events: GameEvent[] = []): void {
  io.to(room.code).emit('room:update', {
    code: room.code,
    language: room.game?.settings.language ?? room.language,
    lobby: room.lobby,
    game: room.game,
    events,
    actionLockedUntil: room.actionLockedUntil,
    actionLockRemainingMs: remainingActionLock(room),
  });
  scheduleAi(io, room);
  scheduleAuctionTimeout(io, room);
}

/** 应用一个玩家动作; 返回错误信息或 null */
export function applyPlayerAction(
  io: Server, room: Room, playerId: string, action: Action,
): string | null {
  if (!room.game) return '游戏尚未开始';
  if (remainingActionLock(room) > 0 && !bypassesActionLock(action)) {
    return '大屏动画还在播放, 稍等一下';
  }
  let result;
  try {
    result = applyAction(room.game, playerId, action);
  } catch (error) {
    console.warn(`[${room.code}] invalid action from ${playerId}`, action, error);
    return '无效动作';
  }
  if (!result.ok) return result.error;
  room.game = result.state;
  const lockMs = estimateActionLockMs(result.events, action);
  if (lockMs > 0 && !bypassesActionLock(action)) room.actionLockedUntil = Date.now() + lockMs;
  touch(room);
  broadcast(io, room, result.events);
  return null;
}

export function settleRoomGame(io: Server, room: Room): string | null {
  if (!room.game) return '游戏尚未开始';
  if (remainingActionLock(room) > 0) return '大屏动画还在播放, 稍等一下';

  const result = settleGame(room.game);
  if (!result.ok) return result.error;

  room.game = result.state;
  const lockMs = estimateActionLockMs(result.events, { type: 'end-turn' });
  if (lockMs > 0) room.actionLockedUntil = Date.now() + lockMs;
  touch(room);
  broadcast(io, room, result.events);
  return null;
}

/** 轮到 AI 时, 延迟一小会儿执行, 让真人看得清节奏 */
function scheduleAi(io: Server, room: Room): void {
  if (room.aiTimer) {
    clearTimeout(room.aiTimer);
    room.aiTimer = null;
  }
  const game = room.game;
  if (!game || game.phase === 'game-over') return;

  const lockRemaining = remainingActionLock(room);
  if (lockRemaining > 0) {
    room.aiTimer = setTimeout(() => {
      room.aiTimer = null;
      scheduleAi(io, room);
    }, lockRemaining + 60);
    return;
  }

  const actors = new Set(whoMustAct(game));
  if (game.trade) actors.add(game.trade.to);
  const aiActor = [...actors].find((id) => game.players.find((p) => p.id === id)?.isAi);
  if (!aiActor) return;

  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    const g = room.game;
    if (!g || g.phase === 'game-over') return;
    const action = decideAction(g, aiActor);
    if (!action) return;
    const error = applyPlayerAction(io, room, aiActor, action);
    if (error) {
      console.warn(`[${room.code}] AI ${aiActor} 的 ${action.type} 被拒绝: ${error}, 尝试兜底动作`);
      for (const fallback of ['draw-card', 'end-turn', 'pass-bid', 'decline-buy', 'roll'] as const) {
        if (!applyPlayerAction(io, room, aiActor, { type: fallback })) return;
      }
    }
  }, AI_THINK_MS);
}

/** 拍卖轮到真人却长时间不出价 → 到期自动弃拍, 防止全场干等 */
function scheduleAuctionTimeout(io: Server, room: Room): void {
  if (room.auctionTimer) {
    clearTimeout(room.auctionTimer);
    room.auctionTimer = null;
  }
  const game = room.game;
  if (!game || game.phase !== 'auction' || !game.auction) return;

  const lockRemaining = remainingActionLock(room);
  if (lockRemaining > 0) {
    room.auctionTimer = setTimeout(() => {
      room.auctionTimer = null;
      scheduleAuctionTimeout(io, room);
    }, lockRemaining + 60);
    return;
  }

  const delay = Math.max(500, game.auction.deadline - Date.now() + 300);
  room.auctionTimer = setTimeout(() => {
    room.auctionTimer = null;
    const g = room.game;
    if (!g || g.phase !== 'auction' || !g.auction) return;
    if (Date.now() < g.auction.deadline) {
      scheduleAuctionTimeout(io, room);
      return;
    }
    applyPlayerAction(io, room, g.auction.turn, { type: 'pass-bid' });
  }, delay);
}

function remainingActionLock(room: Room): number {
  return Math.max(0, room.actionLockedUntil - Date.now());
}

function bypassesActionLock(action: Action): boolean {
  return action.type === 'buy-etf' || action.type === 'sell-etf';
}

function estimateActionLockMs(events: GameEvent[], action: Action): number {
  let total = 0;
  for (const event of events) total += estimateEventLockMs(event);
  if (total === 0 && action.type === 'end-turn') return TURN_TRANSITION_LOCK_MS;
  if (total === 0) return 0;
  return Math.min(9500, total + 140);
}

function estimateEventLockMs(event: GameEvent): number {
  switch (event.type) {
    case 'dice':
      return 1050;
    case 'move':
      if (event.teleport) return 700;
      return event.path.length * (event.path.length > 12 ? 110 : 230) + 260;
    case 'card':
      return 2600;
    case 'cash':
      return 760;
    case 'build':
      return 950;
    case 'bankrupt':
      return 2000;
    case 'monopoly':
      return 2200;
    case 'game-over':
      return 900;
  }
}
