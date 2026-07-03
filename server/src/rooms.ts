import type { GameState } from '@monopoly/shared';
import {
  DEFAULT_PLAYER_TOKEN_ID, PLAYER_TOKENS, getPlayerToken, getPlayerTokenByEmoji,
} from '@monopoly/shared';

export interface LobbyPlayer {
  id: string;
  name: string;
  emoji: string;
  tokenId?: string;
  color: string;
  isAi: boolean;
  connected: boolean;
}

export interface Room {
  code: string;
  lobby: LobbyPlayer[];
  game: GameState | null;
  lastActivity: number;
  aiTimer: ReturnType<typeof setTimeout> | null;
  auctionTimer: ReturnType<typeof setTimeout> | null;
}

export const PLAYER_COLORS = ['#E63946', '#2667C9', '#2A9D8F', '#E88C1F', '#9B5DE5', '#D81B7F'];
export const PLAYER_EMOJIS = PLAYER_TOKENS.map((token) => token.emoji);
export const AI_NAMES = ['AI-Maple', 'AI-Loon', 'AI-Moose', 'AI-Aurora'];
export const AI_TOKEN_IDS = ['maple-leaf', 'hockey-loon', 'mountie-moose', 'polar-bear'];
export const AI_EMOJIS = AI_TOKEN_IDS.map((id) => getPlayerToken(id)?.emoji ?? '🤖');

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 12 * 60 * 60 * 1000;

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  let code = '';
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  const room: Room = {
    code,
    lobby: [],
    game: null,
    lastActivity: Date.now(),
    aiTimer: null,
    auctionTimer: null,
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string | undefined): Room | undefined {
  if (!code) return undefined;
  return rooms.get(code.toUpperCase().trim());
}

export function touch(room: Room): void {
  room.lastActivity = Date.now();
}

export function pickEmoji(room: Room, preferred?: string): string {
  const used = new Set(room.lobby.map((p) => p.emoji));
  if (preferred && !used.has(preferred)) return preferred;
  return PLAYER_EMOJIS.find((e) => !used.has(e)) ?? '🎲';
}

export function pickToken(room: Room, preferredTokenId?: string, preferredEmoji?: string) {
  const usedTokenIds = new Set(room.lobby.map((p) => p.tokenId).filter(Boolean));
  const usedEmojis = new Set(room.lobby.map((p) => p.emoji));
  const preferred = getPlayerToken(preferredTokenId)
    ?? getPlayerTokenByEmoji(preferredEmoji)
    ?? getPlayerToken(DEFAULT_PLAYER_TOKEN_ID);
  if (preferred && !usedTokenIds.has(preferred.id) && !usedEmojis.has(preferred.emoji)) return preferred;
  return PLAYER_TOKENS.find((token) => !usedTokenIds.has(token.id) && !usedEmojis.has(token.emoji))
    ?? getPlayerToken(DEFAULT_PLAYER_TOKEN_ID)!;
}

export function sweepRooms(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) {
      if (room.aiTimer) clearTimeout(room.aiTimer);
      if (room.auctionTimer) clearTimeout(room.auctionTimer);
      rooms.delete(code);
    }
  }
}
