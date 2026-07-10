import { useMemo } from 'react';
import { buildSettlementReport } from '@monopoly/shared';
import type { GameState } from '@monopoly/shared';

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

/** 终局个人成绩单 */
export default function ReportPanel({ game, meId }: { game: GameState; meId: string }) {
  const report = useMemo(() => buildSettlementReport(game), [game]);
  const me = game.players.find((p) => p.id === meId)!;
  const myRank = report.ranking.find((r) => r.playerId === meId);
  const myRent = report.rent.find((r) => r.playerId === meId);
  const myEtf = report.etfPnl.find((r) => r.playerId === meId);
  const myStats = game.stats?.players[meId];
  const myBadges = report.superlatives.filter((s) => s.playerId === meId);
  const isWinner = game.winner === meId;

  if (!myRank) return <div className="panel-note">🏁 游戏结束</div>;

  return (
    <div className="report-panel">
      <div className="report-rank-card" style={{ borderColor: me.color }}>
        <div className="report-rank-medal">{RANK_MEDALS[myRank.rank - 1] ?? `#${myRank.rank}`}</div>
        <div className="report-rank-title">
          {isWinner ? '🏆 你赢了!' : myRank.bankrupt ? '💥 破产出局' : `第 ${myRank.rank} 名`}
        </div>
        <div className="report-rank-worth">净资产 ${myRank.breakdown.total.toLocaleString('en-CA')}</div>
        <div className="report-breakdown">
          <span>💵 现金 ${myRank.breakdown.cash.toLocaleString('en-CA')}</span>
          <span>🗺️ 地产 ${myRank.breakdown.propertyValue.toLocaleString('en-CA')}</span>
          <span>🏠 建筑 ${myRank.breakdown.buildingValue.toLocaleString('en-CA')}</span>
          <span>📈 证券 ${myRank.breakdown.etfValue.toLocaleString('en-CA')}</span>
        </div>
      </div>

      <div className="report-stats">
        <ReportRow label="🏠 收到租金" value={`$${myRent?.received ?? 0}`} />
        <ReportRow label="💸 付出租金" value={`$${myRent?.paid ?? 0}`} />
        <ReportRow label="🧾 税费/维修/保释" value={`$${myStats?.taxesPaid ?? 0}`} />
        <ReportRow label="💰 起点薪水" value={`$${myStats?.salaryReceived ?? 0}`} />
        <ReportRow label="🗺️ 买入地产" value={`${myStats?.propertiesBought ?? 0} 块 (拍得 ${myStats?.auctionWins ?? 0})`} />
        <ReportRow label="🚔 入狱次数" value={`${myStats?.jailVisits ?? 0} 次`} />
        {myEtf && (myEtf.realized !== 0 || myEtf.unrealized !== 0) && (
          <ReportRow
            label="📈 证券盈亏"
            value={`${myEtf.total >= 0 ? '+' : '-'}$${Math.abs(myEtf.total).toLocaleString('en-CA')}`}
            tone={myEtf.total >= 0 ? 'up' : 'down'}
          />
        )}
      </div>

      <div className="report-badges">
        {myBadges.length > 0
          ? myBadges.map((b) => (
            <div key={b.key} className="report-badge">
              <b>{b.emoji} {b.title}</b>
              <span>{b.detailText}</span>
            </div>
          ))
          : <p className="home-hint">本局没有获得趣味称号, 下局再战!</p>}
      </div>
      <p className="home-hint">完整战报请看大屏 📺</p>
    </div>
  );
}

function ReportRow({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="report-row">
      <span>{label}</span>
      <b className={tone ? `report-${tone}` : ''}>{value}</b>
    </div>
  );
}
