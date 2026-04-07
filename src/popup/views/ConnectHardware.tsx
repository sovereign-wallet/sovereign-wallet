import { useState } from 'react';
import { sendMessage } from '../../types/messages';

interface ConnectHardwareProps {
  onComplete: () => void;
  onBack: () => void;
}

type Device = 'coldcard' | 'keystone';

export default function ConnectHardware({ onComplete, onBack }: ConnectHardwareProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [xpub, setXpub] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!device || !xpub.trim()) return;
    setError('');
    setLoading(true);

    const resp = await sendMessage<{ xpub: string }>({
      type: 'SETUP_WATCH_ONLY',
      xpub: xpub.trim(),
      device,
    });

    setLoading(false);

    if (resp.success) {
      onComplete();
    } else {
      setError(resp.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Hardware Wallet</h1>
        <div />
      </div>

      <div className="container">
        {/* Step 1: Select device */}
        {!device && (
          <>
            <p className="text-secondary text-small">
              Connect your hardware wallet in watch-only mode. Your keys stay on the device — the extension only sees your public key.
            </p>

            <button
              className="card full"
              onClick={() => setDevice('coldcard')}
              style={{ textAlign: 'left', cursor: 'pointer', padding: '16px' }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Coldcard</div>
              <div className="text-small text-muted">
                Export your xpub from Settings &rarr; Advanced/Tools &rarr; Export Wallet &rarr; Generic JSON. Copy the zpub key.
              </div>
            </button>

            <button
              className="card full"
              onClick={() => setDevice('keystone')}
              style={{ textAlign: 'left', cursor: 'pointer', padding: '16px' }}
            >
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Keystone</div>
              <div className="text-small text-muted">
                Go to the menu &rarr; show xpub QR &rarr; scan or type the extended public key.
              </div>
            </button>
          </>
        )}

        {/* Step 2: Enter xpub */}
        {device && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px',
            }}>
              <span style={{
                fontSize: '10px', padding: '2px 8px', borderRadius: '2px',
                background: 'var(--accent)', color: '#000', fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                {device}
              </span>
              <button
                onClick={() => { setDevice(null); setXpub(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', padding: 0, cursor: 'pointer' }}
              >
                Change
              </button>
            </div>

            <div className="card" style={{ padding: '12px', fontSize: '11px', lineHeight: 1.6 }}>
              {device === 'coldcard' ? (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>How to get your xpub from Coldcard:</div>
                  <div className="text-muted">
                    1. On Coldcard: Advanced/Tools &rarr; Export Wallet &rarr; Generic JSON<br />
                    2. Open the JSON file on your computer<br />
                    3. Find the "bip84" section &rarr; copy the "xpub" value<br />
                    4. Paste it below
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>How to get your xpub from Keystone:</div>
                  <div className="text-muted">
                    1. On Keystone: Menu &rarr; Extended Public Key<br />
                    2. Select BIP84 (Native Segwit)<br />
                    3. Copy the key or scan the QR code<br />
                    4. Paste it below
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="label">Extended Public Key (xpub / zpub)</div>
              <textarea
                value={xpub}
                onChange={(e) => { setXpub(e.target.value); setError(''); }}
                placeholder="xpub6CUGRUo... or zpub6rFR7..."
                rows={4}
                spellCheck={false}
                style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              />
            </div>

            {error && <p className="text-red text-small">{error}</p>}

            <div className="warning">
              Watch-only mode: you can view balance and receive bitcoin, but sending requires signing on your {device === 'coldcard' ? 'Coldcard' : 'Keystone'} via PSBT file.
            </div>

            <button
              className="primary full"
              onClick={handleConnect}
              disabled={loading || !xpub.trim()}
            >
              {loading ? 'Connecting...' : 'Connect wallet'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
