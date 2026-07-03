import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { GameEvent } from '@monopoly/shared';
import { emitAck, fetchLanInfo, socket, useRoom } from '../api';
import BoardGrid from '../board/BoardGrid';
import CenterStage from '../board/CenterStage';
import Sidebar from '../board/Sidebar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Board() {
  const { code = '' } = useParams();
  const { room, eventsSeq } = useRoom();
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  // 大屏挂载 & 断线重连时 (重新) 认领房间
  useEffect(() => {
    let cancelled = false;
    async function watch() {
      const res = await emitAck('board:watch', { code });
      if (!cancelled && res?.error) setError(res.error);
    }
    watch();
    socket.on('connect', watch);
    return () => {
      cancelled = true;
      socket.off('connect', watch);
    };
  }, [code]);

  // 组装手机扫码地址: http://<局域网IP>:<当前端口>/play/<code>
  useEffect(() => {
    fetchLanInfo().then((info) => {
      const ip = info?.ips[0] ?? window.location.hostname;
      const port = window.location.port || String(info?.port ?? 3000);
      setJoinUrl(`http://${ip}:${port}/play/${code}`);
    });
  }, [code]);

  // ------- 棋子动画: 顺序消费事件队列 -------
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [shownDice, setShownDice] = useState<[number, number] | null>(null);
  const [diceRolling, setDiceRolling] = useState(false);
  const [cardFlash, setCardFlash] = useState<{ deck: string; text: string } | null>(null);
  const queueRef = useRef<GameEvent[]>([]);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!room) return;
    if (room.events.length > 0 && room.game) {
      queueRef.current.push(...room.events);
      // 事件积压过多 (比如 AI 连续快速行动) 就快进: 丢弃旧动画, 直接对齐
      if (queueRef.current.length > 40) {
        queueRef.current.length = 0;
        setPositions(Object.fromEntries(room.game.players.map((p) => [p.id, p.position])));
        setShownDice(room.game.dice);
        setCardFlash(null);
      }
      void pump();
    } else if (room.game && !busyRef.current && queueRef.current.length === 0) {
      // 无动画时直接对齐位置 (刷新 / 中途打开)
      setPositions(Object.fromEntries(room.game.players.map((p) => [p.id, p.position])));
      setShownDice(room.game.dice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsSeq]);

  async function pump() {
    if (busyRef.current) return;
    busyRef.current = true;
    while (queueRef.current.length > 0) {
      const e = queueRef.current.shift()!;
      if (e.type === 'dice') {
        setDiceRolling(true);
        await sleep(650);
        setDiceRolling(false);
        setShownDice(e.dice);
        await sleep(350);
      } else if (e.type === 'move') {
        if (e.teleport) {
          await sleep(250);
          setPositions((p) => ({ ...p, [e.playerId]: e.path[0]! }));
          await sleep(450);
        } else {
          for (const pos of e.path) {
            setPositions((p) => ({ ...p, [e.playerId]: pos }));
            await sleep(e.path.length > 12 ? 70 : 150);
          }
          await sleep(200);
        }
      } else if (e.type === 'card') {
        setCardFlash({ deck: e.deck, text: e.text });
        await sleep(2600);
        setCardFlash(null);
      }
    }
    busyRef.current = false;
  }

  if (error) {
    return (
      <div className="home">
        <div className="home-card">
          <h2>😵 {error}</h2>
          <a className="btn btn-primary" href="/">回首页重新创建</a>
        </div>
      </div>
    );
  }

  if (!room) return <div className="board-loading">连接服务器中…</div>;

  // ---------- 大厅 ----------
  if (!room.game) {
    return <Lobby code={code} joinUrl={joinUrl} room={room} />;
  }

  // ---------- 对局 ----------
  return (
    <div className="board-page">
      <div className="board-area">
        <BoardGrid game={room.game} positions={positions}>
          <CenterStage
            game={room.game}
            code={code}
            shownDice={shownDice}
            diceRolling={diceRolling}
            cardFlash={cardFlash}
          />
        </BoardGrid>
      </div>
      <Sidebar game={room.game} code={code} joinUrl={joinUrl} />
    </div>
  );
}

// ================= 大厅 =================

function Lobby({ code, joinUrl, room }: {
  code: string;
  joinUrl: string;
  room: NonNullable<ReturnType<typeof useRoom>['room']>;
}) {
  const [freeParkingPot, setFreeParkingPot] = useState(false);
  const [maxTurns, setMaxTurns] = useState<number>(0);
  const [startError, setStartError] = useState('');

  async function start() {
    const res = await emitAck('lobby:start', {
      code, freeParkingPot, maxTurns: maxTurns || null,
    });
    if (res?.error) setStartError(res.error);
  }

  return (
    <div className="lobby">
      <h1 className="lobby-title">🍁 大富翁 · 加拿大版</h1>
      <div className="lobby-main">
        <div className="lobby-qr">
          {joinUrl && <QRCodeSVG value={joinUrl} size={220} marginSize={2} />}
          <div className="lobby-code">房间码 <b>{code}</b></div>
          <div className="lobby-url">{joinUrl}</div>
          <div className="lobby-tip">📱 手机扫码加入 (需同一 Wi-Fi)</div>
        </div>

        <div className="lobby-players">
          <h3>玩家 ({room.lobby.length}/6)</h3>
          {room.lobby.length === 0 && <p className="lobby-empty">等待玩家扫码加入…</p>}
          <ul>
            {room.lobby.map((p) => (
              <li key={p.id} className="lobby-player" style={{ borderColor: p.color }}>
                <span className="lobby-player-emoji">{p.emoji}</span>
                <span className="lobby-player-name">{p.name}</span>
                {p.isAi && <span className="tag">AI</span>}
                {!p.isAi && !p.connected && <span className="tag tag-warn">离线</span>}
              </li>
            ))}
          </ul>
          <div className="lobby-ai-btns">
            <button className="btn" onClick={() => socket.emit('lobby:add-ai', { code })}>➕ 添加 AI</button>
            <button className="btn" onClick={() => socket.emit('lobby:remove-ai', { code })}>➖ 移除 AI</button>
          </div>

          <div className="lobby-settings">
            <label>
              <input
                type="checkbox"
                checked={freeParkingPot}
                onChange={(e) => setFreeParkingPot(e.target.checked)}
              />
              免费停车奖池 (房规: 税款入池, 踩中全拿)
            </label>
            <label>
              时长
              <select value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))}>
                <option value={0}>经典 (玩到只剩一人)</option>
                <option value={200}>约 1 小时 (200 手结算)</option>
                <option value={400}>约 2 小时 (400 手结算)</option>
              </select>
            </label>
          </div>

          <button className="btn btn-primary btn-xl" onClick={start} disabled={room.lobby.length < 2}>
            🎲 开始游戏
          </button>
          {startError && <p className="home-error">{startError}</p>}
        </div>
      </div>
    </div>
  );
}
