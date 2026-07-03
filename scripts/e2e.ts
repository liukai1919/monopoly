/**
 * 端到端冒烟测试: 模拟 2 个"手机玩家" + 2 个服务器 AI, 通过真实的
 * Socket.IO 通道打完一整局。用法: npx tsx scripts/e2e.ts
 */
import { io, type Socket } from 'socket.io-client';
import { decideAction, netWorth, whoMustAct } from '@monopoly/shared';
import type { GameState } from '@monopoly/shared';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emitAck<T = { ok?: boolean; error?: string; code?: string }>(
  s: Socket, ev: string, payload: unknown,
): Promise<T> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { timeout: 5000 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error(`连不上服务器 ${BASE}: ${e.message}`)));
  });
}

async function main() {
  const board = await connect();
  const created = await emitAck<{ code: string }>(board, 'board:create', {});
  const code = created.code;
  console.log(`✅ 房间已创建: ${code}`);

  const humans = [
    { id: 'sim-p1', name: '老爸' },
    { id: 'sim-p2', name: '老妈' },
  ];
  const sockets = new Map<string, Socket>();
  for (const h of humans) {
    const s = await connect();
    const res = await emitAck(s, 'player:join', { code, playerId: h.id, name: h.name });
    if (res.error) throw new Error(`加入失败: ${res.error}`);
    sockets.set(h.id, s);
    console.log(`✅ ${h.name} 已加入`);
  }

  board.emit('lobby:add-ai', { code });
  board.emit('lobby:add-ai', { code });
  await sleep(400);

  const start = await emitAck(board, 'lobby:start', { code, maxTurns: 300 });
  if (start.error) throw new Error(`开局失败: ${start.error}`);
  console.log('✅ 游戏开始 (2 真人模拟 + 2 AI, 300 手封顶)');

  let latest: GameState | null = null;
  let done = false;
  let actionsSent = 0;
  let rejected = 0;
  let printedTurn = 0;
  let inflight = false;

  board.on('room:update', (snap: { game: GameState | null }) => {
    latest = snap.game;
    if (!latest) return;
    if (latest.turnCount >= printedTurn + 50) {
      printedTurn = latest.turnCount;
      const alive = latest.players.filter((p) => !p.bankrupt).length;
      console.log(`  … 第 ${latest.turnCount} 手, 存活 ${alive} 人, 阶段 ${latest.phase}`);
    }
    if (latest.phase === 'game-over') {
      done = true;
      return;
    }
    tryHumanAct();
  });

  function tryHumanAct() {
    if (inflight || done || !latest) return;
    const g = latest;
    const actors = new Set(whoMustAct(g));
    if (g.trade) actors.add(g.trade.to);
    const humanId = humans.map((h) => h.id).find((id) => actors.has(id));
    if (!humanId) return;
    const action = decideAction(g, humanId);
    if (!action) return;
    inflight = true;
    sockets.get(humanId)!.emit('game:action', { code, action }, (res: { error?: string }) => {
      inflight = false;
      actionsSent += 1;
      if (res?.error) {
        rejected += 1;
        console.log(`  ⚠️ ${humanId} 的 ${action.type} 被拒: ${res.error}`);
        setTimeout(tryHumanAct, 150);
      }
    });
  }

  const deadline = Date.now() + 240_000;
  while (!done && Date.now() < deadline) {
    await sleep(500);
    tryHumanAct(); // 保险丝: 防止 broadcast 边缘情况漏触发
  }

  if (!done || !latest) {
    console.error(`❌ 超时: 游戏没有在时限内结束 (phase=${latest?.phase}, turn=${latest?.turnCount})`);
    process.exit(1);
  }

  const g: GameState = latest;
  const winner = g.players.find((p) => p.id === g.winner);
  console.log('\n========== 对局结束 ==========');
  console.log(`🏆 胜者: ${winner?.name} | 总手数: ${g.turnCount} | 模拟玩家发送动作: ${actionsSent} (被拒 ${rejected})`);
  for (const p of g.players) {
    const props = Object.values(g.ownership).filter((o) => o.owner === p.id).length;
    console.log(`  ${p.emoji} ${p.name}${p.bankrupt ? ' (破产)' : ''}: 现金 $${p.cash}, 地产 ${props} 块, 净资产 $${p.bankrupt ? 0 : netWorth(g, p.id)}`);
  }
  console.log('最后 5 条日志:');
  for (const line of g.log.slice(-5)) console.log(`  · ${line.text}`);

  const tooManyRejections = rejected > actionsSent * 0.05;
  if (tooManyRejections) {
    console.error('❌ 被拒动作过多, 流程可能有问题');
    process.exit(1);
  }
  console.log('\n✅ E2E 通过: 完整对局在真实 Socket 通道上跑通');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ E2E 失败:', e);
  process.exit(1);
});
