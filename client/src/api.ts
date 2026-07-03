import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Action, GameEvent, GameState } from '@monopoly/shared';

export const socket = io();

export interface LobbyPlayer {
  id: string; name: string; emoji: string; color: string; isAi: boolean; connected: boolean;
}

export interface RoomSnapshot {
  code: string;
  lobby: LobbyPlayer[];
  game: GameState | null;
  events: GameEvent[];
}

/** 订阅房间状态; eventsSeq 每次广播自增, 供动画 effect 触发 */
export function useRoom(): { room: RoomSnapshot | null; eventsSeq: number } {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [eventsSeq, setEventsSeq] = useState(0);
  useEffect(() => {
    const handler = (snap: RoomSnapshot) => {
      setRoom(snap);
      setEventsSeq((n) => n + 1);
    };
    socket.on('room:update', handler);
    return () => {
      socket.off('room:update', handler);
    };
  }, []);
  return { room, eventsSeq };
}

/** 手机浏览器在 http://局域网IP 下没有 crypto.randomUUID, 需要兜底 */
function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function myPlayerId(): string {
  let id = localStorage.getItem('monopoly-pid');
  if (!id) {
    id = randomId();
    localStorage.setItem('monopoly-pid', id);
  }
  return id;
}

export function emitAck<T = { ok?: boolean; error?: string; code?: string }>(
  event: string, payload: unknown,
): Promise<T> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res: T) => resolve(res));
  });
}

export async function sendAction(code: string, action: Action): Promise<string | null> {
  const res = await emitAck('game:action', { code, action });
  return res?.error ?? null;
}

export interface LanInfo { ips: string[]; port: number; }

export async function fetchLanInfo(): Promise<LanInfo | null> {
  try {
    const res = await fetch('/api/info');
    return (await res.json()) as LanInfo;
  } catch {
    return null;
  }
}
