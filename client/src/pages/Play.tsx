import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useParams } from 'react-router-dom';
import { PLAYER_TOKENS, actionBypassesPresentationLock, getPlayerToken, getTile, whoMustAct } from '@monopoly/shared';
import type { Action, GameEvent, GameState, PlayerToken } from '@monopoly/shared';
import { emitAck, myPlayerId, sendAction, socket, useRoom } from '../api';
import ActionPanel from '../play/ActionPanel';
import AssetsPanel from '../play/AssetsPanel';
import GuidePanel from '../play/GuidePanel';
import MarketPanel from '../play/MarketPanel';
import ReportPanel from '../play/ReportPanel';
import TradePanel from '../play/TradePanel';
import {
  localizeMessage, localizeTileName, localizeTokenSubtitle, saveLanguage, storedLanguage, tr, type Language,
} from '../i18n';

export default function Play() {
  const { code = '' } = useParams();
  const { room, eventsSeq } = useRoom();
  const pid = myPlayerId();
  const [name, setName] = useState(localStorage.getItem('monopoly-name') ?? '');
  const [tokenId, setTokenId] = useState(localStorage.getItem('monopoly-token') ?? 'maple-beaver');
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [localLanguage, setLocalLanguage] = useState<Language>(() => storedLanguage());
  const [tab, setTab] = useState<'action' | 'assets' | 'market' | 'trade' | 'guide'>('action');
  const [toast, setToast] = useState('');
  const [cashFlash, setCashFlash] = useState<{ id: number; delta: number } | null>(null);
  const joinedRef = useRef(false);
  const actionLocked = useActionLock(room?.actionLockRemainingMs ?? 0, eventsSeq);
  const language = room?.game?.settings.language ?? room?.language ?? localLanguage;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  useEffect(() => {
    if (!room?.language) return;
    setLocalLanguage(room.language);
    saveLanguage(room.language);
  }, [room?.language]);

  const join = useCallback(async (joinName: string, joinTokenId = tokenId) => {
    const res = await emitAck('player:join', { code, playerId: pid, name: joinName, tokenId: joinTokenId });
    if (res?.error) {
      setJoinError(localizeMessage(res.error, language));
      return false;
    }
    localStorage.setItem('monopoly-name', joinName);
    localStorage.setItem('monopoly-token', joinTokenId);
    localStorage.setItem('monopoly-room', code);
    setJoined(true);
    joinedRef.current = true;
    setJoinError('');
    return true;
  }, [code, language, pid, tokenId]);

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
    if (actionLocked && !actionBypassesPresentationLock(action)) {
      showToast(tr(language, '大屏动画还在播放, 稍等一下', 'The big-screen animation is still playing. Give it a moment.', 'L’animation du grand écran est encore en cours. Un instant.'));
      return;
    }
    const err = await sendAction(code, action);
    if (err) showToast(localizeMessage(err, language));
  }, [actionLocked, code, language, showToast]);

  usePhoneHaptics(room?.game ?? null, room?.events ?? [], eventsSeq, pid, joined);
  usePhoneSounds(room?.game ?? null, room?.events ?? [], eventsSeq, pid, joined);

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
        <h1>🍁 {tr(language, '加入游戏', 'Join Game', 'Rejoindre')}</h1>
        <p className="play-join-code">{tr(language, '房间', 'Room', 'Salle')} {code}</p>
        <input
          className="input input-lg"
          placeholder={tr(language, '你的名字', 'Your name', 'Votre nom')}
          maxLength={12}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && join(name.trim(), tokenId)}
        />
        <TokenPicker selectedId={tokenId} onSelect={setTokenId} language={language} />
        <button
          className="btn btn-primary btn-xl"
          disabled={!name.trim()}
          onClick={() => join(name.trim(), tokenId)}
        >
          {tr(language, '进入房间', 'Enter Room', 'Entrer')}
        </button>
        {joinError && <p className="home-error">{joinError}</p>}
      </div>
    );
  }

  if (!room) return <div className="board-loading">{tr(language, '连接中...', 'Connecting...', 'Connexion...')}</div>;

  const game = room.game;
  const me = game?.players.find((p) => p.id === pid) ?? null;

  if (!game) {
    return (
      <div className="play-join">
        <h1>✓ {tr(language, '已加入', 'Joined', 'Inscrit')}</h1>
        <p className="play-join-code">{tr(language, '房间', 'Room', 'Salle')} {code}</p>
        <div className="play-wait-list">
          {room.lobby.map((p) => {
            const token = getPlayerToken(p.tokenId);
            return (
              <div key={p.id} className="lobby-player" style={{ borderColor: p.color }}>
                <span>{p.emoji}</span>
                <span>{p.name}{p.id === pid ? ` (${tr(language, '我', 'me', 'moi')})` : ''}</span>
                {token && <span className="lobby-token-name">{token.name}</span>}
                {p.isAi && <span className="tag">AI</span>}
              </div>
            );
          })}
        </div>
        <p className="home-hint">
          {tr(language, '等待大屏上点击“开始游戏”。', 'Waiting for the big screen to start the game.', 'En attente du démarrage sur le grand écran.')}
        </p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="play-join">
        <h1>🎭 {tr(language, '本局没有你的座位', 'No seat in this game', 'Pas de place dans cette partie')}</h1>
        <p className="home-hint">
          {tr(language, '这一局开始时你不在房间里，等下一局吧。', 'You were not in the room when this game started. Wait for the next one.', 'Vous n’étiez pas dans la salle au début de cette partie. Attendez la suivante.')}
        </p>
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
            <div className="play-header-pos">
              📍 {localizeTileName(myTile, language)}{me.inJail ? ` (${tr(language, '蹲监狱中', 'in jail', 'en prison')})` : ''}
            </div>
          </div>
        </div>
        <div className="play-header-cash">${me.cash}</div>
      </header>

      <div className="play-status">
        {game.phase === 'game-over'
          ? tr(language, '🏁 游戏结束', '🏁 Game over', '🏁 Partie terminée')
          : game.currentPlayer === pid
            ? tr(language, '🎯 轮到你了!', '🎯 Your turn!', '🎯 À vous!')
            : tr(language, `等待 ${current?.emoji} ${current?.name}...`, `Waiting for ${current?.emoji} ${current?.name}...`, `En attente de ${current?.emoji} ${current?.name}...`)}
      </div>

      <main className="play-main">
        {tab === 'action' && (game.phase === 'game-over'
          ? <ReportPanel game={game} meId={pid} />
          : <ActionPanel game={game} language={language} meId={pid} act={act} actionLocked={actionLocked} />)}
        {tab === 'assets' && <AssetsPanel game={game} language={language} meId={pid} act={act} />}
        {tab === 'market' && <MarketPanel game={game} language={language} meId={pid} act={act} />}
        {tab === 'trade' && <TradePanel game={game} language={language} meId={pid} act={act} />}
        {tab === 'guide' && <GuidePanel game={game} language={language} meId={pid} />}
      </main>

      <nav className="play-tabs">
        <button className={tab === 'action' ? 'active' : ''} onClick={() => setTab('action')}>🎲 {tr(language, '行动', 'Action', 'Action')}</button>
        <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>🏘️ {tr(language, '资产', 'Assets', 'Actifs')}</button>
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>📈 {tr(language, '证券', 'Market', 'Marché')}</button>
        <button className={tab === 'trade' ? 'active' : ''} onClick={() => setTab('trade')}>🤝 {tr(language, '交易', 'Trade', 'Échange')}</button>
        <button className={tab === 'guide' ? 'active' : ''} onClick={() => setTab('guide')}>📖 {tr(language, '讲解', 'Guide', 'Guide')}</button>
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

function useActionLock(lockRemainingMs: number, lockSeq: number): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (lockRemainingMs <= 0) {
      setLocked(false);
      return;
    }
    setLocked(true);
    const timer = window.setTimeout(() => setLocked(false), lockRemainingMs);
    return () => window.clearTimeout(timer);
  }, [lockRemainingMs, lockSeq]);
  return locked;
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
      game.turnCount,
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
  const nav = navigator as unknown as { vibrate?: (value: number | number[]) => boolean };
  nav.vibrate?.(pattern);
}

