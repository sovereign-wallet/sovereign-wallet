import { useState } from 'react';
import { sendMessage } from '../../types/messages';

interface SetupProps {
  onComplete: () => void;
}

type Step = 'generate' | 'show-seed' | 'set-password';

export default function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState<Step>('generate');
  const [seed, setSeed] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seedConfirmed, setSeedConfirmed] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const resp = await sendMessage<string>({ type: 'GENERATE_SEED' });
    setLoading(false);
    if (resp.success) {
      setSeed(resp.data);
      setStep('show-seed');
    } else {
      setError(resp.error);
    }
  };

  const handleCreateWallet = async () => {
    setError('');
    if (password.length < 8) {
      setError('Minimum 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    const resp = await sendMessage({ type: 'SETUP_WALLET', password, seed });
    setLoading(false);

    if (resp.success) {
      onComplete();
    } else {
      setError(resp.error);
    }
  };

  const words = seed.split(' ');

  return (
    <div className="container">
      <div className="header">
        <h1>Sovereign Wallet</h1>
      </div>

      {step === 'generate' && (
        <div className="container" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-center">
            <div style={{ fontSize: '32px', marginBottom: '16px', color: 'var(--accent)' }}>&#9783;</div>
            <p className="text-secondary mb-8">Your node. Your keys. Your Bitcoin.</p>
            <p className="text-small text-muted mb-8">
              Generate a 24-word seed. Store it in a safe place offline.
            </p>
          </div>
          <button className="primary full mt-16" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Seed'}
          </button>
        </div>
      )}

      {step === 'show-seed' && (
        <div className="container">
          <div className="warning">
            WRITE DOWN THESE 24 WORDS ON PAPER. NEVER store them digitally.
            If you lose this seed, you lose your bitcoin. No exceptions.
          </div>

          <div className="seed-grid">
            {words.map((word, i) => (
              <div className="seed-word" key={i}>
                <span>{i + 1}.</span>{word}
              </div>
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
            <input
              type="checkbox"
              checked={seedConfirmed}
              onChange={(e) => setSeedConfirmed(e.target.checked)}
            />
            <span className="text-secondary">I wrote down the seed on paper</span>
          </label>

          <button
            className="primary full"
            onClick={() => setStep('set-password')}
            disabled={!seedConfirmed}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'set-password' && (
        <div className="container">
          <p className="text-secondary text-small">
            Create a password to encrypt the seed on this device.
          </p>

          <div>
            <div className="label">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <div className="label">Confirm password</div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWallet()}
            />
          </div>

          {error && <p className="text-red text-small">{error}</p>}

          <button className="primary full" onClick={handleCreateWallet} disabled={loading}>
            {loading ? 'Creating...' : 'Create Wallet'}
          </button>
        </div>
      )}
    </div>
  );
}
