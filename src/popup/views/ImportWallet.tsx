import { useState } from 'react';
import * as bip39 from 'bip39';
import { sendMessage } from '../../types/messages';

interface ImportWalletProps {
  onComplete: () => void;
  onBack: () => void;
}

export default function ImportWallet({ onComplete, onBack }: ImportWalletProps) {
  const [importSeed, setImportSeed] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [seedValid, setSeedValid] = useState<boolean | null>(null);

  const handleSeedInput = (value: string) => {
    setImportSeed(value);
    setError('');
    const trimmed = value.trim();
    if (trimmed.split(/\s+/).length >= 12) {
      setSeedValid(bip39.validateMnemonic(trimmed));
    } else {
      setSeedValid(null);
    }
  };

  const handleImport = async () => {
    setError('');
    const trimmed = importSeed.trim();

    if (!bip39.validateMnemonic(trimmed)) {
      setError('Invalid BIP39 seed. Check the words.');
      return;
    }

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount !== 12 && wordCount !== 15 && wordCount !== 18 && wordCount !== 21 && wordCount !== 24) {
      setError(`Expected 12, 15, 18, 21 or 24 words. Got ${wordCount}.`);
      return;
    }

    if (password.length < 8) {
      setError('Password: minimum 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setImporting(true);
    const resp = await sendMessage({ type: 'SETUP_WALLET', password, seed: trimmed });
    setImporting(false);

    if (resp.success) {
      onComplete();
    } else {
      setError('Error importing wallet');
    }
  };

  const wordCount = importSeed.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Import Wallet</h1>
        <div />
      </div>

      <div className="container">
        <p className="text-secondary text-small">
          Paste your BIP39 seed phrase (12 or 24 words). Compatible with Samourai, Sparrow, BlueWallet, Electrum, and any standard wallet.
        </p>

        <div>
          <div className="label">
            Seed phrase
            {seedValid === true && <span className="text-green"> (valid)</span>}
            {seedValid === false && <span className="text-red"> (invalid)</span>}
          </div>
          <textarea
            value={importSeed}
            onChange={(e) => handleSeedInput(e.target.value)}
            placeholder="word1 word2 word3 ..."
            rows={4}
            spellCheck={false}
            autoFocus
            style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
          />
          <div className="text-muted text-small" style={{ marginTop: '2px' }}>
            {wordCount}/24 words
          </div>
        </div>

        <div>
          <div className="label">Encryption password</div>
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
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          />
        </div>

        {error && <p className="text-red text-small">{error}</p>}

        <button
          className="primary full"
          onClick={handleImport}
          disabled={importing || !seedValid}
        >
          {importing ? 'Importing...' : 'Import wallet'}
        </button>
      </div>
    </div>
  );
}
