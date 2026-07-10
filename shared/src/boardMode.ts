import type { BoardMode } from './types';

export const DEFAULT_GAME_BOARD_MODE: BoardMode = 'classic';
export const DEFAULT_LOBBY_BOARD_MODE: BoardMode = 'living-city';

/** Parse untrusted lobby input without allowing an unknown renderer into game state. */
export function parseBoardMode(value: unknown): BoardMode {
  return value === 'living-city' ? 'living-city' : DEFAULT_GAME_BOARD_MODE;
}
