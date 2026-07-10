import type { GameState, Language } from '@monopoly/shared';
import BoardGrid from './BoardGrid';
import type { ConstructionFxItem, MoneyFxItem } from './BoardLayers';
import CenterStage from './CenterStage';
import LivingCityBoard from './LivingCityBoard';
import './livingCity.css';

export type { ConstructionFxItem, MoneyFxItem } from './BoardLayers';

export interface BoardPresentationState {
  positions: Record<string, number>;
  shownDice: [number, number] | null;
  diceRolling: boolean;
  rollingPlayerId: string | null;
  cardFlash: { deck: string; text: string } | null;
  deedCard: { tileId: number; id: number } | null;
  moneyFx: MoneyFxItem[];
  constructionFx: ConstructionFxItem[];
  landedFx: { tile: number; id: number } | null;
}

/**
 * 棋盘体验的唯一外部 interface。页面不需要知道两个 adapter 的 geometry 或结构。
 */
export default function BoardExperience({
  game, language, code, presentation,
}: {
  game: GameState;
  language: Language;
  code: string;
  presentation: BoardPresentationState;
}) {
  const stage = (
    <CenterStage
      game={game}
      language={language}
      code={code}
      shownDice={presentation.shownDice}
      diceRolling={presentation.diceRolling}
      rollingPlayerId={presentation.rollingPlayerId}
      cardFlash={presentation.cardFlash}
      deedCard={presentation.deedCard}
    />
  );
  const boardProps = {
    game,
    language,
    positions: presentation.positions,
    rollingPlayerId: presentation.rollingPlayerId,
    diceRolling: presentation.diceRolling,
    moneyFx: presentation.moneyFx,
    constructionFx: presentation.constructionFx,
    landedFx: presentation.landedFx,
    children: stage,
  };

  return game.settings.boardMode === 'living-city'
    ? <LivingCityBoard {...boardProps} />
    : <BoardGrid {...boardProps} />;
}
