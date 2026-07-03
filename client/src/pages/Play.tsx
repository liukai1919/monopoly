import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTile } from '@monopoly/shared';
import type { Action } from '@monopoly/shared';
import { emitAck, myPlayerId, sendAction, socket, useRoom } from '../api';
import ActionPanel from '../play/ActionPanel';
import AssetsPanel from '../play/AssetsPanel';
import GuidePanel from '../play/GuidePanel';
import TradePanel from '../play/TradePanel';

export default function Play() {
  const { code = '' } = useParams();
  const { room } = useRoom();
  const pid = myPlayerId();
  const [name, setName] = useState(localStorage.getItem('monopoly-name') ?? '');
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [tab, setTab] = useState<'action' | 'assets' | 'trade' | 'guide'>('action');
  const [toast, setToast] = useState('');
  const joinedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const join = useCallback(async (joinName: string) => {
    const res = await emitAck('player:join', { code, playerId: pid, name: joinName });
    if (res?.error) {
      setJoinError(res.error);
      return false;
    }
    localStorage.setItem('monopoly-name', joinName);
    localStorage.setItem('monopoly-room', code);
    setJoined(true);
    joinedRef.current = true;
    setJoinError('');
    return true;
  }, [code, pid]);

  // 之前进过这个房间 → 静默重连; socket 重连后也自动补一次 join
  useEffect(() => {
    const savedName = localStorage.getItem('monopoly-name') ?? '';
    if (localStorage.getItem('monopoly-room') === code && savedName) {
      void join(savedName);
    }
    const onConnect = () => {
      if (joinedRef.current) void join(localStorage.getItem('monopoly-name') ?? '');
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [code, join]);

  const act = useCallback(async (action: Action) => {
    const err = await sendAction(code, action);
    if (err) showToast(err);
  }, [code, showToast]);

  // ---------- 未加入: 起名页 ----------
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
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && join(name.trim())}
        />
        <button
          className="btn btn-primary btn-xl"
          disabled={!name.trim()}
          onClick={() => join(name.trim())}
        >
          进入房间
        </button>
        {joinError && <p className="home-error">{joinError}</p>}
      </div>
    );
  }

  if (!room) return <div className="board-loading">连接中…</div>;

  const game = room.game;
  const me = game?.players.find((p) => p.id === pid) ?? null;

  // ---------- 大厅等待 ----------
  if (!game) {
    return (
      <div className="play-join">
        <h1>✅ 已加入</h1>
        <p className="play-join-code">房间 {code}</p>
        <div className="play-wait-list">
          {room.lobby.map((p) => (
            <div key={p.id} className="lobby-player" style={{ borderColor: p.color }}>
              <span>{p.emoji}</span>
              <span>{p.name}{p.id === pid ? ' (我)' : ''}</span>
              {p.isAi && <span className="tag">AI</span>}
            </div>
          ))}
        </div>
        <p className="home-hint">等待大屏上点击「开始游戏」…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="play-join">
        <h1>😔 本局没有你的座位</h1>
        <p className="home-hint">这一局开始时你不在房间里, 等下一局吧</p>
      </div>
    );
  }

  const current = game.players.find((p) => p.id === game.currentPlayer);
  const myTile = getTile(me.position);

  return (
    <div className="play" style={{ borderTopColor: me.color }}>
      <header className="play-header" style={{ background: `linear-gradient(135deg, ${me.color}cc, ${me.color}66)` }}>
        <div className="play-header-id">
          <span className="play-header-emoji">{me.emoji}</span>
          <div>
            <div className="play-header-name">{me.name}</div>
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
            : `等待 ${current?.emoji} ${current?.name}…`}
      </div>

      <main className="play-main">
        {tab === 'action' && <ActionPanel game={game} meId={pid} act={act} />}
        {tab === 'assets' && <AssetsPanel game={game} meId={pid} act={act} />}
        {tab === 'trade' && <TradePanel game={game} meId={pid} act={act} />}
        {tab === 'guide' && <GuidePanel game={game} meId={pid} />}
      </main>

      <nav className="play-tabs">
        <button className={tab === 'action' ? 'active' : ''} onClick={() => setTab('action')}>🎲 行动</button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>🏠 资产</button>
        <button className={tab === 'trade' ? 'active' : ''} onClick={() => setTab('trade')}>🤝 交易</button>
        <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>📘 讲解</button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
