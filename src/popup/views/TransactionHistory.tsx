import { useState, useEffect } from 'react';
import { sendMessage } from '../../types/messages';
import type { TransactionRecord } from '../../types/messages';

interface TransactionHistoryProps {
  onBack: () => void;
}

type Filter = 'all' | 'sent' | 'received' | 'pending';
const PAGE_SIZE = 20;

export default function TransactionHistory({ onBack }: TransactionHistoryProps) {
  const [txs, setTxs] = useState<TransactionRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    const resp = await sendMessage<TransactionRecord[]>({ type: 'GET_TRANSACTION_HISTORY' });
    if (resp.success) setTxs(resp.data);
    setLoading(false);
  };

  const filtered = txs.filter(tx => {
    if (filter === 'sent' && tx.amount >= 0) return false;
    if (filter === 'received' && tx.amount < 0) return false;
    if (filter === 'pending' && tx.confirmed) return false;
    if (search && !tx.txid.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatDate = (ts: number): string => {
    if (ts <= 0) return 'Pending';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const exportCSV = () => {
    const header = 'txid,height,timestamp,amount_sats,fee_sats,confirmed\n';
    const rows = txs.map(tx =>
      `${tx.txid},${tx.height},${tx.timestamp},${tx.amount},${tx.fee},${tx.confirmed}`
    ).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign-wallet-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>History</h1>
        <button onClick={exportCSV} style={{ fontSize: '9px', padding: '4px 8px' }}>CSV</button>
      </div>

      <div className="container" style={{ gap: '8px' }}>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by txid..."
          style={{ fontSize: '11px' }}
          spellCheck={false}
        />

        {/* Filters */}
        <div className="select-group">
          {(['all', 'sent', 'received', 'pending'] as const).map((f) => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => { setFilter(f); setPage(0); }}
              style={{ fontSize: '10px' }}
            >
              {f === 'all' ? 'All' : f === 'sent' ? 'Sent' : f === 'received' ? 'Received' : 'Pending'}
            </button>
          ))}
        </div>

        {/* Count */}
        <div className="text-muted text-small">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Transaction list */}
        {loading ? (
          <div className="spinner" style={{ margin: '20px auto' }} />
        ) : paged.length === 0 ? (
          <div className="text-muted text-center" style={{ padding: '20px' }}>No results</div>
        ) : (
          <div className="card" style={{ padding: '4px 8px' }}>
            {paged.map(tx => (
              <div
                key={tx.txid}
                className="tx-item"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedTx(tx)}
              >
                <div>
                  <div className="text-small" style={{ fontFamily: 'var(--font-mono)' }}>
                    {tx.txid.slice(0, 10)}...{tx.txid.slice(-6)}
                  </div>
                  <div className="text-small text-muted">
                    {formatDate(tx.timestamp)} — {tx.confirmed ? `Block ${tx.height}` : 'Pending'}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-small ${tx.amount >= 0 ? 'text-green' : 'text-red'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()} sats
                  </div>
                  {tx.fee > 0 && (
                    <div className="text-small text-muted">fee: {tx.fee}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ fontSize: '10px', padding: '4px 8px' }}
            >
              &larr;
            </button>
            <span className="text-small text-muted">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ fontSize: '10px', padding: '4px 8px' }}
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      {/* Transaction detail modal */}
      {selectedTx && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '12px' }}>Detail</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div>
                <span className="text-muted">TXID: </span>
                <span style={{ wordBreak: 'break-all', fontSize: '10px' }}>{selectedTx.txid}</span>
              </div>
              <div>
                <span className="text-muted">Amount: </span>
                <span className={selectedTx.amount >= 0 ? 'text-green' : 'text-red'}>
                  {selectedTx.amount >= 0 ? '+' : ''}{selectedTx.amount.toLocaleString()} sats
                </span>
              </div>
              <div>
                <span className="text-muted">Fee: </span>
                <span>{selectedTx.fee.toLocaleString()} sats</span>
              </div>
              <div>
                <span className="text-muted">Status: </span>
                <span className={selectedTx.confirmed ? 'text-green' : 'text-yellow'}>
                  {selectedTx.confirmed ? `Confirmed (block ${selectedTx.height})` : 'Pending'}
                </span>
              </div>
              <div>
                <span className="text-muted">Date: </span>
                <span>{formatDate(selectedTx.timestamp)}</span>
              </div>
            </div>

            <button className="full mt-16" onClick={() => setSelectedTx(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
