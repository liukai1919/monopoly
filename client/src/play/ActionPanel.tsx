import { useEffect, useState } from 'react';
import { JAIL_FINE, getTile, isOwnable, liquidationValue } from '@monopoly/shared';
import type { Action, GameState, TradeSide } from '@monopoly/shared';

interface Props {
  game: GameState;
  meId: string;
  act: (a: Action) => void;
}

export default function ActionPanel({ game, meId, act }: Props) {
  const me = game.players.find((p) => p.id === meId)!;
  const isMyTurn = game.currentPlayer === meId;

  if (me.bankrupt) return <div className="panel-note">💀 你已破产出局, 泡杯茶看戏吧</div>;

  if (game.phase === 'game-over') {
    const winner = game.players.find((p) => p.id === game.winner);
    return (
      <div className="panel-note">
        🏆 {winner?.name} 获胜!{winner?.id === meId ? ' 恭喜你!' : ''}
        <p className="home-hint">在大屏上点「再来一局」</p>
      </div>
    );
  }

  return (
    <div className="action-panel">
      {game.trade?.to === meId && <IncomingTrade game={game} act={act} />}
      {game.trade?.from === meId && (
        <div className="panel-card">
          <div className="panel-card-title">🤝 等待对方回应交易…</div>
          <button className="btn" onClick={() => act({ type: 'cancel-trade' })}>撤回交易</button>
        </div>
      )}

      {game.phase === 'auction' && <AuctionBidder game={game} meId={meId} act={act} />}
      {game.phase === 'awaiting-debt' && <DebtSection game={game} meId={meId} act={act} />}

      {game.phase === 'awaiting-roll' && isMyTurn && (
        me.inJail ? <JailOptions game={game} meId={meId} act={act} /> : (
          <div className="panel-center">
            {game.doublesCount > 0 && <div className="panel-badge">🎉 双数! 再掷一次</div>}
            <button className="btn btn-roll" onClick={() => act({ type: 'roll' })}>
              🎲<br />掷骰子
            </button>
            <p className="home-hint">掷骰前也可以先去「资产」盖房 / 赎回</p>
          </div>
        )
      )}

      {game.phase === 'awaiting-buy' && isMyTurn && <BuyDecision game={game} meId={meId} act={act} />}

      {game.phase === 'manage' && isMyTurn && (
        <div className="panel-center">
          <button className="btn btn-primary btn-xl" onClick={() => act({ type: 'end-turn' })}>
            ✅ 结束回合
          </button>
          <p className="home-hint">结束前可以盖房、抵押、发起交易</p>
        </div>
      )}

      {!isMyTurn && (game.phase === 'awaiting-roll' || game.phase === 'awaiting-buy' || game.phase === 'manage') && (
        <div className="panel-note">
          ⏳ 等待其他玩家行动…
          {game.trade == null && <p className="home-hint">可以先去「交易」页跟别人谈生意</p>}
        </div>
      )}
    </div>
  );
}

// ---------------- 监狱 ----------------

function JailOptions({ game, meId, act }: Props) {
  const me = game.players.find((p) => p.id === meId)!;
  return (
    <div className="panel-card">
      <div className="panel-card-title">🚔 你在监狱里 (第 {me.jailTurns + 1}/3 回合)</div>
      <div className="btn-stack">
        <button className="btn btn-primary" onClick={() => act({ type: 'roll' })}>
          🎲 掷骰子碰运气 (双数出狱)
        </button>
        <button
          className={`btn ${me.cash < JAIL_FINE ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'jail-pay' })}
        >
          💵 交 ${JAIL_FINE} 保释金
        </button>
        <button
          className={`btn ${me.jailCards.length === 0 ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'jail-card' })}
        >
          🎫 使用出狱卡 (剩 {me.jailCards.length} 张)
        </button>
      </div>
    </div>
  );
}

// ---------------- 购买决定 ----------------

