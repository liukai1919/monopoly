/**
 * 演示辅助: 创建/开始房间, 配合浏览器手动体验。
 *   npx tsx scripts/demo.ts create          → 创建房间 + 3 个 AI, 打印房间码
 *   npx tsx scripts/demo.ts start <code>    → 开始该房间的游戏
 */
import { io, type Socket } from 'socket.io-client';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emitAck<T>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

async function main() {
  const [mode, codeArg] = process.argv.slice(2);
  const s = io(BASE);
  await new Promise((r) => s.on('connect', r));

  if (mode === 'create') {
    const { code } = await emitAck<{ code: string }>(s, 'board:create', {});
    s.emit('lobby:add-ai', { code });
    s.emit('lobby:add-ai', { code });
    s.emit('lobby:add-ai', { code });
    await sleep(300);
    console.log(code);
  } else if (mode === 'start' && codeArg) {
    const res = await emitAck<{ ok?: boolean; error?: string }>(s, 'lobby:start', { code: codeArg });
    console.log(res.error ?? 'started');
  } else {
    console.log('用法: demo.ts create | demo.ts start <code>');
  }
  s.disconnect();
  process.exit(0);
}

main();
