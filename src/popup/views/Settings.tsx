import { useState, useEffect } from 'react';
import { sendMessage } from '../../types/messages';
import type { NodeInfo } from '../../types/messages';
import { KNOWN_NODES, BADGE_COLORS, PRIVACY_COLORS } from '../../config/nodes';
import type { NodeOption } from '../../config/nodes';

interface SettingsProps {
  onBack: () => void;
  onLock: () => void;
  onNavigate?: (view: string) => void;
}

const SELECTED_NODE_KEY = 'selected_node_id';

export default function Settings({ onBack, onLock, onNavigate }: SettingsProps) {
  const [selectedNodeId, setSelectedNodeId] = useState('own-node');
  const [customUrl, setCustomUrl] = useState('');
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(false);
  const [seedPassword, setSeedPassword] = useState('');
  const [seed, setSeed] = useState('');
  const [seedError, setSeedError] = useState('');
  const [paymentCode, setPaymentCode] = useState('');
  const [apiKey, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [infoResp, pcResp, keyResp] = await Promise.all([
      sendMessage<NodeInfo>({ type: 'GET_NODE_INFO' }),
      sendMessage<string>({ type: 'GET_PAYMENT_CODE' }),
      sendMessage<string | null>({ type: 'GET_API_KEY' }),
    ]);

    if (infoResp.success) setNodeInfo(infoResp.data);
    if (pcResp.success) setPaymentCode(pcResp.data);
    if (keyResp.success && keyResp.data) setApiKeyStatus(keyResp.data);

    // Load saved node selection
    const stored = await chrome.storage.local.get(SELECTED_NODE_KEY);
    const savedId = stored[SELECTED_NODE_KEY] as string | undefined;
    if (savedId) {
      setSelectedNodeId(savedId);
      const node = KNOWN_NODES.find(n => n.id === savedId);
      if (node?.id === 'custom' && infoResp.success) {
        setCustomUrl(infoResp.data.server);
      }
    }
  };

  const getActiveUrl = (): string => {
    const node = KNOWN_NODES.find(n => n.id === selectedNodeId);
    if (!node) return '';
    if (node.id === 'custom') return customUrl;
    return node.url;
  };

  const handleSelectNode = async (node: NodeOption) => {
    setSelectedNodeId(node.id);
    setTestResult(null);
    await chrome.storage.local.set({ [SELECTED_NODE_KEY]: node.id });

    // Auto-test nodes that have a URL
    const url = node.id === 'custom' ? customUrl : node.url;
    if (url) {
      await sendMessage({ type: 'SET_NODE_URL', url });
      testNodeById(node.id);
    }
  };

  const handleSaveCustomUrl = async () => {
    if (!customUrl.trim()) return;
    await sendMessage({ type: 'SET_NODE_URL', url: customUrl.trim() });
    setTestResult(null);
  };

  const testNodeById = async (nodeId: string) => {
    setTesting(true);
    setTestResult(null);

    const node = KNOWN_NODES.find(n => n.id === nodeId);
    const url = node?.id === 'custom' ? customUrl : (node?.url ?? '');

    if (!url) {
      setTestResult(`No URL for "${node?.name ?? nodeId}". Configure a URL or select a public node.`);
      setTesting(false);
      return;
    }

    await sendMessage({ type: 'SET_NODE_URL', url });

    const resp = await sendMessage<{ connected: boolean; version?: string; error?: string }>({
      type: 'TEST_CONNECTION',
      url,
    });
    setTesting(false);
    if (resp.success) {
      const d = resp.data;
      setTestResult(d.connected ? `Connected — ${d.version ?? 'OK'}` : `Error: ${d.error ?? 'offline'}`);
      if (d.connected) loadAll();
    }
  };

  const testConnection = () => testNodeById(selectedNodeId);

  const handleExportSeed = async () => {
    setSeedError('');
    if (!seedPassword) { setSeedError('Enter your password'); return; }
    const resp = await sendMessage<string>({ type: 'EXPORT_SEED', password: seedPassword });
    if (resp.success) setSeed(resp.data);
    else setSeedError(resp.error);
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    await sendMessage({ type: 'SET_API_KEY', key: apiKey.trim() });
    setApiKeySaved(true);
    setApiKeyStatus('****' + apiKey.trim().slice(-4));
    setApiKeyInput('');
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleCopyPaymentCode = async () => {
    if (paymentCode) await navigator.clipboard.writeText(paymentCode);
  };

  const handleLock = async () => {
    await sendMessage({ type: 'LOCK_WALLET' });
    onLock();
  };

  const selectedNode = KNOWN_NODES.find(n => n.id === selectedNodeId);
  const isPublicNode = selectedNode?.badge === 'public';
  const isDevNode = selectedNode?.badge === 'dev';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Settings</h1>
        <div />
      </div>

      <div className="container">
        {/* ── Node selector ── */}
        <div className="card">
          <div className="label mb-8">Electrum Node</div>

          {KNOWN_NODES.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const badgeColor = BADGE_COLORS[node.badge];
            const privacyColor = PRIVACY_COLORS[node.privacyLevel];

            return (
              <label
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '8px 4px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(255, 102, 0, 0.04)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="node"
                  checked={isSelected}
                  onChange={() => handleSelectNode(node)}
                  style={{ marginTop: '3px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="text-small" style={{ fontWeight: 600 }}>{node.name}</span>
                    <span style={{
                      fontSize: '8px',
                      padding: '1px 5px',
                      borderRadius: '2px',
                      background: badgeColor,
                      color: '#000',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}>
                      {node.badge}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: privacyColor, display: 'inline-block',
                    }} />
                    <span style={{ fontSize: '10px', color: privacyColor }}>{node.privacyLabel}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '10px', marginTop: '1px' }}>
                    {node.privacyDescription}
                  </div>
                </div>
              </label>
            );
          })}

          {/* Public node warning */}
          {(isPublicNode || isDevNode) && (
            <div className="warning" style={{ marginTop: '8px' }}>
              {isPublicNode
                ? 'This node can see your Bitcoin addresses. For maximum privacy, use your own node.'
                : 'The developer can see your addresses. Set up your own node when you can.'}
            </div>
          )}

          {/* Custom URL input */}
          {selectedNodeId === 'custom' && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="wss://my-node:50002"
                spellCheck={false}
              />
              <button className="full mt-8" onClick={handleSaveCustomUrl} style={{ fontSize: '10px' }}>
                Save URL
              </button>
            </div>
          )}

          {/* Test + status */}
          <div className="row mt-8">
            <button onClick={testConnection} disabled={testing} style={{ fontSize: '10px' }}>
              {testing ? 'Testing...' : 'Test connection'}
            </button>
          </div>

          {testResult && (
            <div className={`text-small mt-8 ${testResult.startsWith('Error') ? 'text-red' : 'text-green'}`}>
              {testResult}
            </div>
          )}

          {nodeInfo && nodeInfo.height > 0 && (
            <div className="text-small text-muted mt-8">
              Block: {nodeInfo.height.toLocaleString()} — {nodeInfo.connected ? 'Connected' : 'Disconnected'}
            </div>
          )}
        </div>

        {/* PayNym */}
        {paymentCode && (
          <div className="card">
            <div className="label mb-8">My PayNym (BIP47)</div>
            <div
              style={{
                fontSize: '9px', wordBreak: 'break-all', fontFamily: 'var(--font-mono)',
                padding: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', cursor: 'pointer', lineHeight: 1.6,
              }}
              onClick={handleCopyPaymentCode}
            >
              {paymentCode}
            </div>
            <button className="full mt-8" onClick={handleCopyPaymentCode} style={{ fontSize: '10px' }}>
              Copy Payment Code
            </button>
          </div>
        )}

        {/* Claude API Key */}
        <div className="card">
          <div className="label mb-8">Claude API Key (AI Advisor)</div>
          {apiKeyStatus && <div className="text-small text-green mb-8">Configured: {apiKeyStatus}</div>}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-api03-..."
            spellCheck={false}
          />
          <button className="full mt-8" onClick={handleSaveApiKey}>
            {apiKeySaved ? 'Saved' : 'Save API Key'}
          </button>
        </div>

        {/* Export seed */}
        <div className="card">
          <div className="label mb-8">Export seed</div>
          {!showSeed ? (
            <button className="danger full" onClick={() => setShowSeed(true)}>Show seed</button>
          ) : seed ? (
            <>
              <div className="warning mb-8">DO NOT share these words with anyone.</div>
              <div className="seed-grid">
                {seed.split(' ').map((word, i) => (
                  <div className="seed-word" key={i}><span>{i + 1}.</span>{word}</div>
                ))}
              </div>
              <button className="full mt-8" onClick={() => { setSeed(''); setShowSeed(false); setSeedPassword(''); }}>Hide</button>
            </>
          ) : (
            <>
              <input type="password" value={seedPassword} onChange={(e) => setSeedPassword(e.target.value)}
                placeholder="Password to verify" onKeyDown={(e) => e.key === 'Enter' && handleExportSeed()} />
              {seedError && <p className="text-red text-small mt-8">{seedError}</p>}
              <div className="row mt-8">
                <button onClick={() => { setShowSeed(false); setSeedPassword(''); }}>Cancel</button>
                <button className="danger" onClick={handleExportSeed}>Verify</button>
              </div>
            </>
          )}
        </div>

        {/* Advanced + Backup */}
        {onNavigate && (
          <>
            <button className="full" onClick={() => onNavigate('advanced')}>Advanced settings</button>
            <button className="full" onClick={() => onNavigate('backup')}>Backup / Import wallet</button>
          </>
        )}

        {/* Lock */}
        <button className="danger full" onClick={handleLock}>Lock wallet</button>
      </div>
    </div>
  );
}