function usePhoneSounds(
  game: GameState | null,
  events: GameEvent[],
  eventsSeq: number,
  playerId: string,
  enabled: boolean,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const eventsSeqRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      const ctx = getPhoneAudioContext(ctxRef);
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [enabled]);

  useEffect(() => () => clearPhoneSoundTimers(timersRef), []);

  useEffect(() => {
    if (!enabled || !(game?.settings.soundEnabled ?? true)) {
      clearPhoneSoundTimers(timersRef);
      return;
    }
    if (eventsSeq === eventsSeqRef.current) return;
    eventsSeqRef.current = eventsSeq;
    const sounds = events
      .map((event) => phoneSoundForEvent(event, playerId))
      .filter((sound): sound is PhoneSound => !!sound)
      .slice(0, 5);
    if (sounds.length === 0) return;
    const ctx = getPhoneAudioContext(ctxRef);
    if (!ctx) return;
    clearPhoneSoundTimers(timersRef);
    timersRef.current = sounds.map((sound, index) => window.setTimeout(() => {
      if (ctx.state === 'suspended') void ctx.resume();
      playPhoneSound(ctx, sound);
    }, index * 170));
  }, [enabled, events, eventsSeq, game?.settings.soundEnabled, playerId]);
}

function clearPhoneSoundTimers(ref: MutableRefObject<number[]>) {
  ref.current.forEach((timer) => window.clearTimeout(timer));
  ref.current = [];
}

