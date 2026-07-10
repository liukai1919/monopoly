import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { buildSettlementReport, getPlayerToken } from '@monopoly/shared';
import type { GameState, PlayerState, SettlementReport } from '@monopoly/shared';
import { socket } from '../api';

/** 终局结算全屏画面: 排名 + 净资产走势 + 收租排行 + 证券盈亏 + 趣味之最 */
export default function SettlementScreen({ game, code }: { game: GameState; code: string }) {
  const report = useMemo(() => buildSettlementReport(game), [game]);
  const winner = game.players.find((p) => p.id === game.winner);
  const token = getPlayerToken(winner?.tokenId);
  const rounds = Math.max(0, (game.stats?.netWorthHistory.length ?? 1) - 1);

  return (
    <div className="settlement-overlay">
      <Confetti />
      <div className="settlement-header">
        <div className="settlement-winner">
          <span className="settlement-winner-emoji">{winner?.emoji}</span>
          <div>
            <h2>🏆 {winner?.name} 获胜!</h2>
            <div className="settlement-winner-sub">
              {token && <>{token.name} · {token.subtitle} · </>}
              全局 {game.turnCount} 手 / {rounds} 轮
            </div>
          </div>
        </div>
        <button className="btn btn-primary btn-xl" onClick={() => socket.emit('lobby:reset', { code })}>
          🔁 再来一局
        </button>
      </div>

      <div className="settlement-grid">
        <div className="settlement-col">
          <RankingTable game={game} report={report} />
          <NetWorthChart game={game} />
        </div>
        <div className="settlement-col">
          <RentLeaderboard game={game} report={report} />
          <EtfPnlPanel game={game} report={report} />
          <SuperlativeGrid game={game} report={report} />
        </div>
      </div>
    </div>
  );
}

/** 线尾标签防重叠: 按 y 排序后保证最小间距, 并夹在绘图区内 */
function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  const order = ys.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const placed = order.map(({ v }) => v);
  for (let k = 1; k < placed.length; k++) {
    placed[k] = Math.max(placed[k]!, placed[k - 1]! + minGap);
  }
  const shift = Math.max(0, (placed.at(-1) ?? lo) - hi);
  for (let k = 0; k < placed.length; k++) placed[k]! -= shift;
  placed[0] = Math.max(placed[0] ?? lo, lo);
  for (let k = 1; k < placed.length; k++) {
    placed[k] = Math.max(placed[k]!, placed[k - 1]! + minGap);
  }
  const out = new Array<number>(ys.length);
  order.forEach(({ i }, k) => { out[i] = placed[k]!; });
  return out;
}

function usd(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-CA')}`;
}

