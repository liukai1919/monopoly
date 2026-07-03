import { useState } from 'react';
import { GROUP_COLORS, getTile, isOwnable, playerProperties } from '@monopoly/shared';
import type { Action, GameState } from '@monopoly/shared';

export default function TradePanel({ game, meId, act }: {
  game: GameState;
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
        🤝 {from?.name} → {to?.name} 的交易正在进行中
        <p className="home-hint">{game.trade.to === meId ? '去「行动」页回应' : '等这单谈完再发起新交易'}</p>
      </div>
    );
  }

  if (me.bankrupt || others.length === 0 || game.phase === 'game-over') {
    return <div className="panel-note">现在没有可以交易的对象</div>;
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
        title={`我付出 (现金 $${me.cash})`}
        game={game}
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
          title={`换取 ${other.name} 的`}
          game={game}
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

      <button className="btn btn-primary btn-xl" onClick={propose}>📨 发起交易</button>
      <p className="home-hint">带房子的同色地块要先卖掉房才能交易</p>
    </div>
  );
}

function TradeSideEditor({ title, game, ownerId, cash, setCash, selected, toggleProp, cards, setCards, maxCards }: {
  title: string;
  game: GameState;
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
        placeholder="现金 $"
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
              {tile.name}{own.mortgaged ? ' (押)' : ''}
            </button>
          );
        })}
        {props.length === 0 && <span className="home-hint">没有地产</span>}
      </div>
      {maxCards > 0 && (
        <div className="trade-cards">
          出狱卡:
          <button className="btn btn-sm" onClick={() => setCards(Math.max(0, cards - 1))}>−</button>
          <b>{cards}</b>
          <button className="btn btn-sm" onClick={() => setCards(Math.min(maxCards, cards + 1))}>＋</button>
        </div>
      )}
    </div>
  );
}
