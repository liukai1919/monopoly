import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { JAIL_FINE, getTile, isOwnable, liquidationValue } from '@monopoly/shared';
import type { Action, GameState, Language, TradeSide } from '@monopoly/shared';
import { localizeDeckName, localizeTileInstruction, localizeTileName, tr } from '../i18n';

interface Props {
  game: GameState;
  language: Language;
  meId: string;
  act: (a: Action) => void;
  actionLocked?: boolean;
}

export default function ActionPanel({ game, language, meId, act, actionLocked = false }: Props) {
  const me = game.players.find((p) => p.id === meId)!;
  const isMyTurn = game.currentPlayer === meId;
  const shakeRoll = useShakeToRoll(!actionLocked && game.phase === 'awaiting-roll' && isMyTurn, () => act({ type: 'roll' }));
  const roll = useCallback(async () => {
    await shakeRoll.requestAccess();
    act({ type: 'roll' });
  }, [act, shakeRoll]);

  if (me.bankrupt) {
    return (
      <div className="panel-note">
        💀 {tr(language, '你已破产出局, 泡杯茶看戏吧', 'You are bankrupt and out. Time to watch the table.', 'Vous êtes en faillite et éliminé. Regardez la suite.')}
      </div>
    );
  }

  if (game.phase === 'game-over') {
    const winner = game.players.find((p) => p.id === game.winner);
    return (
      <div className="panel-note">
        🏆 {tr(language, `${winner?.name} 获胜!`, `${winner?.name} wins!`, `${winner?.name} gagne!`)}
        {winner?.id === meId ? tr(language, ' 恭喜你!', ' Congrats!', ' Félicitations!') : ''}
        <p className="home-hint">{tr(language, '在大屏上点「再来一局」', 'Tap "Play Again" on the big screen.', 'Touchez « Rejouer » sur le grand écran.')}</p>
      </div>
    );
  }

  if (actionLocked) {
    return (
      <div className="panel-note">
        🎬 {tr(language, '大屏动画播放中…', 'Big-screen animation playing...', 'Animation du grand écran en cours...')}
        <p className="home-hint">{tr(language, '等棋子走完再继续操作', 'Wait for the pieces to finish moving.', 'Attendez la fin du déplacement.')}</p>
      </div>
    );
  }

  return (
    <div className="action-panel">
      {game.trade?.to === meId && <IncomingTrade game={game} language={language} act={act} />}
      {game.trade?.from === meId && (
        <div className="panel-card">
          <div className="panel-card-title">🤝 {tr(language, '等待对方回应交易…', 'Waiting for trade response...', 'En attente de réponse...')}</div>
          <button className="btn" onClick={() => act({ type: 'cancel-trade' })}>{tr(language, '撤回交易', 'Cancel Trade', 'Annuler l’échange')}</button>
        </div>
      )}

      {game.phase === 'auction' && <AuctionBidder game={game} language={language} meId={meId} act={act} />}
      {game.phase === 'awaiting-debt' && <DebtSection game={game} language={language} meId={meId} act={act} />}
      {game.phase === 'awaiting-card' && <CardDrawSection game={game} language={language} meId={meId} act={act} />}

      {game.phase === 'awaiting-roll' && isMyTurn && (
        me.inJail ? <JailOptions game={game} language={language} meId={meId} act={act} onRoll={roll} /> : (
          <div className="panel-center">
            {game.doublesCount > 0 && <div className="panel-badge">🎉 {tr(language, '双数! 再掷一次', 'Doubles! Roll again', 'Double! Relancez')}</div>}
            <button className="btn btn-roll" onClick={() => void roll()}>
              🎲<br />{tr(language, '掷骰子', 'Roll', 'Lancer')}
            </button>
            <div className={`shake-status shake-status-${shakeRoll.status}`}>
              {shakeRoll.status === 'ready'
                ? tr(language, '摇一摇已就绪', 'Shake-to-roll ready', 'Secouer pour lancer prêt')
                : tr(language, '点一次后可摇一摇', 'Tap once, then shake to roll', 'Touchez une fois, puis secouez')}
            </div>
            <p className="home-hint">
              {tr(language, '掷骰前也可以先去「资产」赎回, 停在自己色组上还能盖房', 'Before rolling, you can unmortgage assets or build if you are on your own color set.', 'Avant de lancer, vous pouvez lever une hypothèque ou construire si vous êtes sur votre groupe.')}
            </p>
          </div>
        )
      )}

      {game.phase === 'awaiting-buy' && isMyTurn && <BuyDecision game={game} language={language} meId={meId} act={act} />}

      {game.phase === 'manage' && isMyTurn && (
        <div className="panel-center">
          <button className="btn btn-primary btn-xl" onClick={() => act({ type: 'end-turn' })}>
            ✅ {tr(language, '结束回合', 'End Turn', 'Fin du tour')}
          </button>
          <p className="home-hint">{tr(language, '结束前可以抵押、交易, 停在自己色组上还能盖房', 'Before ending, you can mortgage, trade, or build on your own color set.', 'Avant de finir, vous pouvez hypothéquer, échanger ou construire sur votre groupe.')}</p>
        </div>
      )}

      {!isMyTurn && (game.phase === 'awaiting-roll' || game.phase === 'awaiting-buy' || game.phase === 'manage') && (
        <div className="panel-note">
          ⏳ {tr(language, '等待其他玩家行动…', 'Waiting for another player...', 'En attente d’un autre joueur...')}
          {game.trade == null && (
            <p className="home-hint">{tr(language, '可以先去「交易」页跟别人谈生意', 'You can visit Trade and make an offer.', 'Vous pouvez aller dans Échange et proposer une offre.')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- 抽牌 ----------------

function CardDrawSection({ game, language, meId, act }: Props) {
  const pending = game.pendingCard;
  if (!pending) return null;
  const player = game.players.find((p) => p.id === pending.playerId);
  const tile = getTile(pending.tileId);
  const deckName = localizeDeckName(pending.deck, language);
  const isMine = pending.playerId === meId;
  const [dragY, setDragY] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const draggedRef = useRef(false);
  const cardKey = `${pending.playerId}:${pending.deck}:${pending.tileId}`;

  useEffect(() => {
    setDragY(0);
    dragYRef.current = 0;
    setDrawing(false);
    startYRef.current = null;
    draggedRef.current = false;
  }, [cardKey]);

  const draw = useCallback(() => {
    if (drawing) return;
    setDrawing(true);
    dragYRef.current = -150;
    setDragY(-150);
    window.setTimeout(() => act({ type: 'draw-card' }), 260);
  }, [act, drawing]);

  if (!isMine) {
    return (
      <div className="panel-note">
        ⏳ {tr(language, `等 ${player?.name} 抽${deckName}卡…`, `Waiting for ${player?.name} to draw ${deckName}...`, `En attente de ${player?.name} pour piocher ${deckName}...`)}
        <p className="home-hint">{localizeTileInstruction(tile, language)}</p>
      </div>
    );
  }

  return (
      <div className={`panel-card card-draw-panel card-draw-${pending.deck}`}>
      <div className="card-draw-deck">{pending.deck === 'chance' ? '❓' : '🎁'} {deckName}</div>
      <div className="panel-card-title">{tr(language, `你来到了 ${localizeTileName(tile, language)}`, `You landed on ${localizeTileName(tile, language)}`, `Vous arrivez sur ${localizeTileName(tile, language)}`)}</div>
      <p className="home-hint">{localizeTileInstruction(tile, language)}</p>
      <div className={`phone-card-reveal phone-card-reveal-${pending.deck} ${drawing ? 'revealing' : ''}`}>
        <div className="phone-card-slot" aria-hidden="true" />
        <button
          type="button"
          className="phone-card-back"
          style={{
            '--drag-y': `${dragY}px`,
            '--tilt': `${Math.max(-12, dragY / 10)}deg`,
          } as CSSProperties}
          onPointerDown={(event) => {
            if (drawing) return;
            startYRef.current = event.clientY;
            draggedRef.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drawing || startYRef.current == null) return;
            const next = Math.min(0, event.clientY - startYRef.current);
            if (Math.abs(next) > 6) draggedRef.current = true;
            const clamped = Math.max(-170, next);
            dragYRef.current = clamped;
            setDragY(clamped);
          }}
          onPointerUp={() => {
            if (drawing) return;
            if (dragYRef.current <= -58) draw();
            else {
              dragYRef.current = 0;
              setDragY(0);
            }
            startYRef.current = null;
          }}
          onPointerCancel={() => {
            startYRef.current = null;
            dragYRef.current = 0;
            setDragY(0);
          }}
          onClick={() => {
            if (!draggedRef.current) draw();
          }}
        >
          <span className="phone-card-back-icon">{pending.deck === 'chance' ? '❓' : '🎁'}</span>
          <span className="phone-card-back-title">{deckName}</span>
          <span className="phone-card-back-hint">{tr(language, '划开翻牌', 'Swipe to reveal', 'Glissez pour révéler')}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------- 监狱 ----------------

function JailOptions({ game, language, meId, act, onRoll }: Props & { onRoll: () => void }) {
  const me = game.players.find((p) => p.id === meId)!;
  return (
    <div className="panel-card">
      <div className="panel-card-title">
        🚔 {tr(language, `你在监狱里 (第 ${me.jailTurns + 1}/3 回合)`, `You are in jail (turn ${me.jailTurns + 1}/3)`, `Vous êtes en prison (tour ${me.jailTurns + 1}/3)`)}
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary" onClick={onRoll}>
          🎲 {tr(language, '掷骰子碰运气 (双数出狱)', 'Roll for doubles to leave jail', 'Lancez pour faire un double et sortir')}
        </button>
        <button
          className={`btn ${me.cash < JAIL_FINE ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'jail-pay' })}
        >
          💵 {tr(language, `交 $${JAIL_FINE} 保释金`, `Pay $${JAIL_FINE} bail`, `Payer ${JAIL_FINE} $ de caution`)}
        </button>
        <button
          className={`btn ${me.jailCards.length === 0 ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'jail-card' })}
        >
          🎫 {tr(language, `使用出狱卡 (剩 ${me.jailCards.length} 张)`, `Use jail card (${me.jailCards.length} left)`, `Utiliser une carte prison (${me.jailCards.length} restante${me.jailCards.length > 1 ? 's' : ''})`)}
        </button>
      </div>
    </div>
  );
}

type MotionPermission = 'unknown' | 'needs-permission' | 'ready' | 'blocked' | 'unsupported';
type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

function useShakeToRoll(enabled: boolean, onRoll: () => void) {
  const [status, setStatus] = useState<MotionPermission>('unknown');
  const enabledRef = useRef(enabled);
  const onRollRef = useRef(onRoll);
  const lockedRef = useRef(false);
  const lastMagnitudeRef = useRef<number | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) lockedRef.current = false;
  }, [enabled]);

  useEffect(() => {
    onRollRef.current = onRoll;
  }, [onRoll]);

  const requestAccess = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setStatus('unsupported');
      return false;
    }
    const motion = window.DeviceMotionEvent as DeviceMotionEventWithPermission;
    if (typeof motion.requestPermission === 'function') {
      try {
        const result = await motion.requestPermission();
        if (result !== 'granted') {
          setStatus('blocked');
          return false;
        }
      } catch {
        setStatus('blocked');
        return false;
      }
    }
    setStatus('ready');
    return true;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      setStatus('unsupported');
      return;
    }

    const motion = window.DeviceMotionEvent as DeviceMotionEventWithPermission;
    if (typeof motion.requestPermission === 'function' && status !== 'ready') {
      if (status === 'unknown') setStatus('needs-permission');
      return;
    }
    if (status !== 'ready') setStatus('ready');

    const onMotion = (event: DeviceMotionEvent) => {
      if (!enabledRef.current || lockedRef.current) return;
      const acc = event.accelerationIncludingGravity ?? event.acceleration;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const last = lastMagnitudeRef.current ?? magnitude;
      lastMagnitudeRef.current = magnitude;
      const impulse = Math.abs(magnitude - last);
      if (magnitude < 23 && impulse < 13) return;

      lockedRef.current = true;
      onRollRef.current();
      window.setTimeout(() => {
        lockedRef.current = false;
      }, 1700);
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled, status]);

  return { requestAccess, status };
}

// ---------------- 购买决定 ----------------

function BuyDecision({ game, language, meId, act }: Props) {
  const me = game.players.find((p) => p.id === meId)!;
  const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
  if (!tile || !isOwnable(tile)) return null;
  return (
    <div className="panel-card">
      <div className="panel-card-title">
        🏷️ {tr(language, `要买下 ${localizeTileName(tile, language)} 吗?`, `Buy ${localizeTileName(tile, language)}?`, `Acheter ${localizeTileName(tile, language)}?`)}
      </div>
      <div className="buy-info">
        <div>{tr(language, '价格', 'Price', 'Prix')} <b>${tile.price}</b></div>
        {tile.type === 'property' && (
          <div>{tr(language, `基础租金 $${tile.rent[0]} · 酒店租金 $${tile.rent[5]}`, `Base rent $${tile.rent[0]} · hotel rent $${tile.rent[5]}`, `Loyer de base ${tile.rent[0]} $ · hôtel ${tile.rent[5]} $`)}</div>
        )}
        {tile.type === 'railroad' && <div>{tr(language, '租金 $25~$200 (按拥有铁路数翻倍)', 'Rent $25-$200 based on railroads owned', 'Loyer 25 $ à 200 $ selon les chemins de fer possédés')}</div>}
        {tile.type === 'utility' && <div>{tr(language, '租金 = 骰点 ×4 (集齐两家 ×10)', 'Rent = dice total ×4 (×10 if both owned)', 'Loyer = total des dés ×4 (×10 si les deux sont possédés)')}</div>}
        <div>{tr(language, '你的现金', 'Your cash', 'Votre argent')} ${me.cash}</div>
      </div>
      <div className="btn-stack">
        <button
          className={`btn btn-primary ${me.cash < tile.price ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'buy' })}
        >
          💰 {tr(language, `买下 ($${tile.price})`, `Buy ($${tile.price})`, `Acheter (${tile.price} $)`)}
        </button>
        <button className="btn" onClick={() => act({ type: 'decline-buy' })}>
          🔨 {tr(language, '不买, 送去拍卖', 'Decline, send to auction', 'Refuser, envoyer aux enchères')}
        </button>
      </div>
    </div>
  );
}

// ---------------- 拍卖 ----------------

function AuctionBidder({ game, language, meId, act }: Props) {
  const a = game.auction!;
  const me = game.players.find((p) => p.id === meId)!;
  const tile = getTile(a.tileId);
  const myTurn = a.turn === meId;
  const folded = a.folded.includes(meId);
  const [custom, setCustom] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.ceil((a.deadline - now) / 1000));
  const bidder = a.highBidder ? game.players.find((p) => p.id === a.highBidder) : null;

  return (
    <div className="panel-card">
      <div className="panel-card-title">🔨 {tr(language, '拍卖', 'Auction', 'Enchère')} {localizeTileName(tile, language)}</div>
      <div className="buy-info">
        <div>{bidder ? <>{tr(language, '当前最高', 'High bid', 'Meilleure offre')} <b>${a.highBid}</b> ({bidder.name})</> : tr(language, '尚无人出价', 'No bids yet', 'Aucune offre')}</div>
        <div>{tr(language, '你的现金', 'Your cash', 'Votre argent')} ${me.cash} · {tr(language, '倒计时', 'timer', 'temps')} {seconds}s</div>
      </div>
      {folded ? (
        <div className="panel-note">{tr(language, '你已退出这场拍卖', 'You passed on this auction.', 'Vous avez quitté cette enchère.')}</div>
      ) : myTurn ? (
        <>
          <div className="bid-btns">
            {[10, 50, 100].map((inc) => {
              const amount = a.highBid + inc;
              return (
                <button
                  key={inc}
                  className={`btn ${amount > me.cash ? 'btn-dim' : ''}`}
                  onClick={() => act({ type: 'bid', amount })}
                >
                  ${amount}
                </button>
              );
            })}
          </div>
          <div className="bid-custom">
            <input
              className="input"
              type="number"
              placeholder={tr(language, '自定金额', 'Custom amount', 'Montant libre')}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={() => custom && act({ type: 'bid', amount: Number(custom) })}
            >
              {tr(language, '出价', 'Bid', 'Offrir')}
            </button>
          </div>
          <button className="btn btn-danger" onClick={() => act({ type: 'pass-bid' })}>
            🏳️ {tr(language, '退出竞拍', 'Pass', 'Passer')}
          </button>
        </>
      ) : (
        <div className="panel-note">
          {tr(language, `等 ${game.players.find((p) => p.id === a.turn)?.name} 表态…`, `Waiting for ${game.players.find((p) => p.id === a.turn)?.name}...`, `En attente de ${game.players.find((p) => p.id === a.turn)?.name}...`)}
        </div>
      )}
    </div>
  );
}

// ---------------- 债务 ----------------

function DebtSection({ game, language, meId, act }: Props) {
  const debt = game.debts[0]!;
  const me = game.players.find((p) => p.id === meId)!;
  if (debt.debtor !== meId) {
    const debtor = game.players.find((p) => p.id === debt.debtor);
    return <div className="panel-note">⏳ {tr(language, `等 ${debtor?.name} 筹钱还债…`, `Waiting for ${debtor?.name} to raise cash...`, `En attente de ${debtor?.name} pour réunir l’argent...`)}</div>;
  }
  const creditor = debt.creditor ? game.players.find((p) => p.id === debt.creditor) : null;
  const shortfall = debt.amount - me.cash;
  const canGoBankrupt = liquidationValue(game, meId) < debt.amount;
  return (
    <div className="panel-card panel-card-danger">
      <div className="panel-card-title">
        💰 {tr(language, `你需要付 $${debt.amount} 给${creditor ? creditor.name : '银行'}`, `You need to pay ${creditor ? creditor.name : 'the bank'} $${debt.amount}`, `Vous devez payer ${debt.amount} $ à ${creditor ? creditor.name : 'la banque'}`)}
      </div>
      <div className="buy-info">
        <div>{debt.reason}</div>
        <div>{tr(language, '现金', 'Cash', 'Argent')} ${me.cash} · {tr(language, '还差', 'short', 'manque')} <b>${Math.max(0, shortfall)}</b></div>
      </div>
      <p className="home-hint">{tr(language, '去「资产」页抵押地产或卖房筹钱, 凑够会自动付清', 'Use Assets to mortgage property or sell houses; the debt pays automatically once you have enough.', 'Utilisez Actifs pour hypothéquer ou vendre des maisons; la dette sera payée automatiquement.')}</p>
      {canGoBankrupt && (
        <button className="btn btn-danger" onClick={() => act({ type: 'declare-bankruptcy' })}>
          💀 {tr(language, '资不抵债, 宣告破产', 'Declare Bankruptcy', 'Déclarer faillite')}
        </button>
      )}
    </div>
  );
}

// ---------------- 收到交易 ----------------

function IncomingTrade({ game, language, act }: { game: GameState; language: Language; act: (a: Action) => void }) {
  const t = game.trade!;
  const from = game.players.find((p) => p.id === t.from);
  const canRespond = game.phase === 'awaiting-roll' || game.phase === 'manage';
  const side = (s: TradeSide) => {
    const bits: string[] = [];
    if (s.cash > 0) bits.push(`$${s.cash}`);
    bits.push(...s.properties.map((id) => localizeTileName(getTile(id), language)));
    if (s.jailCards > 0) bits.push(`${tr(language, '出狱卡', 'Jail card', 'Carte prison')}×${s.jailCards}`);
    return bits.length ? bits.join(' + ') : tr(language, '(无)', '(none)', '(rien)');
  };
  return (
    <div className="panel-card panel-card-trade">
      <div className="panel-card-title">
        🤝 {tr(language, `${from?.name} 想跟你交易`, `${from?.name} wants to trade`, `${from?.name} veut échanger`)}
      </div>
      <div className="trade-summary">
        <div className="trade-row"><span>{tr(language, '你得到', 'You get', 'Vous recevez')}</span><b>{side(t.give)}</b></div>
        <div className="trade-row"><span>{tr(language, '你付出', 'You give', 'Vous donnez')}</span><b>{side(t.get)}</b></div>
      </div>
      {canRespond ? (
        <div className="btn-stack">
          <button className="btn btn-primary" onClick={() => act({ type: 'respond-trade', accept: true })}>
            ✅ {tr(language, '成交', 'Accept', 'Accepter')}
          </button>
          <button className="btn btn-danger" onClick={() => act({ type: 'respond-trade', accept: false })}>
            ❌ {tr(language, '拒绝', 'Decline', 'Refuser')}
          </button>
        </div>
      ) : (
        <div className="panel-note">{tr(language, '等当前结算完成后可回应', 'You can respond after the current resolution finishes.', 'Vous pourrez répondre après le règlement en cours.')}</div>
      )}
    </div>
  );
}