function BuyDecision({ game, meId, act }: Props) {
  const me = game.players.find((p) => p.id === meId)!;
  const tile = game.pendingBuyTile != null ? getTile(game.pendingBuyTile) : null;
  if (!tile || !isOwnable(tile)) return null;
  return (
    <div className="panel-card">
      <div className="panel-card-title">🏷️ 要买下 {tile.name} 吗?</div>
      <div className="buy-info">
        <div>价格 <b>${tile.price}</b></div>
        {tile.type === 'property' && <div>基础租金 ${tile.rent[0]} · 酒店租金 ${tile.rent[5]}</div>}
        {tile.type === 'railroad' && <div>租金 $25~$200 (按拥有铁路数翻倍)</div>}
        {tile.type === 'utility' && <div>租金 = 骰点 ×4 (集齐两家 ×10)</div>}
        <div>你的现金 ${me.cash}</div>
      </div>
      <div className="btn-stack">
        <button
          className={`btn btn-primary ${me.cash < tile.price ? 'btn-dim' : ''}`}
          onClick={() => act({ type: 'buy' })}
        >
          💰 买下 (${tile.price})
        </button>
        <button className="btn" onClick={() => act({ type: 'decline-buy' })}>
          🔨 不买, 送去拍卖
        </button>
      </div>
    </div>
  );
}

// ---------------- 拍卖 ----------------

function AuctionBidder({ game, meId, act }: Props) {
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
      <div className="panel-card-title">🔨 拍卖 {tile.name}</div>
      <div className="buy-info">
        <div>{bidder ? <>当前最高 <b>${a.highBid}</b> ({bidder.name})</> : '尚无人出价'}</div>
        <div>你的现金 ${me.cash} · 倒计时 {seconds}s</div>
      </div>
      {folded ? (
        <div className="panel-note">你已退出这场拍卖</div>
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
              placeholder="自定金额"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={() => custom && act({ type: 'bid', amount: Number(custom) })}
            >
              出价
            </button>
          </div>
          <button className="btn btn-danger" onClick={() => act({ type: 'pass-bid' })}>
            🏳️ 退出竞拍
          </button>
        </>
      ) : (
        <div className="panel-note">等 {game.players.find((p) => p.id === a.turn)?.name} 表态…</div>
      )}
    </div>
  );
}

// ---------------- 债务 ----------------

function DebtSection({ game, meId, act }: Props) {
  const debt = game.debts[0]!;
  const me = game.players.find((p) => p.id === meId)!;
  if (debt.debtor !== meId) {
    const debtor = game.players.find((p) => p.id === debt.debtor);
    return <div className="panel-note">⏳ 等 {debtor?.name} 筹钱还债…</div>;
  }
  const creditor = debt.creditor ? game.players.find((p) => p.id === debt.creditor) : null;
  const shortfall = debt.amount - me.cash;
  const canGoBankrupt = liquidationValue(game, meId) < debt.amount;
  return (
    <div className="panel-card panel-card-danger">
      <div className="panel-card-title">💰 你需要付 ${debt.amount} 给{creditor ? creditor.name : '银行'}</div>
      <div className="buy-info">
        <div>{debt.reason}</div>
        <div>现金 ${me.cash} · 还差 <b>${Math.max(0, shortfall)}</b></div>
      </div>
      <p className="home-hint">去「资产」页抵押地产或卖房筹钱, 凑够会自动付清</p>
      {canGoBankrupt && (
        <button className="btn btn-danger" onClick={() => act({ type: 'declare-bankruptcy' })}>
          💀 资不抵债, 宣告破产
        </button>
      )}
    </div>
  );
}

// ---------------- 收到交易 ----------------

function IncomingTrade({ game, act }: { game: GameState; act: (a: Action) => void }) {
  const t = game.trade!;
  const from = game.players.find((p) => p.id === t.from);
  const canRespond = game.phase === 'awaiting-roll' || game.phase === 'manage';
  const side = (s: TradeSide) => {
    const bits: string[] = [];
    if (s.cash > 0) bits.push(`$${s.cash}`);
    bits.push(...s.properties.map((id) => getTile(id).name));
    if (s.jailCards > 0) bits.push(`出狱卡×${s.jailCards}`);
    return bits.length ? bits.join(' + ') : '(无)';
  };
  return (
    <div className="panel-card panel-card-trade">
      <div className="panel-card-title">🤝 {from?.name} 想跟你交易</div>
      <div className="trade-summary">
        <div className="trade-row"><span>你得到</span><b>{side(t.give)}</b></div>
        <div className="trade-row"><span>你付出</span><b>{side(t.get)}</b></div>
      </div>
      {canRespond ? (
        <div className="btn-stack">
          <button className="btn btn-primary" onClick={() => act({ type: 'respond-trade', accept: true })}>
            ✅ 成交
          </button>
          <button className="btn btn-danger" onClick={() => act({ type: 'respond-trade', accept: false })}>
            ❌ 拒绝
          </button>
        </div>
      ) : (
        <div className="panel-note">等当前结算完成后可回应</div>
      )}
    </div>
  );
}
