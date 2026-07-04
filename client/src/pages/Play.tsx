import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PLAYER_TOKENS, getPlayerToken, getTile, whoMustAct } from '@monopoly/shared';
import type { Action, GameEvent, GameState, PlayerToken } from '@monopoly/shared';
import { emitAck, myPlayerId, sendAction, socket, useRoom } from '../api';
import ActionPanel from '../play/ActionPanel';
import AssetsPanel from '../play/AssetsPanel';
import GuidePanel from '../play/GuidePanel';
import MarketPanel from '../play/MarketPanel';
import TradePanel from '../play/TradePanel';

export default function Play() {
  const { code = '' } = useParams();
  const { room, eventsSeq } = useRoom();
  const pid = myPlayerId();
  const [name, setName] = useState(localStorage.getItem('monopoly-name') ?? '');
  const [tokenId, setTokenId] = useState(localStorage.getItem('monopoly-token') ?? 'maple-beaver');
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [tab, setTab] = useState<'action' | 'assets' | 'market' | 'trade' | 'guide'>('action');
  const [toast, setToast] = useState('');
  const [cashFlash, setCashFlash] = useState<{ id: number; delta: number } | null>(null);
  const joinedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const join = useCallback(async (joinName: string, joinTokenId = tokenId) => {
    const res = await emitAck('player:join', { code, playerId: pid, name: joinName, tokenId: joinTokenId });
    if (res?.error) {
      setJoinError(res.error);
      return false;
    }
    localStorage.setItem('monopoly-name', joinName);
    localStorage.setItem('monopoly-token', joinTokenId);
    localStorage.setItem('monopoly-room', code);
    setJoined(true);
    joinedRef.current = true;
    setJoinError('');
    return true;
  }, [code, pid, tokenId]);

  useEffect(() => {
    const savedName = localStorage.getItem('monopoly-name') ?? '';
    const savedToken = localStorage.getItem('monopoly-token') ?? tokenId;
    if (localStorage.getItem('monopoly-room') === code && savedName) {
      void join(savedName, savedToken);
    }
    const onConnect = () => {
      if (joinedRef.current) {
        void join(localStorage.getItem('monopoly-name') ?? '', localStorage.getItem('monopoly-token') ?? savedToken);
      }
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [code, join, tokenId]);

  const act = useCallback(async (action: Action) => {
    const err = await sendAction(code, action);
    if (err) showToast(err);
  }, [code, showToast]);

  usePhoneHaptics(room?.game ?? null, room?.events ?? [], eventsSeq, pid, joined);

  useEffect(() => {
    if (!joined || !room?.events.length) return;
    let delta = 0;
    for (const event of room.events) {
      if (event.type !== 'cash') continue;
      if (event.to === pid) delta += event.amount;
      if (event.from === pid) delta -= event.amount;
    }
    if (delta === 0) return;
    setCashFlash({ id: eventsSeq, delta });
    const timer = window.setTimeout(() => setCashFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [eventsSeq, joined, pid, room?.events]);

  if (!joined) {
    return (
      <div className="play-join">
        <h1>🍁 加入游戏</h1>
        <p className="play-join-code">房间 {code}</p>
        <input
          className="input input-lg"
          placeholder="你的名字"
          maxLength={12}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && join(name.trim(), tokenId)}
        />
        <TokenPicker selectedId={tokenId} onSelect={setTokenId} />
        <button
          className="btn btn-primary btn-xl"
          disabled={!name.trim()}
          onClick={() => join(name.trim(), tokenId)}
        >
          进入房间
        </button>
        {joinError && <p className="home-error">{joinError}</p>}
      </div>
    );
  }

  if (!room) return <div className="board-loading">连接中...</div>;

  const game = room.game;
  const me = game?.players.find((p) => p.id === pid) ?? null;

  if (!game) {
    return (
      <div className="play-join">
        <h1>✓ 已加入</h1>
        <p className="play-join-code">房间 {code}</p>
        <div className="play-wait-list">
          {room.lobby.map((p) => {
            const token = getPlayerToken(p.tokenId);
            return (
              <div key={p.id} className="lobby-player" style={{ borderColor: p.color }}>
                <span>{p.emoji}</span>
                <span>{p.name}{p.id === pid ? ' (我)' : ''}</span>
                {token && <span className="lobby-token-name">{token.name}</span>}
                {p.isAi && <span className="tag">AI</span>}
              </div>
            );
          })}
        </div>
        <p className="home-hint">等待大屏上点击“开始游戏”。</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="play-join">
        <h1>🎭 本局没有你的座位</h1>
        <p className="home-hint">这一局开始时你不在房间里，等下一局吧。</p>
      </div>
    );
  }

  const current = game.players.find((p) => p.id === game.currentPlayer);
  const myTile = getTile(me.position);
  const myToken = getPlayerToken(me.tokenId);

  return (
    <div className="play" style={{ borderTopColor: me.color }}>
      <header className="play-header" style={{ background: `linear-gradient(135deg, ${me.color}cc, ${me.color}66)` }}>
        <div className="play-header-id">
          <span className="play-header-emoji">{me.emoji}</span>
          <div>
            <div className="play-header-name">{me.name}</div>
            {myToken && <div className="play-header-token">{myToken.name}</div>}
            <div className="play-header-pos">📍 {myTile.name}{me.inJail ? ' (蹲监狱中)' : ''}</div>
          </div>
        </div>
        <div className="play-header-cash">${me.cash}</div>
      </header>

      <div className="play-status">
        {game.phase === 'game-over'
          ? '🏁 游戏结束'
          : game.currentPlayer === pid
            ? '🎯 轮到你了!'
            : `等待 ${current?.emoji} ${current?.name}...`}
      </div>

      <main className="play-main">
        {tab === 'action' && <ActionPanel game={game} meId={pid} act={act} />}
        {tab === 'assets' && <AssetsPanel game={game} meId={pid} act={act} />}
        {tab === 'market' && <MarketPanel game={game} meId={pid} act={act} />}
        {tab === 'trade' && <TradePanel game={game} meId={pid} act={act} />}
        {tab === 'guide' && <GuidePanel game={game} meId={pid} />}
      </main>

      <nav className="play-tabs">
        <button className={tab === 'action' ? 'active' : ''} onClick={() => setTab('action')}>🎲 行动</button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>🏘️ 资产</button>
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>📈 证券</button>
        <button className={tab === 'trade' ? 'active' : ''} onClick={() => setTab('trade')}>🤝 交易</button>
        <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>📖 讲解</button>
      </nav>

      {cashFlash && (
        <div
          key={cashFlash.id}
          className={`phone-cash-flash ${cashFlash.delta > 0 ? 'phone-cash-flash-up' : 'phone-cash-flash-down'}`}
        >
          <span>{cashFlash.delta > 0 ? '+' : '-'}${Math.abs(cashFlash.delta)}</span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function usePhoneHaptics(
  game: GameState | null,
  events: GameEvent[],
  eventsSeq: number,
  playerId: string,
  enabled: boolean,
) {
  const actionKeyRef = useRef('');
  const eventsSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled || !game) return;
    const actors = new Set(whoMustAct(game));
    if (game.trade) actors.add(game.trade.to);
    const mustAct = actors.has(playerId);
    if (!mustAct) {
      actionKeyRef.current = '';
      return;
    }

    const actionKey = [
      game.turn,
      game.phase,
      game.currentPlayer,
      game.auction?.turn ?? '',
      game.pendingCard?.playerId ?? '',
      game.debts[0]?.debtor ?? '',
      game.trade?.to ?? '',
    ].join(':');
    if (actionKey === actionKeyRef.current) return;
    actionKeyRef.current = actionKey;

    if (game.phase === 'auction' && game.auction?.turn === playerId) {
      vibrate([45, 40, 45]);
    } else {
      vibrate(55);
    }
  }, [enabled, game, playerId]);

  useEffect(() => {
    if (!enabled || eventsSeq === eventsSeqRef.current) return;
    eventsSeqRef.current = eventsSeq;
    const paidAnotherPlayer = events.some(
      (event) => event.type === 'cash' && event.from === playerId && !!event.to && event.to !== playerId,
    );
    if (paidAnotherPlayer) vibrate([70, 35, 100]);
  }, [enabled, events, eventsSeq, playerId]);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined') return;
  const maybeVibrate = (navigator as Navigator & { vibrate?: (value: number | number[]) => boolean }).vibrate;
  if (maybeVibrate) maybeVibrate.call(navigator, pattern);
}

function TokenPicker({ selectedId, onSelect }: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const historical = PLAYER_TOKENS.filter((token) => token.category === 'historical');
  const mascots = PLAYER_TOKENS.filter((token) => token.category === 'mascot');
  return (
    <div className="token-picker">
      <div className="token-picker-title">选择棋子</div>
      <TokenGroup title="历史人物" tokens={historical} selectedId={selectedId} onSelect={onSelect} />
      <TokenGroup title="加拿大吉祥物" tokens={mascots} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}

function TokenGroup({ title, tokens, selectedId, onSelect }: {
  title: string;
  tokens: PlayerToken[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="token-group">
      <div className="token-group-title">{title}</div>
      <div className="token-grid">
        {tokens.map((token) => (
          <button
            key={token.id}
            type="button"
            className={`token-choice ${selectedId === token.id ? 'selected' : ''}`}
            onClick={() => onSelect(token.id)}
            title={`${token.name} - ${token.subtitle}`}
          >
            <span className="token-choice-emoji">{token.emoji}</span>
            <span className="token-choice-name">{token.name}</span>
            <span className="token-choice-subtitle">{token.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
