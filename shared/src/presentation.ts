import type { Action, GameEvent } from './types';

export const PRESENTATION_TIMING_MS = {
  diceRolling: 650,
  diceReveal: 350,
  teleportLead: 250,
  teleportSettle: 450,
  moveStep: 230,
  fastMoveStep: 110,
  moveSettle: 260,
  card: 2600,
  cashTweenStep: 55,
  cashSettle: 240,
  build: 950,
  bankrupt: 2000,
  monopoly: 2200,
  gameOver: 900,
  turnSplash: 1800,
  marketFlash: 3200,
  lockBuffer: 140,
} as const;

const CASH_TWEEN_STEPS = 8;

type EventOf<Type extends GameEvent['type']> = Extract<GameEvent, { type: Type }>;

export type GameEventPresentation =
  | {
    kind: 'dice'; event: EventOf<'dice'>; durationMs: number; rollingMs: number; revealMs: number;
  }
  | {
    kind: 'move'; event: EventOf<'move'>; durationMs: number; teleportLeadMs: number;
    teleportSettleMs: number; stepMs: number; settleMs: number;
  }
  | {
    kind: 'card'; event: EventOf<'card'>; durationMs: number; visibleMs: number;
  }
  | {
    kind: 'cash'; event: EventOf<'cash'>; durationMs: number; tweenSteps: number;
    tweenStepMs: number; settleMs: number;
  }
  | {
    kind: 'build'; event: EventOf<'build'>; durationMs: number; visibleMs: number;
  }
  | {
    kind: 'bankrupt'; event: EventOf<'bankrupt'>; durationMs: number; visibleMs: number;
  }
  | {
    kind: 'monopoly'; event: EventOf<'monopoly'>; durationMs: number; visibleMs: number;
  }
  | {
    kind: 'game-over'; event: EventOf<'game-over'>; durationMs: number; visibleMs: number;
  };

export function actionPresentationLockMs(events: GameEvent[], action: Action): number {
  const total = events.reduce(
    (duration, event) => duration + presentationForGameEvent(event).durationMs,
    0,
  );
  if (total === 0 && action.type === 'end-turn') {
    return Math.max(PRESENTATION_TIMING_MS.turnSplash, PRESENTATION_TIMING_MS.marketFlash)
      + PRESENTATION_TIMING_MS.lockBuffer;
  }
  if (total === 0) return 0;
  return total + PRESENTATION_TIMING_MS.lockBuffer;
}

export function actionBypassesPresentationLock(action: Action): boolean {
  return action.type === 'buy-etf' || action.type === 'sell-etf';
}

export function presentationForGameEvent(event: GameEvent): GameEventPresentation {
  switch (event.type) {
    case 'dice':
      return {
        kind: 'dice',
        event,
        rollingMs: PRESENTATION_TIMING_MS.diceRolling,
        revealMs: PRESENTATION_TIMING_MS.diceReveal,
        durationMs: PRESENTATION_TIMING_MS.diceRolling + PRESENTATION_TIMING_MS.diceReveal,
      };
    case 'move': {
      const stepMs = moveStepMs(event.path.length);
      const durationMs = event.teleport
        ? PRESENTATION_TIMING_MS.teleportLead + PRESENTATION_TIMING_MS.teleportSettle
        : event.path.length * stepMs + PRESENTATION_TIMING_MS.moveSettle;
      return {
        kind: 'move',
        event,
        durationMs,
        teleportLeadMs: PRESENTATION_TIMING_MS.teleportLead,
        teleportSettleMs: PRESENTATION_TIMING_MS.teleportSettle,
        stepMs,
        settleMs: PRESENTATION_TIMING_MS.moveSettle,
      };
    }
    case 'card':
      return { kind: 'card', event, durationMs: PRESENTATION_TIMING_MS.card, visibleMs: PRESENTATION_TIMING_MS.card };
    case 'cash':
      return {
        kind: 'cash',
        event,
        tweenSteps: CASH_TWEEN_STEPS,
        tweenStepMs: PRESENTATION_TIMING_MS.cashTweenStep,
        settleMs: PRESENTATION_TIMING_MS.cashSettle,
        durationMs: CASH_TWEEN_STEPS * PRESENTATION_TIMING_MS.cashTweenStep
          + PRESENTATION_TIMING_MS.cashSettle,
      };
    case 'build':
      return { kind: 'build', event, durationMs: PRESENTATION_TIMING_MS.build, visibleMs: PRESENTATION_TIMING_MS.build };
    case 'bankrupt':
      return {
        kind: 'bankrupt', event, durationMs: PRESENTATION_TIMING_MS.bankrupt, visibleMs: PRESENTATION_TIMING_MS.bankrupt,
      };
    case 'monopoly':
      return {
        kind: 'monopoly', event, durationMs: PRESENTATION_TIMING_MS.monopoly, visibleMs: PRESENTATION_TIMING_MS.monopoly,
      };
    case 'game-over':
      return {
        kind: 'game-over', event, durationMs: PRESENTATION_TIMING_MS.gameOver, visibleMs: PRESENTATION_TIMING_MS.gameOver,
      };
  }
}

function moveStepMs(pathLength: number): number {
  return pathLength > 12 ? PRESENTATION_TIMING_MS.fastMoveStep : PRESENTATION_TIMING_MS.moveStep;
}
