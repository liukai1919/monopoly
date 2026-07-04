import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ETF_DEFINITIONS, GROUP_COLORS, GROUP_NAMES, getPlayerToken } from '@monopoly/shared';
import type { DiceStyle, EtfId, GameEvent, GameState } from '@monopoly/shared';
import { emitAck, fetchLanInfo, socket, useRoom } from '../api';
import type { RoomSnapshot } from '../api';
import BoardGrid from '../board/BoardGrid';
import type { MoneyFxItem } from '../board/BoardGrid';
import CenterStage from '../board/CenterStage';
import Sidebar from '../board/Sidebar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MARKET_BREAKING_THRESHOLD_BPS = 300;

export default function Board() {
  const { code = '' } = useParams();
  const { room, eventsSeq } = useRoom();
  const [error, setError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const soundOnRef = useRef(true);
  const playEvent = useBoardSounds(soundOnRef);
  const roomRef = useRef<RoomSnapshot | null>(null);
  useEffect(() => {
    roomRef.current = room;
    soundOnRef.current = room?.game?.settings.soundEnabled ?? true;
  }, [room]);

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
  const [rollingPlayerId, setRollingPlayerId] = useState<string | null>(null);
  const [cardFlash, setCardFlash] = useState<{ deck: string; text: string } | null>(null);
  const [displayCash, setDisplayCash] = useState<Record<string, number>>({});
  const [moneyFx, setMoneyFx] = useState<MoneyFxItem[]>([]);
  const [cashFloats, setCashFloats] = useState<{ id: number; playerId: string; delta: number }[]>([]);
  const [landedFx, setLandedFx] = useState<{ tile: number; id: number } | null>(null);
  const [bankruptFx, setBankruptFx] = useState<{ name: string; emoji: string } | null>(null);
  const [monopolyFx, setMonopolyFx] = useState<{ name: string; groupName: string; color: string } | null>(null);
  const [turnSplash, setTurnSplash] = useState<{
    id: number;
    name: string;
    emoji: string;
    color: string;
    tokenName: string;
    tokenSubtitle: string;
  } | null>(null);
  const [marketFlash, setMarketFlash] = useState<{
    id: number;
    etfId: EtfId;
    deltaCents: number;
    percent: number;
    headline: string;
    driverText: string;
  } | null>(null);
  const queueRef = useRef<GameEvent[]>([]);
  const busyRef = useRef(false);
  const positionsRef = useRef<Record<string, number>>({});
  const cashRef = useRef<Record<string, number>>({});
  const fxIdRef = useRef(0);
  const turnSplashKeyRef = useRef('');
  const marketFlashKeyRef = useRef('');

  useEffect(() => {
    const game = room?.game;
    if (!game || game.phase === 'game-over') return;
    const player = game.players.find((p) => p.id === game.currentPlayer);
    if (!player) return;
    const key = `${game.turnCount}:${game.currentPlayer}`;
    if (key === turnSplashKeyRef.current) return;
    turnSplashKeyRef.current = key;
    const token = getPlayerToken(player.tokenId);
    setTurnSplash({
      id: ++fxIdRef.current,
      name: player.name,
      emoji: player.emoji,
      color: player.color,
      tokenName: token?.name ?? 'Player Token',
      tokenSubtitle: token?.subtitle ?? '加拿大棋子',
    });
    const timer = window.setTimeout(() => setTurnSplash(null), 1800);
    return () => window.clearTimeout(timer);
  }, [room?.game?.currentPlayer, room?.game?.phase, room?.game?.turnCount]);

  useEffect(() => {
    const game = room?.game;
    if (!game || game.phase === 'game-over') return;
    const mover = strongestMarketMover(game);
    if (!mover) return;
    const key = `${game.turnCount}:${mover.etfId}:${mover.priceCents}:${mover.lastPriceCents}`;
    if (key === marketFlashKeyRef.current) return;
    marketFlashKeyRef.current = key;
    const event = [...game.market.recentEvents].reverse().find((item) => item.etfId === mover.etfId)
      ?? game.market.recentEvents.at(-1);
    setMarketFlash({
      id: ++fxIdRef.current,
      etfId: mover.etfId,
      deltaCents: mover.deltaCents,
      percent: mover.percent,
      headline: event?.headline ?? `${ETF_DEFINITIONS[mover.etfId].name} 出现显著波动`,
      driverText: event?.driverText ?? '本轮棋盘经济活动推动市场重估',
    });
    const timer = window.setTimeout(() => setMarketFlash(null), 3200);
    return () => window.clearTimeout(timer);
  }, [room?.game?.market.etfs, room?.game?.phase, room?.game?.turnCount]);

  useEffect(() => {
    if (!room) return;
    if (room.events.length > 0 && room.game) {
      queueRef.current.push(...room.events);
      // 事件积压过多 (比如 AI 连续快速行动) 就快进: 丢弃旧动画, 直接对齐
      if (queueRef.current.length > 40) {
        queueRef.current.length = 0;
        alignWithGame(room.game);
        setRollingPlayerId(null);
        setCardFlash(null);
        setMoneyFx([]);
        setCashFloats([]);
        setLandedFx(null);
        setBankruptFx(null);
        setMonopolyFx(null);
      }
      void pump();
    } else if (room.game && !busyRef.current && queueRef.current.length === 0) {
      // 无动画时直接对齐位置 (刷新 / 中途打开)
      alignWithGame(room.game);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsSeq]);

  /** 位置与现金直接对齐到最新状态 (无动画路径) */
  function alignWithGame(game: GameState) {
    positionsRef.current = Object.fromEntries(game.players.map((p) => [p.id, p.position]));
    cashRef.current = Object.fromEntries(game.players.map((p) => [p.id, p.cash]));
    setPositions(positionsRef.current);
    setDisplayCash(cashRef.current);
    setShownDice(game.dice);
  }

  async function pump() {
    if (busyRef.current) return;
    busyRef.current = true;
    while (queueRef.current.length > 0) {
      const e = queueRef.current.shift()!;
      playEvent(e);
      if (e.type === 'dice') {
        setRollingPlayerId(e.playerId);
        setDiceRolling(true);
        await sleep(650);
        setDiceRolling(false);
        setShownDice(e.dice);
        await sleep(350);
        setRollingPlayerId(null);
      } else if (e.type === 'move') {
        if (e.teleport) {
          await sleep(250);
          movePiece(e.playerId, e.path[0]!);
          await sleep(450);
        } else {
          for (const pos of e.path) {
            movePiece(e.playerId, pos);
            await sleep(e.path.length > 12 ? 70 : 150);
          }
          await sleep(200);
        }
        const dest = e.path[e.path.length - 1];
        if (dest != null) setLandedFx({ tile: dest, id: ++fxIdRef.current });
      } else if (e.type === 'card') {
        setCardFlash({ deck: e.deck, text: e.text });
        await sleep(2600);
        setCardFlash(null);
      } else if (e.type === 'cash') {
        spawnMoneyFx(e);
        await tweenCash(e);
        await sleep(240);
      } else if (e.type === 'bankrupt') {
        const p = findPlayer(e.playerId);
        setBankruptFx({ name: p?.name ?? '玩家', emoji: p?.emoji ?? '💀' });
        await sleep(2000);
        setBankruptFx(null);
      } else if (e.type === 'monopoly') {
        const p = findPlayer(e.playerId);
        setMonopolyFx({ name: p?.name ?? '玩家', groupName: GROUP_NAMES[e.group], color: GROUP_COLORS[e.group] });
        await sleep(2200);
        setMonopolyFx(null);
      }
    }
    busyRef.current = false;
  }

  function findPlayer(id: string) {
    return roomRef.current?.game?.players.find((p) => p.id === id);
  }

  function movePiece(playerId: string, pos: number) {
    positionsRef.current = { ...positionsRef.current, [playerId]: pos };
    setPositions(positionsRef.current);
  }

  /** 棋盘上的飞钱 + 侧边栏浮动增减 */
  function spawnMoneyFx(e: { from: string | null; to: string | null; amount: number }) {
    const id = ++fxIdRef.current;
    const fx: MoneyFxItem = {
      id,
      fromTile: e.from ? positionsRef.current[e.from] ?? null : null,
      toTile: e.to ? positionsRef.current[e.to] ?? null : null,
      amount: e.amount,
    };
    setMoneyFx((list) => [...list, fx]);
    setTimeout(() => setMoneyFx((list) => list.filter((item) => item.id !== id)), 1800);

    const floats = [
      ...(e.from ? [{ id: ++fxIdRef.current, playerId: e.from, delta: -e.amount }] : []),
      ...(e.to ? [{ id: ++fxIdRef.current, playerId: e.to, delta: e.amount }] : []),
    ];
    if (floats.length === 0) return;
    setCashFloats((list) => [...list, ...floats]);
    const ids = new Set(floats.map((f) => f.id));
    setTimeout(() => setCashFloats((list) => list.filter((f) => !ids.has(f.id))), 1500);
  }

  /** 现金数字滚动到位, 与飞钱动画同步 */
  async function tweenCash(e: { from: string | null; to: string | null; amount: number }) {
    const targets: [string, number, number][] = [];
    if (e.from) {
      const cur = cashRef.current[e.from] ?? 0;
      targets.push([e.from, cur, cur - e.amount]);
    }
    if (e.to) {
      const cur = cashRef.current[e.to] ?? 0;
      targets.push([e.to, cur, cur + e.amount]);
    }
    if (targets.length === 0) return;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const next = { ...cashRef.current };
      for (const [pid, fromVal, toVal] of targets) {
        next[pid] = Math.round(fromVal + ((toVal - fromVal) * i) / steps);
      }
      cashRef.current = next;
      setDisplayCash(next);
      await sleep(55);
    }
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
        <BoardGrid
          game={room.game}
          positions={positions}
          rollingPlayerId={rollingPlayerId}
          diceRolling={diceRolling}
          moneyFx={moneyFx}
          landedFx={landedFx}
        >
          <CenterStage
            game={room.game}
            code={code}
            shownDice={shownDice}
            diceRolling={diceRolling}
            rollingPlayerId={rollingPlayerId}
            cardFlash={cardFlash}
          />
        </BoardGrid>
        {bankruptFx && (
          <div className="board-flash bankrupt-flash">
            <div className="bankrupt-stamp">💥 破产</div>
            <div className="board-flash-name">{bankruptFx.emoji} {bankruptFx.name} 出局</div>
          </div>
        )}
        {monopolyFx && (
          <div className="board-flash monopoly-flash">
            <div className="monopoly-band" style={{ background: monopolyFx.color }}>
              🎩 {monopolyFx.name} 垄断了{monopolyFx.groupName}色组!
            </div>
          </div>
        )}
        {turnSplash && (
          <div className="turn-splash" style={{ '--player-color': turnSplash.color } as CSSProperties}>
            <div className="turn-splash-sweep" />
            <div className="turn-splash-content">
              <div className="turn-splash-kicker">NEW TURN</div>
              <div className="turn-splash-avatar">{turnSplash.emoji}</div>
              <div className="turn-splash-player">{turnSplash.name}</div>
              <div className="turn-splash-token">{turnSplash.tokenName} · {turnSplash.tokenSubtitle}</div>
            </div>
          </div>
        )}
        {marketFlash && (
          <div className={`market-breaking ${marketFlash.deltaCents >= 0 ? 'market-breaking-up' : 'market-breaking-down'}`}>
            <div className="market-breaking-label">📺 财经快讯</div>
            <div className="market-breaking-main">
              <span>{marketFlash.etfId}</span>
              <b>
                {marketFlash.deltaCents >= 0 ? '+' : ''}{formatCents(marketFlash.deltaCents)}
                {' '}
                ({marketFlash.percent >= 0 ? '+' : ''}{marketFlash.percent.toFixed(1)}%)
              </b>
            </div>
            <div className="market-breaking-headline">{marketFlash.headline}</div>
            <div className="market-breaking-driver">{marketFlash.driverText}</div>
          </div>
        )}
      </div>
      <Sidebar
        game={room.game}
        code={code}
        joinUrl={joinUrl}
        displayCash={displayCash}
        cashFloats={cashFloats}
      />
    </div>
  );
}

function strongestMarketMover(game: GameState): {
  etfId: EtfId;
  priceCents: number;
  lastPriceCents: number;
  deltaCents: number;
  percent: number;
} | null {
  const movers = (Object.keys(game.market.etfs) as EtfId[])
    .map((etfId) => {
      const etf = game.market.etfs[etfId];
      const deltaCents = etf.priceCents - etf.lastPriceCents;
      const percent = etf.lastPriceCents === 0 ? 0 : (deltaCents / etf.lastPriceCents) * 100;
      return { etfId, priceCents: etf.priceCents, lastPriceCents: etf.lastPriceCents, deltaCents, percent };
    })
    .filter((item) => Math.abs(item.percent) * 100 >= MARKET_BREAKING_THRESHOLD_BPS)
    .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
  return movers[0] ?? null;
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

// ================= 音效 =================

/** 返回 playEvent(e): 由事件泵在消费每个事件时调用, 声音与画面同步 */
function useBoardSounds(enabledRef: MutableRefObject<boolean>): (event: GameEvent) => void {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext(ctxRef);
      void ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return (event: GameEvent) => {
    if (!enabledRef.current) return;
    const ctx = getAudioContext(ctxRef);
    if (!ctx) return;
    switch (event.type) {
      case 'dice': return playDice(ctx);
      case 'move': return playMove(ctx, event.path.length);
      case 'card': return playCard(ctx, event.deck);
      case 'cash': return playCash(ctx, event);
      case 'bankrupt': return playBankrupt(ctx);
      case 'monopoly': return playMonopoly(ctx);
      case 'game-over': return playFanfare(ctx);
    }
  };
}

function getAudioContext(ref: MutableRefObject<AudioContext | null>): AudioContext | null {
  if (ref.current) return ref.current;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  ref.current = new Ctor();
  return ref.current;
}

function beep(ctx: AudioContext, at: number, freq: number, duration: number, volume = 0.08, type: OscillatorType = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

function playDice(ctx: AudioContext) {
  const t = ctx.currentTime;
  [220, 330, 260, 390].forEach((freq, i) => beep(ctx, t + i * 0.06, freq, 0.05, 0.07, 'square'));
}

function playMove(ctx: AudioContext, steps: number) {
  const t = ctx.currentTime;
  const count = Math.min(steps, 12);
  for (let i = 0; i < count; i++) beep(ctx, t + i * 0.045, 520 + i * 12, 0.025, 0.035, 'triangle');
}

function playCard(ctx: AudioContext, deck: 'chance' | 'chest') {
  const t = ctx.currentTime;
  const base = deck === 'chance' ? 620 : 480;
  [base, base * 1.25, base * 1.5].forEach((freq, i) => beep(ctx, t + i * 0.08, freq, 0.12, 0.06));
}

function playFanfare(ctx: AudioContext) {
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((freq, i) => beep(ctx, t + i * 0.12, freq, 0.18, 0.075));
}

/** 收钱: 上行 cha-ching; 纯支出: 下沉双音; 大额附低音震动 */
function playCash(ctx: AudioContext, e: { to: string | null; amount: number }) {
  const t = ctx.currentTime;
  if (e.to) {
    [784, 1046, 1318].forEach((freq, i) => beep(ctx, t + i * 0.05, freq, 0.09, 0.055, 'triangle'));
    beep(ctx, t + 0.17, 1568, 0.16, 0.04);
  } else {
    beep(ctx, t, 392, 0.1, 0.05, 'triangle');
    beep(ctx, t + 0.09, 262, 0.16, 0.05, 'triangle');
  }
  if (e.amount >= 200) beep(ctx, t, 98, 0.32, 0.07, 'sawtooth');
}

function playBankrupt(ctx: AudioContext) {
  const t = ctx.currentTime;
  [392, 311, 233, 156].forEach((freq, i) => beep(ctx, t + i * 0.16, freq, 0.22, 0.07, 'sawtooth'));
}

function playMonopoly(ctx: AudioContext) {
  const t = ctx.currentTime;
  [523, 659, 784].forEach((freq, i) => beep(ctx, t + i * 0.09, freq, 0.12, 0.06, 'square'));
  beep(ctx, t + 0.3, 1046, 0.3, 0.07, 'square');
}

// ================= 大厅 =================

function Lobby({ code, joinUrl, room }: {
  code: string;
  joinUrl: string;
  room: NonNullable<ReturnType<typeof useRoom>['room']>;
}) {
  const [freeParkingPot, setFreeParkingPot] = useState(false);
  const [maxTurns, setMaxTurns] = useState<number>(0);
  const [diceStyle, setDiceStyle] = useState<DiceStyle>('classic');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [startError, setStartError] = useState('');

  async function start() {
    const res = await emitAck('lobby:start', {
      code, freeParkingPot, maxTurns: maxTurns || null, diceStyle, soundEnabled,
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
                {getPlayerToken(p.tokenId) && <span className="lobby-token-name">{getPlayerToken(p.tokenId)?.name}</span>}
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
            <label>
              骰子风格
              <select value={diceStyle} onChange={(e) => setDiceStyle(e.target.value as DiceStyle)}>
                <option value="classic">经典点数</option>
                <option value="maple">枫叶红</option>
                <option value="neon">数字霓虹</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              开启音效
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
