import { useState, useEffect } from 'react';
import { sendMessage } from '../../types/messages';
import type { BalanceData, TransactionRecord } from '../../types/messages';
import PrivacyWarningBanner from '../components/PrivacyWarningBanner';
import { KNOWN_NODES } from '../../config/nodes';
import type { NodeBadge } from '../../config/nodes';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [txs, setTxs] = useState<TransactionRecord[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nodeBadge, setNodeBadge] = useState<NodeBadge>('own');
  const [nodeName, setNodeName] = useState('');

  useEffect(() => {
    loadData();
    const interval = setInterval(checkConnection, 15_000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [balResp, txResp, connResp] = await Promise.all([
      sendMessage<BalanceData>({ type: 'GET_BALANCE' }),
      sendMessage<TransactionRecord[]>({ type: 'GET_TRANSACTION_HISTORY' }),
      sendMessage<boolean>({ type: 'GET_CONNECTION_STATUS' }),
    ]);

    if (balResp.success) setBalance(balResp.data);
    if (txResp.success) setTxs(txResp.data.slice(0, 5));
    if (connResp.success) setConnected(connResp.data);

    // Load selected node badge
    const stored = await chrome.storage.local.get('selected_node_id');
    const nodeId = (stored['selected_node_id'] as string) ?? 'own-node';
    const node = KNOWN_NODES.find(n => n.id === nodeId);
    if (node) {
      setNodeBadge(node.badge);
      setNodeName(node.name);
    }

    setLoading(false);
  };

  const checkConnection = async () => {
    const resp = await sendMessage<boolean>({ type: 'GET_CONNECTION_STATUS' });
    if (resp.success) setConnected(resp.data);
  };

  const formatBtc = (sats: number): string => {
    return (sats / 1e8).toFixed(8);
  };

  const formatSats = (sats: number): string => {
    return sats.toLocaleString();
  };

  const truncateTxid = (txid: string): string => {
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      {/* Header */}
      <div className="header">
        <h1>Sovereign</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span className="text-small text-muted">
            {connected ? 'Node' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="container">
        {/* Privacy warning */}
        <PrivacyWarningBanner
          badge={nodeBadge}
          nodeName={nodeName}
          onChangeNode={() => onNavigate('settings')}
        />

        {/* Balance */}
        <div className="card text-center">
          {loading ? (
            <div className="spinner" />
          ) : balance ? (
            <>
              <div className="label">Balance</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>
                {formatBtc(balance.total)} <span className="text-muted" style={{ fontSize: '13px' }}>BTC</span>
              </div>
              <div className="text-secondary text-small mt-8">
                {formatSats(balance.total)} sats
              </div>
              {balance.unconfirmed !== 0 && (
                <div className="text-yellow text-small mt-8">
                  {formatSats(balance.unconfirmed)} unconfirmed sats
                </div>
              )}
            </>
          ) : (
            <div className="text-muted">Error loading balance</div>
          )}
        </div>

        {/* Action buttons */}
        <div className="row">
          <button className="primary" onClick={() => onNavigate('send')}>
            Send
          </button>
          <button onClick={() => onNavigate('receive')}>
            Receive
          </button>
        </div>

        {/* Recent transactions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="mb-8">
            <div className="label" style={{ margin: 0 }}>Recent transactions</div>
            <button
              onClick={() => onNavigate('history')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '10px', padding: 0, cursor: 'pointer' }}
            >
              View all &rarr;
            </button>
          </div>
          <div className="card" style={{ padding: '8px 12px' }}>
            {loading ? (
              <div className="spinner" style={{ margin: '16px auto' }} />
            ) : txs.length === 0 ? (
              <div className="text-muted text-small text-center" style={{ padding: '16px 0' }}>
                No transactions
              </div>
            ) : (
              txs.map((tx) => (
                <div className="tx-item" key={tx.txid}>
                  <div>
                    <div className="text-small" style={{ fontFamily: 'var(--font-mono)' }}>
                      {truncateTxid(tx.txid)}
                    </div>
                    <div className="text-small text-muted">
                      {tx.confirmed ? `Block ${tx.height}` : 'Pending'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-small ${tx.amount >= 0 ? 'text-green' : 'text-red'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatSats(tx.amount)} sats
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="nav-tabs">
        <button className="active">Wallet</button>
        <button onClick={() => onNavigate('send')}>Send</button>
        <button onClick={() => onNavigate('receive')}>Receive</button>
        <button onClick={() => onNavigate('utxomap')}>UTXOs</button>
        <button onClick={() => onNavigate('familynode')}>Node</button>
        <button onClick={() => onNavigate('settings')}>Settings</button>
      </div>
    </div>
  );
}
