import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createGame } from '@monopoly/shared';
import type { DiceStyle } from '@monopoly/shared';
import { applyPlayerAction, broadcast } from './gameHost';
import {
  AI_EMOJIS, AI_NAMES, AI_TOKEN_IDS, PLAYER_COLORS, createRoom, getRoom, pickToken, sweepRooms, touch,
} from './rooms';

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

// 手机扫码需要的局域网地址
app.get('/api/info', (_req, res) => {
  const all = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  // 家庭路由器常用网段优先; 172.x 多半是 WSL / Hyper-V 虚拟网卡, 手机连不上
  const score = (ip: string) =>
    ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 3 : 2;
  const ips = [...all].sort((a, b) => score(a) - score(b));
  res.json({ ips, port: PORT });
});

// 生产模式: 托管打包好的前端
const clientDist = path.resolve(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('已托管前端静态文件:', clientDist);
}

interface SocketData {
  code?: string;
  playerId?: string;
  role?: 'board' | 'player';
}

io.on('connection', (socket) => {
  const data = socket.data as SocketData;

  // ---- 大屏: 创建房间 ----
  socket.on('board:create', (_payload: unknown, cb?: (res: { code: string }) => void) => {
    const room = createRoom();
    data.code = room.code;
    data.role = 'board';
    void socket.join(room.code);
    if (typeof cb === 'function') cb({ code: room.code });
    broadcast(io, room);
  });

  // ---- 大屏: 重新打开已有房间 ----
  socket.on('board:watch', (payload: { code?: string }, cb?: (res: { ok?: boolean; error?: string }) => void) => {
    const room = getRoom(payload?.code);
    if (!room) return cb?.({ error: '房间不存在或已过期' });
    data.code = room.code;
    data.role = 'board';
    void socket.join(room.code);
    cb?.({ ok: true });
    broadcast(io, room);
  });

  // ---- 手机: 加入 / 断线重连 ----
  socket.on('player:join', (
    payload: { code?: string; playerId?: string; name?: string; emoji?: string; tokenId?: string },
    cb?: (res: { ok?: boolean; error?: string }) => void,
  ) => {
    const room = getRoom(payload?.code);
    const playerId = payload?.playerId?.slice(0, 64);
    if (!room) return cb?.({ error: '房间不存在, 请核对房间码' });
    if (!playerId) return cb?.({ error: '缺少玩家标识' });

    let seat = room.lobby.find((p) => p.id === playerId);
    if (seat) {
      seat.connected = true;
      if (payload.name) seat.name = payload.name.trim().slice(0, 12) || seat.name;
      if (!room.game && (payload.tokenId || payload.emoji)) {
        const seatId = seat.id;
        const token = pickToken(
          { ...room, lobby: room.lobby.filter((p) => p.id !== seatId) },
          payload.tokenId,
          payload.emoji,
        );
        seat.tokenId = token.id;
        seat.emoji = token.emoji;
      }
    } else {
      if (room.game) return cb?.({ error: '游戏已经开始, 这局不能中途加入了' });
      if (room.lobby.length >= 6) return cb?.({ error: '房间满了 (最多 6 人)' });
      const token = pickToken(room, payload.tokenId, payload.emoji);
      seat = {
        id: playerId,
        name: payload.name?.trim().slice(0, 12) || `玩家${room.lobby.length + 1}`,
        emoji: token.emoji,
        tokenId: token.id,
        color: PLAYER_COLORS[room.lobby.length % PLAYER_COLORS.length]!,
        isAi: false,
        connected: true,
      };
      room.lobby.push(seat);
    }
    if (room.game) {
      const gp = room.game.players.find((p) => p.id === playerId);
      if (gp) gp.connected = true;
    }
    data.code = room.code;
    data.playerId = playerId;
    data.role = 'player';
    void socket.join(room.code);
    touch(room);
    cb?.({ ok: true });
    broadcast(io, room);
  });

  // ---- 大厅管理 (大屏上的按钮) ----
  socket.on('lobby:add-ai', (payload: { code?: string }) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room || room.game || room.lobby.length >= 6) return;
    const aiCount = room.lobby.filter((p) => p.isAi).length;
    if (aiCount >= AI_NAMES.length) return;
    const token = pickToken(room, AI_TOKEN_IDS[aiCount], AI_EMOJIS[aiCount]);
    room.lobby.push({
      id: `ai-${aiCount + 1}-${room.code}`,
      name: AI_NAMES[aiCount]!,
      emoji: token.emoji,
      tokenId: token.id,
      color: PLAYER_COLORS[room.lobby.length % PLAYER_COLORS.length]!,
      isAi: true,
      connected: true,
    });
    touch(room);
    broadcast(io, room);
  });

  socket.on('lobby:remove-ai', (payload: { code?: string }) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room || room.game) return;
    for (let i = room.lobby.length - 1; i >= 0; i--) {
      if (room.lobby[i]!.isAi) {
        room.lobby.splice(i, 1);
        break;
      }
    }
    touch(room);
    broadcast(io, room);
  });

  socket.on('lobby:kick', (payload: { code?: string; playerId?: string }) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room || room.game || !payload?.playerId) return;
    room.lobby = room.lobby.filter((p) => p.id !== payload.playerId);
    touch(room);
    broadcast(io, room);
  });

  // ---- 开局 ----
  socket.on('lobby:start', (
    payload: {
      code?: string;
      freeParkingPot?: boolean;
      maxTurns?: number | null;
      diceStyle?: DiceStyle;
      soundEnabled?: boolean;
    },
    cb?: (res: { ok?: boolean; error?: string }) => void,
  ) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room) return cb?.({ error: '房间不存在' });
    if (room.game && room.game.phase !== 'game-over') return cb?.({ error: '游戏已在进行中' });
    if (room.lobby.length < 2) return cb?.({ error: '至少需要 2 名玩家, 可以添加 AI 凑数' });
    try {
      room.game = createGame(
        room.lobby.map((p) => ({
          id: p.id,
          name: p.name,
          emoji: p.emoji,
          tokenId: p.tokenId,
          color: p.color,
          isAi: p.isAi,
        })),
        {
          freeParkingPot: !!payload?.freeParkingPot,
          maxTurns: payload?.maxTurns && payload.maxTurns > 0 ? payload.maxTurns : null,
          diceStyle: payload?.diceStyle ?? 'classic',
          soundEnabled: payload?.soundEnabled ?? true,
        },
      );
      for (const gp of room.game.players) {
        const seat = room.lobby.find((p) => p.id === gp.id);
        if (seat) gp.connected = seat.connected;
      }
    } catch (e) {
      return cb?.({ error: e instanceof Error ? e.message : '开局失败' });
    }
    touch(room);
    cb?.({ ok: true });
    broadcast(io, room);
  });

  // ---- 再来一局: 回到大厅 ----
  socket.on('lobby:reset', (payload: { code?: string }) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room || (room.game && room.game.phase !== 'game-over')) return;
    room.game = null;
    touch(room);
    broadcast(io, room);
  });

  // ---- 游戏动作 ----
  socket.on('game:action', (
    payload: { code?: string; action?: unknown },
    cb?: (res: { ok?: boolean; error?: string }) => void,
  ) => {
    const room = getRoom(payload?.code ?? data.code);
    if (!room || !data.playerId) return cb?.({ error: '尚未加入房间' });
    if (!payload?.action || typeof payload.action !== 'object') return cb?.({ error: '无效动作' });
    const error = applyPlayerAction(io, room, data.playerId, payload.action as never);
    cb?.(error ? { error } : { ok: true });
  });

  // ---- 断线: 只标记, 不移除, 等待重连 ----
  socket.on('disconnect', () => {
    const room = getRoom(data.code);
    if (!room || !data.playerId) return;
    const seat = room.lobby.find((p) => p.id === data.playerId);
    if (seat) seat.connected = false;
    if (room.game) {
      const gp = room.game.players.find((p) => p.id === data.playerId);
      if (gp) gp.connected = false;
    }
    broadcast(io, room);
  });
});

setInterval(sweepRooms, 30 * 60 * 1000);

// 单台设备发来异常消息不应终结整个游戏夜
process.on('uncaughtException', (e) => console.error('未捕获异常:', e));
process.on('unhandledRejection', (e) => console.error('未处理的 Promise 拒绝:', e));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🍁 大富翁服务器已启动: http://localhost:${PORT}`);
});
