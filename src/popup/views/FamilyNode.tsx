import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { sendMessage } from '../../types/messages';
import type { NodeInfo } from '../../types/messages';

interface FamilyNodeProps {
  onBack: () => void;
}

interface PeerInfo {
  name: string;
  ip: string;
  publicKey: string;
  createdAt: number;
  lastSeen: number;
}

interface InviteResult {
  friendName: string;
  assignedIP: string;
  configText: string;
}

export default function FamilyNode({ onBack }: FamilyNodeProps) {
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (inviteResult && qrRef.current) {
      QRCode.toCanvas(qrRef.current, inviteResult.configText, {
        width: 200,
        margin: 2,
        color: { dark: '#e0e0e0', light: '#111111' },
        errorCorrectionLevel: 'L',
      });
    }
  }, [inviteResult]);

  const loadData = async () => {
    setLoading(true);
    const [infoResp, peersResp] = await Promise.all([
      sendMessage<NodeInfo>({ type: 'GET_NODE_INFO' }),
      sendMessage<PeerInfo[]>({ type: 'GET_WG_PEERS' }),
    ]);

    if (infoResp.success) setNodeInfo(infoResp.data);
    if (peersResp.success) setPeers(peersResp.data);
    setLoading(false);
  };

  const handleGenerateInvite = async () => {
    if (!friendName.trim()) return;
    setGenerating(true);
    const resp = await sendMessage<InviteResult>({
      type: 'GENERATE_WG_INVITE',
      friendName: friendName.trim(),
    });
    setGenerating(false);
    if (resp.success) {
      setInviteResult(resp.data);
      loadData(); // refresh peers
    }
  };

  const handleCopyConfig = async () => {
    if (!inviteResult) return;
    await navigator.clipboard.writeText(inviteResult.configText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemovePeer = async (ip: string) => {
    await sendMessage({ type: 'REMOVE_WG_PEER', ip });
    loadData();
  };

  const formatDate = (ts: number): string => {
    if (ts === 0) return 'Never';
    return new Date(ts).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Family Node</h1>
        <div />
      </div>

      <div className="container">
        {loading ? (
          <div className="spinner" style={{ margin: '40px auto' }} />
        ) : (
          <>
            {/* Node Status */}
            <div className="card">
              <div className="label mb-8">Node status</div>
              {nodeInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Status</span>
                    <span className={nodeInfo.connected ? 'text-green' : 'text-red'}>
                      {nodeInfo.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Blocks</span>
                    <span>{nodeInfo.height.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Server</span>
                    <span className="text-secondary" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nodeInfo.server}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-muted text-small">No information</div>
              )}
            </div>

            {/* Connected Peers */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="label" style={{ margin: 0 }}>WireGuard Peers</div>
                <span className="text-muted text-small">{peers.length}</span>
              </div>

              {peers.length === 0 ? (
                <div className="text-muted text-small text-center" style={{ padding: '12px 0' }}>
                  No peers connected
                </div>
              ) : (
                peers.map((peer) => (
                  <div key={peer.ip} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '11px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{peer.name}</div>
                      <div className="text-muted">{peer.ip}</div>
                      <div className="text-muted" style={{ fontSize: '10px' }}>
                        Last seen: {formatDate(peer.lastSeen)}
                      </div>
                    </div>
                    <button
                      className="danger"
                      onClick={() => handleRemovePeer(peer.ip)}
                      style={{ fontSize: '9px', padding: '2px 8px' }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Invite button */}
            {!showInvite && !inviteResult && (
              <button className="primary full" onClick={() => setShowInvite(true)}>
                Invite friend
              </button>
            )}

            {/* Invite form */}
            {showInvite && !inviteResult && (
              <div className="card">
                <div className="label mb-8">New peer</div>
                <input
                  type="text"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  placeholder="Friend's name"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateInvite()}
                  autoFocus
                />
                <div className="row mt-8">
                  <button onClick={() => setShowInvite(false)}>Cancel</button>
                  <button className="primary" onClick={handleGenerateInvite} disabled={generating || !friendName.trim()}>
                    {generating ? 'Generating...' : 'Generate invite'}
                  </button>
                </div>
              </div>
            )}

            {/* Invite result */}
            {inviteResult && (
              <div className="card">
                <div className="label mb-8">Invitation for {inviteResult.friendName}</div>
                <div className="text-small text-muted mb-8">
                  Assigned IP: {inviteResult.assignedIP}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                  <canvas ref={qrRef} />
                </div>

                <p className="text-small text-muted mb-8">
                  Scan this QR with the WireGuard app or copy the config.
                </p>

                <div style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '8px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  maxHeight: '100px',
                }}>
                  {inviteResult.configText}
                </div>

                <div className="row mt-8">
                  <button onClick={handleCopyConfig}>
                    {copied ? 'Copied' : 'Copy config'}
                  </button>
                  <button onClick={() => { setInviteResult(null); setShowInvite(false); setFriendName(''); }}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
