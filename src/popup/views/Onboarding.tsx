import { useState } from 'react';
import { sendMessage } from '../../types/messages';
import { KNOWN_NODES, BADGE_COLORS, PRIVACY_COLORS } from '../../config/nodes';

interface OnboardingProps {
  onComplete: () => void;
  onImport: () => void;
  onConnectHardware: () => void;
}

type Step = 'welcome' | 'create-seed' | 'verify-seed' | 'set-password' | 'configure-node' | 'done';

export default function Onboarding({ onComplete, onImport, onConnectHardware }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [seed, setSeed] = useState('');
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyAnswers, setVerifyAnswers] = useState<string[]>(['', '', '']);
  const [verifyError, setVerifyError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('own-node');
  const [customUrl, setCustomUrl] = useState('');
  const [nodeTestResult, setNodeTestResult] = useState<string | null>(null);
  const [nodeTesting, setNodeTesting] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const words = seed.split(' ');

  const handleGenerateSeed = async () => {
    setLoading(true);
    const resp = await sendMessage<string>({ type: 'GENERATE_SEED' });
    setLoading(false);
    if (resp.success) {
      setSeed(resp.data);
      // Pick 3 random indices to verify
      const indices: number[] = [];
      while (indices.length < 3) {
        const idx = Math.floor(Math.random() * 24);
        if (!indices.includes(idx)) indices.push(idx);
      }
      setVerifyIndices(indices.sort((a, b) => a - b));
      setStep('create-seed');
    }
  };

  const handleVerify = () => {
    setVerifyError('');
    const seedWords = seed.split(' ');
    for (let i = 0; i < 3; i++) {
      const idx = verifyIndices[i]!;
      if (verifyAnswers[i]?.trim().toLowerCase() !== seedWords[idx]?.toLowerCase()) {
        setVerifyError(`Word #${idx + 1} is incorrect. Check your backup.`);
        return;
      }
    }
    setStep('set-password');
  };

  const handleCreateWallet = async () => {
    setPasswordError('');
    if (password.length < 8) {
      setPasswordError('Minimum 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    setLoading(true);
    const resp = await sendMessage({ type: 'SETUP_WALLET', password, seed });
    setLoading(false);

    if (resp.success) {
      setStep('configure-node');
    } else {
      setPasswordError('Error creating wallet');
    }
  };

  const getSelectedUrl = (): string => {
    const node = KNOWN_NODES.find(n => n.id === selectedNodeId);
    if (!node) return '';
    if (node.id === 'custom') return customUrl;
    return node.url;
  };

  const handleTestNode = async () => {
    setNodeTesting(true);
    setNodeTestResult(null);
    const url = getSelectedUrl();
    if (!url) { setNodeTestResult('Error: Empty URL'); setNodeTesting(false); return; }
    const resp = await sendMessage<{ connected: boolean; version?: string; error?: string }>({
      type: 'TEST_CONNECTION',
      url,
    });
    setNodeTesting(false);
    if (resp.success) {
      const data = resp.data;
      setNodeTestResult(data.connected ? `Connected — ${data.version ?? 'OK'}` : `Error: ${data.error ?? 'offline'}`);
    }
  };

  const handleFinish = async () => {
    const url = getSelectedUrl();
    if (url) {
      await sendMessage({ type: 'SET_NODE_URL', url });
    }
    await chrome.storage.local.set({ selected_node_id: selectedNodeId });

    const resp = await sendMessage<string>({ type: 'GET_RECEIVE_ADDRESS' });
    if (resp.success) setReceiveAddress(resp.data);
    setStep('done');
  };

  const handleSkipNode = async () => {
    setStep('done');
  };

  return (
    <div className="container" style={{ minHeight: '560px' }}>
      {/* Step 1: Welcome */}
      {step === 'welcome' && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '24px' }}>
          <div className="text-center">
            <div style={{ fontSize: '36px', color: 'var(--accent)', marginBottom: '8px' }}>&#9783;</div>
            <h1 style={{ fontSize: '18px', color: 'var(--accent)', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Sovereign Wallet
            </h1>
            <p className="text-muted text-small" style={{ marginTop: '4px' }}>Your node. Your keys. Your Bitcoin.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card" style={{ padding: '12px' }}>
              <div className="text-small" style={{ color: 'var(--green)' }}>Full sovereignty</div>
              <div className="text-small text-muted">Connect to your own Fulcrum node. No intermediaries.</div>
            </div>
            <div className="card" style={{ padding: '12px' }}>
              <div className="text-small" style={{ color: 'var(--yellow)' }}>Advanced privacy</div>
              <div className="text-small text-muted">Stonewall, Ricochet, Coin Control and Privacy Score on every tx.</div>
            </div>
            <div className="card" style={{ padding: '12px' }}>
              <div className="text-small" style={{ color: 'var(--accent)' }}>Open source</div>
              <div className="text-small text-muted">Auditable code. No telemetry. No trackers.</div>
            </div>
          </div>

          <button className="primary full" onClick={handleGenerateSeed} disabled={loading}>
            {loading ? 'Generating...' : 'Create new wallet'}
          </button>
          <button className="full" onClick={onImport}>
            Import existing seed
          </button>
          <button className="full" onClick={onConnectHardware} style={{ color: 'var(--text-secondary)' }}>
            Connect hardware wallet
          </button>
          <div className="text-muted text-small text-center" style={{ marginTop: '-8px' }}>
            Coldcard &middot; Keystone
          </div>
        </div>
      )}

      {/* Step 2: Show seed */}
      {step === 'create-seed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="warning">
            WRITE DOWN THESE 24 WORDS ON PAPER. NEVER store them digitally.
            If you lose this seed, you lose your bitcoin.
          </div>

          <div className="seed-grid">
            {words.map((word, i) => (
              <div className="seed-word" key={i}>
                <span>{i + 1}.</span>{word}
              </div>
            ))}
          </div>

          <button className="primary full" onClick={() => setStep('verify-seed')}>
            I wrote it down, verify
          </button>
        </div>
      )}

      {/* Step 3: Verify seed */}
      {step === 'verify-seed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p className="text-secondary text-small">
            Enter the 3 words indicated to verify you saved your seed correctly.
          </p>

          {verifyIndices.map((idx, i) => (
            <div key={idx}>
              <div className="label">Word #{idx + 1}</div>
              <input
                type="text"
                value={verifyAnswers[i] ?? ''}
                onChange={(e) => {
                  const next = [...verifyAnswers];
                  next[i] = e.target.value;
                  setVerifyAnswers(next);
                }}
                placeholder={`Word ${idx + 1} of 24`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}

          {verifyError && <p className="text-red text-small">{verifyError}</p>}

          <div className="row">
            <button onClick={() => setStep('create-seed')}>Back</button>
            <button className="primary" onClick={handleVerify}>
              Verify
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Set password */}
      {step === 'set-password' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            <div className="label">Confirm</div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWallet()}
            />
          </div>

          {passwordError && <p className="text-red text-small">{passwordError}</p>}

          <button className="primary full" onClick={handleCreateWallet} disabled={loading}>
            {loading ? 'Creating...' : 'Create Wallet'}
          </button>
        </div>
      )}

      {/* Step 5: Configure node */}
      {step === 'configure-node' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p className="text-secondary text-small">
            Choose how to connect to the Bitcoin network. Your own node = maximum privacy.
          </p>

          {KNOWN_NODES.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const badgeColor = BADGE_COLORS[node.badge];
            const privacyColor = PRIVACY_COLORS[node.privacyLevel];
            return (
              <label key={node.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 4px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: isSelected ? 'rgba(255,102,0,0.04)' : 'transparent',
              }}>
                <input type="radio" name="onb-node" checked={isSelected}
                  onChange={() => setSelectedNodeId(node.id)} style={{ marginTop: '3px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="text-small" style={{ fontWeight: 600 }}>{node.name}</span>
                    <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '2px',
                      background: badgeColor, color: '#000', fontWeight: 700, textTransform: 'uppercase' }}>
                      {node.badge}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: privacyColor }} />
                    <span style={{ fontSize: '10px', color: privacyColor }}>{node.privacyLabel}</span>
                  </div>
                </div>
              </label>
            );
          })}

          {selectedNodeId === 'custom' && (
            <input type="text" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="wss://my-node:50002" spellCheck={false} />
          )}

          {(KNOWN_NODES.find(n => n.id === selectedNodeId)?.badge === 'public') && (
            <div className="warning">
              This node can see your addresses. For maximum privacy, set up your own node later.
            </div>
          )}

          <button onClick={handleTestNode} disabled={nodeTesting} style={{ fontSize: '10px' }}>
            {nodeTesting ? 'Testing...' : 'Test connection'}
          </button>

          {nodeTestResult && (
            <p className={`text-small ${nodeTestResult.startsWith('Error') ? 'text-red' : 'text-green'}`}>
              {nodeTestResult}
            </p>
          )}

          <div className="row" style={{ marginTop: '4px' }}>
            <button onClick={handleSkipNode}>Skip</button>
            <button className="primary" onClick={handleFinish}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 6: Done */}
      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', color: 'var(--green)' }}>&#10003;</div>
          <h2 style={{ fontSize: '16px' }}>Wallet ready</h2>

          {receiveAddress ? (
            <div>
              <p className="text-muted text-small mb-8">Your first receive address:</p>
              <div className="card" style={{ wordBreak: 'break-all', fontSize: '11px', lineHeight: 1.8 }}>
                {receiveAddress}
              </div>
            </div>
          ) : (
            <p className="text-muted text-small">
              Connect to your node from Settings to see your address.
            </p>
          )}

          <button className="primary full mt-16" onClick={onComplete}>
            Go to Dashboard
          </button>
        </div>
      )}

      {/* Progress indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: 'auto', paddingTop: '12px' }}>
        {['welcome', 'create-seed', 'verify-seed', 'set-password', 'configure-node', 'done'].map((s, i) => (
          <span
            key={s}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: s === step ? 'var(--accent)' : 'var(--border)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
