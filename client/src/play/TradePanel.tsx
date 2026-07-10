import { useState } from 'react';
import { GROUP_COLORS, getTile, isOwnable, playerProperties } from '@monopoly/shared';
import type { Action, GameState, Language } from '@monopoly/shared';
import { localizeTileName, tr } from '../i18n';

export default function TradePanel({ game, language, meId, act }: {
  game: GameState;
  language: Language;
  meId: string;
  act: (a: Action) => void;
}) {
  const me = game.players.find((p) => p.id === meId)!;
  const others = game.players.filter((p) => !p.bankrupt && p.id !== meId);
  const [target, setTarget] = useState<string>(others[0]?.id ?? '');
  const [myCash, setMyCash] = useState('');
  const [theirCash, setTheirCash] = useState('');
  const [myProps, setMyProps] = useState<number[]>([]);
  const [theirProps, setTheirProps] = useState<number[]>([]);
  const [myCards, setMyCards] = useState(0);
  const [theirCards, setTheirCards] = useState(0);

  if (game.trade) {
    const from = game.players.find((p) => p.id === game.trade!.from);
    const to = game.players.find((p) => p.id === game.trade!.to);
    return (
      <div className="panel-note">
        🤝 {tr(language, `${from?.name} → ${to?.name} 的交易正在进行中`, `${from?.name} → ${to?.name} trade in progress`, `${from?.name} → ${to?.name}: échange en cours`)}
        <p className="home-hint">
          {game.trade.to === meId
            ? tr(language, '去「行动」页回应', 'Respond on the Action tab.', 'Répondez dans l’onglet Action.')
            : tr(language, '等这单谈完再发起新交易', 'Wait for this trade to finish before starting another.', 'Attendez la fin de cet échange avant d’en proposer un autre.')}
        </p>
      </div>
    );
  }

  if (me.bankrupt || others.length === 0 || game.phase === 'game-over') {
    return <div className="panel-note">{tr(language, '现在没有可以交易的对象', 'No available trade partners right now.', 'Aucun partenaire d’échange disponible.')}</div>;
  }

  const other = game.players.find((p) => p.id === target);

  function toggle(list: number[], set: (v: number[]) => void, id: number) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function propose() {
    act({
      type: 'propose-trade',
      to: target,
      give: { cash: Number(myCash) || 0, properties: myProps, jailCards: myCards },
      get: { cash: Number(theirCash) || 0, properties: theirProps, jailCards: theirCards },
    });
    setMyCash(''); setTheirCash('');
    setMyProps([]); setTheirProps([]);
    setMyCards(0); setTheirCards(0);
  }

  return (
    <div className="trade-panel">
      <div className="trade-targets">
        {others.map((p) => (
          <button
            key={p.id}
            className={`trade-target ${target === p.id ? 'active' : ''}`}
            style={{ borderColor: p.color }}
            onClick={() => { setTarget(p.id); setTheirProps([]); setTheirCards(0); }}
          >
            {p.emoji} {p.name}
          </button>
        ))}
      </div>

      <TradeSideEditor
        title={tr(language, `我付出 (现金 $${me.cash})`, `I give (cash $${me.cash})`, `Je donne (argent ${me.cash} $)`)}
        game={game}
        language={language}
        ownerId={meId}
        cash={myCash}
        setCash={setMyCash}
        selected={myProps}
        toggleProp={(id) => toggle(myProps, setMyProps, id)}
        cards={myCards}
        setCards={setMyCards}
        maxCards={me.jailCards.length}
      />
      {other && (
        <TradeSideEditor
          title={tr(language, `换取 ${other.name} 的`, `I get from ${other.name}`, `Je reçois de ${other.name}`)}
          game={game}
          language={language}
          ownerId={other.id}
          cash={theirCash}
          setCash={setTheirCash}
          selected={theirProps}
          toggleProp={(id) => toggle(theirProps, setTheirProps, id)}
          cards={theirCards}
          setCards={setTheirCards}
          maxCards={other.jailCards.length}
        />
      )}

      <button className="btn btn-primary btn-xl" onClick={propose}>📨 {tr(language, '发起交易', 'Propose Trade', 'Proposer')}</button>
      <p className="home-hint">{tr(language, '带房子的同色地块要先卖掉房才能交易', 'Color sets with buildings must sell those buildings before trading.', 'Les groupes avec bâtiments doivent les vendre avant un échange.')}</p>
    </div>
  );
}

function TradeSideEditor({
  title, game, language, ownerId, cash, setCash, selected, toggleProp, cards, setCards, maxCards,
}: {
  title: string;
  game: GameState;
  language: Language;
  ownerId: string;
  cash: string;
  setCash: (v: string) => void;
  selected: number[];
  toggleProp: (id: number) => void;
  cards: number;
  setCards: (n: number) => void;
  maxCards: number;
}) {
  const props = playerProperties(game, ownerId).sort((a, b) => a - b);
  return (
    <div className="trade-side">
      <div className="trade-side-title">{title}</div>
      <input
        className="input"
        type="number"
        min={0}
        placeholder={tr(language, '现金 $', 'Cash $', 'Argent $')}
        value={cash}
        onChange={(e) => setCash(e.target.value)}
      />
      <div className="trade-props">
        {props.map((id) => {
          const tile = getTile(id);
          if (!isOwnable(tile)) return null;
          const own = game.ownership[id]!;
          const color = tile.type === 'property' ? GROUP_COLORS[tile.group]
            : tile.type === 'railroad' ? '#444' : '#7f8c8d';
          return (
            <button
              key={id}
              className={`trade-prop ${selected.includes(id) ? 'active' : ''}`}
              onClick={() => toggleProp(id)}
            >
              <span className="asset-dot" style={{ background: color }} />
              {localizeTileName(tile, language)}{own.mortgaged ? ` (${tr(language, '押', 'mortgaged', 'hyp.')})` : ''}
            </button>
          );
        })}
        {props.length === 0 && <span className="home-hint">{tr(language, '没有地产', 'No properties', 'Aucune propriété')}</span>}
      </div>
      {maxCards > 0 && (
        <div className="trade-cards">
          {tr(language, '出狱卡:', 'Jail cards:', 'Cartes prison:')}
          <button className="btn btn-sm" onClick={() => setCards(Math.max(0, cards - 1))}>−</button>
          <b>{cards}</b>
          <button className="btn btn-sm" onClick={() => setCards(Math.min(maxCards, cards + 1))}>＋</button>
        </div>
      )}
    </div>
  );
}
