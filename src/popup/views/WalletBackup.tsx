import { useState } from 'react';
import * as bip39 from 'bip39';
import { sendMessage } from '../../types/messages';

interface WalletBackupProps {
  onBack: () => void;
  onImported: () => void;
}

type Mode = 'menu' | 'export' | 'import';

export default function WalletBackup({ onBack, onImported }: WalletBackupProps) {
  const [mode, setMode] = useState<Mode>('menu');

  // Export state
  const [exportPassword, setExportPassword] = useState('');
  const [exportedSeed, setExportedSeed] = useState('');
  const [exportError, setExportError] = useState('');

  // Import state
  const [importSeed, setImportSeed] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importConfirmPassword, setImportConfirmPassword] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [seedValid, setSeedValid] = useState<boolean | null>(null);

  const handleExport = async () => {
    setExportError('');
    if (!exportPassword) {
      setExportError('Enter your password');
      return;
    }
    const resp = await sendMessage<string>({ type: 'EXPORT_SEED', password: exportPassword });
    if (resp.success) {
      setExportedSeed(resp.data);
    } else {
      setExportError(resp.error);
    }
  };

  const handleSeedInput = (value: string) => {
    setImportSeed(value);
    setImportError('');
    const trimmed = value.trim();
    if (trimmed.split(/\s+/).length >= 12) {
      setSeedValid(bip39.validateMnemonic(trimmed));
    } else {
      setSeedValid(null);
    }
  };

  const handleImport = async () => {
    setImportError('');
    const trimmed = importSeed.trim();

    if (!bip39.validateMnemonic(trimmed)) {
      setImportError('Invalid BIP39 seed. Check the words.');
      return;
    }

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount !== 12 && wordCount !== 15 && wordCount !== 18 && wordCount !== 21 && wordCount !== 24) {
      setImportError(`Expected 12, 15, 18, 21 or 24 words. Got ${wordCount}.`);
      return;
    }

    if (importPassword.length < 8) {
      setImportError('Password: minimum 8 characters');
      return;
    }

    if (importPassword !== importConfirmPassword) {
      setImportError("Passwords don't match");
      return;
    }

    setImporting(true);
    const resp = await sendMessage({ type: 'SETUP_WALLET', password: importPassword, seed: trimmed });
    setImporting(false);

    if (resp.success) {
      onImported();
    } else {
      setImportError('Error importing wallet');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={mode === 'menu' ? onBack : () => { setMode('menu'); setExportedSeed(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Backup</h1>
        <div />
      </div>

      <div className="container">
        {/* Menu */}
        {mode === 'menu' && (
          <>
            <p className="text-secondary text-small">
              Export your seed for safekeeping, or import an existing seed from another BIP39 wallet (Samourai, Sparrow, etc).
            </p>

            <button className="full" onClick={() => setMode('export')}>
              Export seed
            </button>
            <button className="full" onClick={() => setMode('import')}>
              Import existing seed
            </button>
          </>
        )}

        {/* Export */}
        {mode === 'export' && !exportedSeed && (
          <>
            <p className="text-secondary text-small">
              Enter your password to view the seed.
            </p>

            <div>
              <div className="label">Password</div>
              <input
                type="password"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Your current password"
                onKeyDown={(e) => e.key === 'Enter' && handleExport()}
                autoFocus
              />
            </div>

            {exportError && <p className="text-red text-small">{exportError}</p>}

            <button className="danger full" onClick={handleExport}>
              Show seed
            </button>
          </>
        )}

        {mode === 'export' && exportedSeed && (
          <>
            <div className="warning">
              DO NOT share these words with anyone. Whoever has them controls your bitcoin. Write them on paper and store in a safe place.
            </div>

            <div className="seed-grid">
              {exportedSeed.split(' ').map((word, i) => (
                <div className="seed-word" key={i}>
                  <span>{i + 1}.</span>{word}
                </div>
              ))}
            </div>

            <button className="full" onClick={() => { setExportedSeed(''); setExportPassword(''); setMode('menu'); }}>
              Hide
            </button>
          </>
        )}

        {/* Import */}
        {mode === 'import' && (
          <>
            <p className="text-secondary text-small">
              Paste your BIP39 seed (12 or 24 words). Compatible with Samourai, Sparrow and any standard wallet.
            </p>

            <div className="warning">
              Importing a seed replaces the current wallet. Make sure you have a backup of your previous seed.
            </div>

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
                style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <div className="text-muted text-small" style={{ marginTop: '2px' }}>
                {importSeed.trim().split(/\s+/).filter(Boolean).length}/24 words
              </div>
            </div>

            <div>
              <div className="label">New password</div>
              <input
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <div className="label">Confirm password</div>
              <input
                type="password"
                value={importConfirmPassword}
                onChange={(e) => setImportConfirmPassword(e.target.value)}
                placeholder="Repeat password"
              />
            </div>

            {importError && <p className="text-red text-small">{importError}</p>}

            <button
              className="primary full"
              onClick={handleImport}
              disabled={importing || !seedValid}
            >
              {importing ? 'Importing...' : 'Import wallet'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