type PhoneSound =
  | { type: 'dice' }
  | { type: 'move'; steps: number }
  | { type: 'card'; deck: 'chance' | 'chest' }
  | { type: 'cash'; receiving: boolean; amount: number }
  | { type: 'build'; building: 'house' | 'hotel' }
  | { type: 'bankrupt' }
  | { type: 'monopoly' }
  | { type: 'fanfare' };

function phoneSoundForEvent(event: GameEvent, playerId: string): PhoneSound | null {
  switch (event.type) {
    case 'dice':
      return event.playerId === playerId ? { type: 'dice' } : null;
    case 'move':
      return event.playerId === playerId ? { type: 'move', steps: event.path.length } : null;
    case 'card':
      return event.playerId === playerId ? { type: 'card', deck: event.deck } : null;
    case 'cash':
      if (event.to === playerId) return { type: 'cash', receiving: true, amount: event.amount };
      if (event.from === playerId) return { type: 'cash', receiving: false, amount: event.amount };
      return null;
    case 'build':
      return event.playerId === playerId ? { type: 'build', building: event.building } : null;
    case 'bankrupt':
      if (event.playerId === playerId) return { type: 'bankrupt' };
      if (event.creditorId === playerId) return { type: 'fanfare' };
      return null;
    case 'monopoly':
      return event.playerId === playerId ? { type: 'monopoly' } : null;
    case 'game-over':
      return event.winner === playerId ? { type: 'fanfare' } : null;
  }
}

function getPhoneAudioContext(ref: MutableRefObject<AudioContext | null>): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ref.current) return ref.current;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  ref.current = new Ctor();
  return ref.current;
}

