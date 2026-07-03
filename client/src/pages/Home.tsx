import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emitAck } from '../api';

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  async function createRoom() {
    setCreating(true);
    const res = await emitAck<{ code?: string }>('board:create', {});
    setCreating(false);
    if (res?.code) nav(`/board/${res.code}`);
    else setError('创建房间失败, 请确认服务器已启动');
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('房间码是 4 位字母数字');
      return;
    }
    nav(`/play/${code}`);
  }

  return (
    <div className="home">
      <div className="home-card">
        <h1 className="home-title">🍁 大富翁</h1>
        <p className="home-subtitle">加拿大版 · 家庭局域网游戏</p>

        <button className="btn btn-primary btn-xl" onClick={createRoom} disabled={creating}>
          📺 创建游戏 (大屏 / 电视打开)
        </button>

        <div className="home-divider">— 手机加入 —</div>

        <div className="home-join">
          <input
            className="input"
            placeholder="输入 4 位房间码"
            value={joinCode}
            maxLength={4}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
          />
          <button className="btn btn-primary" onClick={joinRoom}>加入</button>
        </div>
        <p className="home-hint">大屏创建房间后, 手机扫码或输码加入。所有设备须连同一个 Wi-Fi。</p>
        {error && <p className="home-error">{error}</p>}
      </div>
    </div>
  );
}
