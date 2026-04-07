import { useState, useEffect } from 'react';
import { sendMessage } from '../../types/messages';
import type { UTXOData } from '../../types/messages';
import type { UTXOLabel } from '../../background/utxo-labels';

interface CoinControlProps {
  target: number; // sats
  feeRate: number;
  selectedUtxos: Set<string>;
  onSelect: (selected: Set<string>) => void;
  onClose: () => void;
}

const ORIGIN_COLORS: Record<string, string> = {
  mined: 'var(--green)',
  p2p: 'var(--yellow)',
  exchange: 'var(--red)',
  mixed: '#6699ff',
  unknown: 'var(--text-muted)',
};

export default function CoinControl({ target, feeRate, selectedUtxos, onSelect, onClose }: CoinControlProps) {
  const [utxos, setUtxos] = useState<UTXOData[]>([]);
  const [labels, setLabels] = useState<Map<string, UTXOLabel>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedUtxos));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [utxoResp, labelsResp] = await Promise.all([
      sendMessage<UTXOData[]>({ type: 'GET_UTXOS' }),
      sendMessage<UTXOLabel[]>({ type: 'GET_LABELS' }),
    ]);

    if (utxoResp.success) {
      setUtxos(utxoResp.data.sort((a, b) => b.value - a.value));
    }
    if (labelsResp.success) {
      const map = new Map<string, UTXOLabel>();
      for (const l of labelsResp.data) {
        map.set(`${l.txid}:${l.vout}`, l);
      }
      setLabels(map);
    }
    setLoading(false);
  };

  const toggleUtxo = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  const selectAll = () => {
    setSelected(new Set(utxos.map(u => `${u.txid}:${u.vout}`)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const autoSelect = async () => {
    const resp = await sendMessage<{ utxos: UTXOData[] }>({
      type: 'AUTO_SELECT_UTXOS',
      target,
      feeRate,
    });
    if (resp.success) {
      setSelected(new Set(resp.data.utxos.map(u => `${u.txid}:${u.vout}`)));
    }
  };

  const handleConfirm = () => {
    onSelect(selected);
    onClose();
  };

  // Calculate totals
  const selectedUtxosList = utxos.filter(u => selected.has(`${u.txid}:${u.vout}`));
  const totalSelected = selectedUtxosList.reduce((sum, u) => sum + u.value, 0);
  const estimatedFee = selected.size > 0
    ? Math.ceil((10.5 + 68 * selected.size + 31 * 2) * feeRate)
    : 0;
  const change = totalSelected - target - estimatedFee;

  const truncateAddr = (addr: string): string => `${addr.slice(0, 10)}...${addr.slice(-6)}`;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxHeight: '540px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '13px', color: 'var(--accent)' }}>COIN CONTROL</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', padding: '0' }}
          >
            &times;
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <button onClick={autoSelect} style={{ fontSize: '10px', padding: '4px 8px' }}>Auto</button>
          <button onClick={selectAll} style={{ fontSize: '10px', padding: '4px 8px' }}>All</button>
          <button onClick={selectNone} style={{ fontSize: '10px', padding: '4px 8px' }}>None</button>
        </div>

        {/* UTXO list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
          {loading ? (
            <div className="spinner" style={{ margin: '20px auto' }} />
          ) : utxos.length === 0 ? (
            <div className="text-muted text-center" style={{ padding: '20px' }}>No UTXOs available</div>
          ) : (
            utxos.map((utxo) => {
              const id = `${utxo.txid}:${utxo.vout}`;
              const label = labels.get(id);
              const isSelected = selected.has(id);
              const originColor = label ? ORIGIN_COLORS[label.origin] ?? 'var(--text-muted)' : 'var(--text-muted)';

              return (
                <label
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 4px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(255, 102, 0, 0.05)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleUtxo(id)}
                    style={{ marginTop: '2px' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-small" style={{ fontFamily: 'var(--font-mono)' }}>
                        {utxo.txid.slice(0, 8)}:{utxo.vout}
                      </span>
                      <span className="text-small" style={{ fontWeight: 600 }}>
                        {utxo.value.toLocaleString()} sats
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span className="text-small text-muted">{truncateAddr(utxo.address)}</span>
                      <span className="text-small" style={{ color: 'var(--text-muted)' }}>
                        {utxo.height > 0 ? `${utxo.height}` : 'pending'}
                      </span>
                    </div>
                    {label && (
                      <div style={{ marginTop: '2px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 6px',
                            borderRadius: '2px',
                            background: originColor,
                            color: '#000',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {label.origin}
                        </span>
                        <span className="text-small text-secondary">{label.label}</span>
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Footer totals */}
        <div className="card" style={{ padding: '8px 12px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Selected:</span>
            <span>{selected.size} UTXOs — {totalSelected.toLocaleString()} sats</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Estimated fee:</span>
            <span>{estimatedFee.toLocaleString()} sats</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-muted">Change:</span>
            <span className={change < 0 ? 'text-red' : ''}>{change.toLocaleString()} sats</span>
          </div>
        </div>

        {change < 0 && (
          <div className="text-red text-small" style={{ marginTop: '4px' }}>
            Insufficient funds. Select more UTXOs.
          </div>
        )}

        <div className="row" style={{ marginTop: '8px' }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleConfirm} disabled={selected.size === 0}>
            Confirm ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