function phoneBeep(
  ctx: AudioContext,
  at: number,
  freq: number,
  duration: number,
  volume = 0.08,
  type: OscillatorType = 'sine',
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

function playPhoneSound(ctx: AudioContext, sound: PhoneSound) {
  switch (sound.type) {
    case 'dice': return playPhoneDice(ctx);
    case 'move': return playPhoneMove(ctx, sound.steps);
    case 'card': return playPhoneCard(ctx, sound.deck);
    case 'cash': return playPhoneCash(ctx, sound);
    case 'build': return playPhoneBuild(ctx, sound.building);
    case 'bankrupt': return playPhoneBankrupt(ctx);
    case 'monopoly': return playPhoneMonopoly(ctx);
    case 'fanfare': return playPhoneFanfare(ctx);
  }
}

function playPhoneDice(ctx: AudioContext) {
  const t = ctx.currentTime;
  [220, 330, 260, 390].forEach((freq, i) => phoneBeep(ctx, t + i * 0.06, freq, 0.05, 0.052, 'square'));
}

function playPhoneMove(ctx: AudioContext, steps: number) {
  const t = ctx.currentTime;
  const count = Math.min(steps, 10);
  for (let i = 0; i < count; i++) phoneBeep(ctx, t + i * 0.045, 520 + i * 12, 0.025, 0.026, 'triangle');
}

function playPhoneCard(ctx: AudioContext, deck: 'chance' | 'chest') {
  const t = ctx.currentTime;
  const base = deck === 'chance' ? 620 : 480;
  [base, base * 1.25, base * 1.5].forEach((freq, i) => phoneBeep(ctx, t + i * 0.08, freq, 0.12, 0.045));
}

function playPhoneCash(ctx: AudioContext, e: { receiving: boolean; amount: number }) {
  const t = ctx.currentTime;
  if (e.receiving) {
    [784, 1046, 1318].forEach((freq, i) => phoneBeep(ctx, t + i * 0.05, freq, 0.09, 0.043, 'triangle'));
    phoneBeep(ctx, t + 0.17, 1568, 0.16, 0.032);
  } else {
    phoneBeep(ctx, t, 392, 0.1, 0.04, 'triangle');
    phoneBeep(ctx, t + 0.09, 262, 0.16, 0.04, 'triangle');
  }
  if (e.amount >= 200) phoneBeep(ctx, t, 98, 0.32, 0.05, 'sawtooth');
}

function playPhoneBuild(ctx: AudioContext, building: 'house' | 'hotel') {
  const t = ctx.currentTime;
  [330, 420, 560].forEach((freq, i) => phoneBeep(ctx, t + i * 0.07, freq, 0.08, 0.045, 'triangle'));
  if (building === 'hotel') phoneBeep(ctx, t + 0.26, 880, 0.18, 0.055, 'square');
}

function playPhoneBankrupt(ctx: AudioContext) {
  const t = ctx.currentTime;
  [392, 311, 233, 156].forEach((freq, i) => phoneBeep(ctx, t + i * 0.16, freq, 0.22, 0.055, 'sawtooth'));
}

function playPhoneMonopoly(ctx: AudioContext) {
  const t = ctx.currentTime;
  [523, 659, 784].forEach((freq, i) => phoneBeep(ctx, t + i * 0.09, freq, 0.12, 0.048, 'square'));
  phoneBeep(ctx, t + 0.3, 1046, 0.3, 0.055, 'square');
}

function playPhoneFanfare(ctx: AudioContext) {
  const t = ctx.currentTime;
  [523, 659, 784, 1046].forEach((freq, i) => phoneBeep(ctx, t + i * 0.12, freq, 0.18, 0.056));
}

function TokenPicker({ selectedId, onSelect, language }: {
  selectedId: string;
  onSelect: (id: string) => void;
  language: Language;
}) {
  const historical = PLAYER_TOKENS.filter((token) => token.category === 'historical');
  const mascots = PLAYER_TOKENS.filter((token) => token.category === 'mascot');
  return (
    <div className="token-picker">
      <div className="token-picker-title">{tr(language, '选择棋子', 'Choose a token', 'Choisir un pion')}</div>
      <TokenGroup
        title={tr(language, '历史人物', 'Historical Figures', 'Personnages historiques')}
        tokens={historical}
        selectedId={selectedId}
        onSelect={onSelect}
        language={language}
      />
      <TokenGroup
        title={tr(language, '加拿大吉祥物', 'Canadian Mascots', 'Mascottes canadiennes')}
        tokens={mascots}
        selectedId={selectedId}
        onSelect={onSelect}
        language={language}
      />
    </div>
  );
}

function TokenGroup({ title, tokens, selectedId, onSelect, language }: {
  title: string;
  tokens: PlayerToken[];
  selectedId: string;
  onSelect: (id: string) => void;
  language: Language;
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
            title={`${token.name} - ${localizeTokenSubtitle(token, language)}`}
          >
            <span className="token-choice-emoji">{token.emoji}</span>
            <span className="token-choice-name">{token.name}</span>
            <span className="token-choice-subtitle">{localizeTokenSubtitle(token, language)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