function findPlayer(game: GameState, id: string): PlayerState | undefined {
  return game.players.find((p) => p.id === id);
}

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function RankingTable({ game, report }: { game: GameState; report: SettlementReport }) {
  return (
    <section className="settlement-panel">
      <h3>最终排名</h3>
      <table className="settlement-table">
        <thead>
          <tr>
            <th></th><th className="settlement-th-name">玩家</th>
            <th>净资产</th><th>现金</th><th>地产</th><th>建筑</th><th>证券</th>
          </tr>
        </thead>
        <tbody>
          {report.ranking.map((r) => {
            const p = findPlayer(game, r.playerId);
            return (
              <tr key={r.playerId} className={r.bankrupt ? 'settlement-row-bankrupt' : ''}>
                <td className="settlement-rank">{RANK_MEDALS[r.rank - 1] ?? r.rank}</td>
                <td className="settlement-th-name">
                  <span className="asset-dot" style={{ background: p?.color }} />
                  {p?.emoji} {p?.name}
                  {r.bankrupt && <span className="tag tag-warn">💥 破产</span>}
                </td>
                <td className="settlement-total">{usd(r.breakdown.total)}</td>
                <td>{usd(r.breakdown.cash)}</td>
                <td>{usd(r.breakdown.propertyValue)}</td>
                <td>{usd(r.breakdown.buildingValue)}</td>
                <td>{usd(r.breakdown.etfValue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** 每轮净资产走势, 手写 SVG 折线图 */
function NetWorthChart({ game }: { game: GameState }) {
  const history = game.stats?.netWorthHistory ?? [];
  const [hover, setHover] = useState<number | null>(null);
  if (history.length === 0) return null;

  const W = 640;
  const H = 264;
  const padL = 58;
  const padR = 86;
  const padT = 12;
  const padB = 24;
  const lastRound = history.length - 1;
  const maxV = Math.max(1, ...history.flat());

  // 超长对局降采样, 恒保留首末两轮
  const step = Math.max(1, Math.ceil(history.length / 120));
  const rounds: number[] = [];
  for (let i = 0; i < history.length; i += step) rounds.push(i);
  if (rounds.at(-1) !== lastRound) rounds.push(lastRound);

  const x = (round: number) => padL + (lastRound === 0 ? 0.5 : round / lastRound) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.round((maxV * f) / 100) * 100);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const round = Math.round(((fx - padL) / (W - padL - padR)) * lastRound);
    setHover(Math.max(0, Math.min(lastRound, round)));
  }

  const hoverRow = hover != null ? history[Math.min(hover, lastRound)] : null;

  return (
    <section className="settlement-panel">
      <h3>净资产走势</h3>
      <div className="settlement-legend">
        {game.players.map((p) => (
          <span key={p.id} className="settlement-legend-item">
            <span className="asset-dot" style={{ background: p.color }} />
            {p.emoji} {p.name}
          </span>
        ))}
      </div>
      <div className="settlement-chart">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="每轮净资产走势"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="settlement-grid-line" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
              <text className="settlement-tick" x={padL - 8} y={y(t) + 4} textAnchor="end">
                {t >= 1000 ? `$${Math.round(t / 100) / 10}k` : `$${t}`}
              </text>
            </g>
          ))}
          <text className="settlement-tick" x={padL} y={H - 6} textAnchor="start">第 0 轮</text>
          <text className="settlement-tick" x={W - padR} y={H - 6} textAnchor="end">第 {lastRound} 轮</text>

          {hover != null && (
            <line className="settlement-crosshair" x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} />
          )}

          {(() => {
            const endYs = game.players.map((_, col) => y(history[lastRound]![col] ?? 0));
            const labelYs = spreadLabels(endYs, 16, padT + 6, H - padB - 4);
            return game.players.map((p, col) => {
              const pts = rounds.map((r) => `${x(r)},${y(history[r]![col] ?? 0)}`).join(' ');
              const endV = history[lastRound]![col] ?? 0;
              return (
                <g key={p.id}>
                  {rounds.length >= 3
                    ? <polyline className="settlement-line" points={pts} stroke={p.color} />
                    : rounds.map((r) => (
                      <circle key={r} cx={x(r)} cy={y(history[r]![col] ?? 0)} r={5} fill={p.color} />
                    ))}
                  <circle cx={x(lastRound)} cy={y(endV)} r={4.5} fill={p.color} className="settlement-line-end" />
                  <text className="settlement-line-label" x={x(lastRound) + 10} y={labelYs[col]! + 4}>
                    {p.emoji} {usd(endV)}
                  </text>
                </g>
              );
            });
          })()}
        </svg>
        {hover != null && hoverRow && (
          <div
            className="settlement-tooltip"
            style={{ left: `${(x(hover) / W) * 100}%` } as CSSProperties}
          >
            <b>第 {hover} 轮</b>
            {game.players
              .map((p, col) => ({ p, v: hoverRow[col] ?? 0 }))
              .sort((a, b) => b.v - a.v)
              .map(({ p, v }) => (
                <div key={p.id}>
                  <span className="asset-dot" style={{ background: p.color }} /> {p.name} {usd(v)}
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RentLeaderboard({ game, report }: { game: GameState; report: SettlementReport }) {
  const max = Math.max(1, ...report.rent.flatMap((r) => [r.received, r.paid]));
  return (
    <section className="settlement-panel">
      <h3>收租 / 付租</h3>
      {report.rent.map(({ playerId, received, paid }) => {
        const p = findPlayer(game, playerId);
        return (
          <div key={playerId} className="settlement-rent-row">
            <div className="settlement-rent-name">{p?.emoji} {p?.name}</div>
            <div className="settlement-bars">
              <div className="settlement-bar-track">
                <div className="settlement-bar settlement-bar-in" style={{ width: `${(received / max) * 100}%` }} />
                <span className="settlement-bar-value">收 {usd(received)}</span>
              </div>
              <div className="settlement-bar-track">
                <div className="settlement-bar settlement-bar-out" style={{ width: `${(paid / max) * 100}%` }} />
                <span className="settlement-bar-value">付 {usd(paid)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function EtfPnlPanel({ game, report }: { game: GameState; report: SettlementReport }) {
  const active = report.etfPnl.some((e) => e.realized !== 0 || e.unrealized !== 0);
  return (
    <section className="settlement-panel">
      <h3>证券盈亏</h3>
      {!active && <p className="settlement-empty">本局没有人交易 ETF</p>}
      {active && report.etfPnl.map(({ playerId, realized, unrealized, total }) => {
        const p = findPlayer(game, playerId);
        return (
          <div key={playerId} className="settlement-etf-row">
            <span className="settlement-rent-name">{p?.emoji} {p?.name}</span>
            <span>已实现 <b className={realized >= 0 ? 'market-up' : 'market-down'}>{usd(realized)}</b></span>
            <span>持仓 <b className={unrealized >= 0 ? 'market-up' : 'market-down'}>{usd(unrealized)}</b></span>
            <span>合计 <b className={total >= 0 ? 'market-up' : 'market-down'}>{usd(total)}</b></span>
          </div>
        );
      })}
    </section>
  );
}

function SuperlativeGrid({ game, report }: { game: GameState; report: SettlementReport }) {
  if (report.superlatives.length === 0) return null;
  return (
    <section className="settlement-panel">
      <h3>本局之最</h3>
      <div className="settlement-superlatives">
        {report.superlatives.map((s) => {
          const p = findPlayer(game, s.playerId);
          return (
            <div key={s.key} className="settlement-superlative" style={{ borderColor: p?.color }}>
              <div className="settlement-superlative-title">{s.emoji} {s.title}</div>
              <div className="settlement-superlative-holder">{p?.emoji} {p?.name}</div>
              <div className="settlement-superlative-detail">{s.detailText}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 46 }, (_, i) => (
        <i
          key={i}
          className={i % 7 === 0 ? 'confetti-leaf' : ''}
          style={{
            '--x': `${(i * 29) % 100}%`,
            '--delay': `${-(i * 0.13).toFixed(2)}s`,
            '--dur': `${2.8 + (i % 5) * 0.28}s`,
            '--hue': `${(i * 47) % 360}`,
          } as CSSProperties}
        >
          {i % 7 === 0 ? '🍁' : ''}
        </i>
      ))}
    </div>
  );
}
