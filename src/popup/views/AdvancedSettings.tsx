import { useState, useEffect } from 'react';

interface AdvancedSettingsProps {
  onBack: () => void;
}

interface AdvConfig {
  gapLimit: number;
  rbfEnabled: boolean;
  denomination: 'btc' | 'sats' | 'both';
  language: 'es' | 'en';
}

const CONFIG_KEY = 'sovereign_advanced_config';

async function loadConfig(): Promise<AdvConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const raw = result[CONFIG_KEY] as string | undefined;
  if (!raw) return { gapLimit: 20, rbfEnabled: true, denomination: 'both', language: 'en' };
  return JSON.parse(raw) as AdvConfig;
}

async function saveConfig(config: AdvConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: JSON.stringify(config) });
}

export default function AdvancedSettings({ onBack }: AdvancedSettingsProps) {
  const [config, setConfig] = useState<AdvConfig>({ gapLimit: 20, rbfEnabled: true, denomination: 'both', language: 'en' });
  const [saved, setSaved] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const handleSave = async () => {
    await saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    if (resetConfirm !== 'DELETE') return;
    await chrome.storage.local.clear();
    window.close();
  };

  const updateField = <K extends keyof AdvConfig>(key: K, value: AdvConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Advanced</h1>
        <div />
      </div>

      <div className="container">
        {/* Gap limit */}
        <div className="card">
          <div className="label mb-8">Gap Limit</div>
          <input
            type="number"
            value={config.gapLimit}
            onChange={(e) => updateField('gapLimit', Math.min(100, Math.max(1, parseInt(e.target.value) || 20)))}
            min={1}
            max={100}
          />
          <div className="text-muted text-small mt-8">
            Empty addresses to scan before stopping. Default: 20.
          </div>
        </div>

        {/* RBF */}
        <div className="card">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.rbfEnabled}
              onChange={(e) => updateField('rbfEnabled', e.target.checked)}
            />
            <div>
              <div className="text-small">Replace-By-Fee (RBF)</div>
              <div className="text-muted" style={{ fontSize: '10px' }}>
                Allows speeding up pending transactions by increasing the fee.
              </div>
            </div>
          </label>
        </div>

        {/* Denomination */}
        <div className="card">
          <div className="label mb-8">Denomination</div>
          <div className="select-group">
            {(['btc', 'sats', 'both'] as const).map((d) => (
              <button
                key={d}
                className={config.denomination === d ? 'active' : ''}
                onClick={() => updateField('denomination', d)}
              >
                {d === 'btc' ? 'BTC' : d === 'sats' ? 'Sats' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="card">
          <div className="label mb-8">Language</div>
          <div className="select-group">
            <button
              className={config.language === 'es' ? 'active' : ''}
              onClick={() => updateField('language', 'es')}
            >
              Spanish
            </button>
            <button
              className={config.language === 'en' ? 'active' : ''}
              onClick={() => updateField('language', 'en')}
            >
              English
            </button>
          </div>
        </div>

        <button className="primary full" onClick={handleSave}>
          {saved ? 'Saved' : 'Save changes'}
        </button>

        {/* Reset wallet */}
        <div className="card" style={{ borderColor: 'var(--red-dim)' }}>
          <div className="label mb-8" style={{ color: 'var(--red)' }}>Danger zone</div>
          {!showReset ? (
            <button className="danger full" onClick={() => setShowReset(true)}>
              Full wallet reset
            </button>
          ) : (
            <>
              <div className="warning mb-8">
                This deletes ALL data: encrypted seed, labels, configuration. Make sure you have a backup of your seed.
              </div>
              <div className="label">Type DELETE to confirm</div>
              <input
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="DELETE"
              />
              <div className="row mt-8">
                <button onClick={() => { setShowReset(false); setResetConfirm(''); }}>Cancel</button>
                <button className="danger" onClick={handleReset} disabled={resetConfirm !== 'DELETE'}>
                  Confirm reset
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
