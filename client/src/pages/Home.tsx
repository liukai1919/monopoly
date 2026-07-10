import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emitAck } from '../api';
import { LANGUAGES, saveLanguage, storedLanguage, tr, type Language } from '../i18n';

export default function Home() {
  const nav = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [language, setLanguage] = useState<Language>(() => storedLanguage());

  function selectLanguage(next: Language) {
    setLanguage(next);
    saveLanguage(next);
  }

  async function createRoom() {
    setCreating(true);
    const res = await emitAck<{ code?: string }>('board:create', { language });
    setCreating(false);
    if (res?.code) nav(`/board/${res.code}`);
    else setError(tr(language, '创建房间失败, 请确认服务器已启动', 'Could not create a room. Check that the server is running.', 'Impossible de créer une salle. Vérifiez que le serveur est démarré.'));
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError(tr(language, '房间码是 4 位字母数字', 'Room codes are 4 letters or numbers.', 'Le code de salle contient 4 lettres ou chiffres.'));
      return;
    }
    saveLanguage(language);
    nav(`/play/${code}`);
  }

  return (
    <div className="home">
      <div className="home-card">
        <div className="language-switch" aria-label={tr(language, '语言', 'Language', 'Langue')}>
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={language === item.id ? 'active' : ''}
              onClick={() => selectLanguage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <h1 className="home-title">🍁 {tr(language, '大富翁', 'Monopoly', 'Monopoly')}</h1>
        <p className="home-subtitle">
          {tr(language, '加拿大版 · 家庭局域网游戏', 'Canada edition · Family LAN game', 'Édition Canada · Jeu familial en réseau local')}
        </p>

        <button className="btn btn-primary btn-xl" onClick={createRoom} disabled={creating}>
          📺 {tr(language, '创建游戏 (大屏 / 电视打开)', 'Create Game (big screen / TV)', 'Créer une partie (grand écran / télé)')}
        </button>

        <div className="home-divider">{tr(language, '— 手机加入 —', '— Join on phones —', '— Rejoindre sur téléphone —')}</div>

        <div className="home-join">
          <input
            className="input"
            placeholder={tr(language, '输入 4 位房间码', 'Enter 4-character room code', 'Entrez le code de salle à 4 caractères')}
            value={joinCode}
            maxLength={4}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
          />
          <button className="btn btn-primary" onClick={joinRoom}>
            {tr(language, '加入', 'Join', 'Rejoindre')}
          </button>
        </div>
        <p className="home-hint">
          {tr(
            language,
            '大屏创建房间后, 手机扫码或输码加入。所有设备须连同一个 Wi-Fi。',
            'Create a room on the big screen, then phones can scan or enter the code. All devices must use the same Wi-Fi.',
            'Créez une salle sur le grand écran, puis les téléphones peuvent scanner ou saisir le code. Tous les appareils doivent utiliser le même Wi-Fi.',
          )}
        </p>
        {error && <p className="home-error">{error}</p>}
      </div>
    </div>
  );
}
