import { useState, useEffect } from 'react';
import { sendMessage } from '../../types/messages';

interface UnlockProps {
  onUnlock: () => void;
}

export default function Unlock({ onUnlock }: UnlockProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [lockoutRemain, setLockoutRemain] = useState('');

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      setLockoutRemain('');
      return;
    }
    const interval = setInterval(() => {
      const remain = lockedUntil - Date.now();
      if (remain <= 0) {
        setLockoutRemain('');
        setLockedUntil(0);
        checkStatus();
        clearInterval(interval);
      } else {
        const min = Math.floor(remain / 60_000);
        const sec = Math.floor((remain % 60_000) / 1000);
        setLockoutRemain(`${min}:${sec.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const checkStatus = async () => {
    const resp = await sendMessage<{ attemptsLeft: number; lockedUntilMs: number }>({ type: 'GET_LOGIN_STATUS' });
    if (resp.success) {
      setAttemptsLeft(resp.data.attemptsLeft);
      if (resp.data.lockedUntilMs > Date.now()) {
        setLockedUntil(resp.data.lockedUntilMs);
      }
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    setError('');
    setLoading(true);

    const resp = await sendMessage({ type: 'UNLOCK_WALLET', password });
    setLoading(false);

    if (resp.success) {
      onUnlock();
    } else {
      setError(resp.error);
      setPassword('');
      checkStatus();
    }
  };

  const isLockedOut = lockedUntil > Date.now();

  return (
    <div className="container" style={{ justifyContent: 'center', minHeight: '560px' }}>
      <div className="text-center">
        <div style={{ fontSize: '32px', marginBottom: '8px', color: 'var(--accent)' }}>&#9783;</div>
        <h1 style={{
          fontSize: '16px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          marginBottom: '4px',
        }}>
          Sovereign
        </h1>
        <p className="text-muted text-small">wallet locked</p>
      </div>

      <div style={{ marginTop: '24px' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLockedOut && handleUnlock()}
          placeholder="Password"
          autoFocus
          disabled={isLockedOut}
        />
      </div>

      {error && (
        <p className="text-red text-small text-center">{error}</p>
      )}

      {isLockedOut && (
        <div className="warning text-center">
          Locked due to failed attempts. Wait {lockoutRemain}
        </div>
      )}

      {!isLockedOut && attemptsLeft < 5 && attemptsLeft > 0 && (
        <p className="text-yellow text-small text-center">
          {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
        </p>
      )}

      <button
        className="primary full"
        onClick={handleUnlock}
        disabled={loading || !password || isLockedOut}
      >
        {loading ? 'Unlocking...' : 'Unlock'}
      </button>
    </div>
  );
}
