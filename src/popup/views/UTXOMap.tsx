import { useState, useEffect, useRef, useCallback } from 'react';
import { sendMessage } from '../../types/messages';
import type { UTXOData } from '../../types/messages';
import type { UTXOLabel, UTXOOrigin } from '../../background/utxo-labels';

interface UTXOMapProps {
  onBack: () => void;
}

const ORIGIN_COLORS: Record<string, string> = {
  mined: '#00cc66',
  p2p: '#ffcc00',
  exchange: '#ff3333',
  mixed: '#6699ff',
  unknown: '#555555',
};

const ORIGIN_LABELS: Record<string, string> = {
  mined: 'Mined',
  p2p: 'P2P',
  exchange: 'Exchange',
  mixed: 'Mixed',
  unknown: 'Unlabeled',
};

interface Circle {
  x: number;
  y: number;
  radius: number;
  utxo: UTXOData;
  label: UTXOLabel | null;
  color: string;
}

export default function UTXOMap({ onBack }: UTXOMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [utxos, setUtxos] = useState<UTXOData[]>([]);
  const [labels, setLabels] = useState<Map<string, UTXOLabel>>(new Map());
  const [circles, setCircles] = useState<Circle[]>([]);
  const [selectedUtxo, setSelectedUtxo] = useState<Circle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editLabel, setEditLabel] = useState('');
  const [editOrigin, setEditOrigin] = useState<UTXOOrigin>('unknown');
  const [editNote, setEditNote] = useState('');

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

  // Layout circles in grid
  const layoutCircles = useCallback((
    utxoList: UTXOData[],
    labelMap: Map<string, UTXOLabel>,
    width: number,
    height: number,
  ): Circle[] => {
    if (utxoList.length === 0) return [];

    const maxValue = Math.max(...utxoList.map(u => u.value));
    const minRadius = 8;
    const maxRadius = 30;
    const padding = 6;

    const result: Circle[] = [];
    let x = padding + maxRadius;
    let y = padding + maxRadius;
    let rowHeight = 0;

    for (const utxo of utxoList) {
      const ratio = Math.sqrt(utxo.value / maxValue);
      const radius = minRadius + ratio * (maxRadius - minRadius);

      if (x + radius > width - padding) {
        x = padding + maxRadius;
        y += rowHeight + padding;
        rowHeight = 0;
      }

      const id = `${utxo.txid}:${utxo.vout}`;
      const label = labelMap.get(id) ?? null;
      const origin = label?.origin ?? 'unknown';

      result.push({
        x,
        y,
        radius,
        utxo,
        label,
        color: ORIGIN_COLORS[origin] ?? ORIGIN_COLORS['unknown']!,
      });

      rowHeight = Math.max(rowHeight, radius * 2);
      x += radius * 2 + padding;
    }

    return result;
  }, []);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || utxos.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 348;
    const height = 300;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const laid = layoutCircles(utxos, labels, width, height);
    setCircles(laid);

    for (const circle of laid) {
      // Circle fill
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
      ctx.fillStyle = circle.color + '44'; // semi-transparent
      ctx.fill();

      // Circle border
      ctx.strokeStyle = circle.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Selected highlight
      if (selectedUtxo && selectedUtxo.utxo.txid === circle.utxo.txid && selectedUtxo.utxo.vout === circle.utxo.vout) {
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Value text for large circles
      if (circle.radius > 18) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const display = circle.utxo.value >= 1_000_000
          ? `${(circle.utxo.value / 1_000_000).toFixed(1)}M`
          : circle.utxo.value >= 1_000
            ? `${(circle.utxo.value / 1_000).toFixed(0)}k`
            : `${circle.utxo.value}`;
        ctx.fillText(display, circle.x, circle.y);
      }
    }
  }, [utxos, labels, selectedUtxo, layoutCircles]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const circle of circles) {
      const dx = x - circle.x;
      const dy = y - circle.y;
      if (dx * dx + dy * dy <= circle.radius * circle.radius) {
        setSelectedUtxo(circle);
        setEditLabel(circle.label?.label ?? '');
        setEditOrigin(circle.label?.origin ?? 'unknown');
        setEditNote(circle.label?.note ?? '');
        return;
      }
    }

    setSelectedUtxo(null);
  };

  const handleSaveLabel = async () => {
    if (!selectedUtxo) return;

    await sendMessage({
      type: 'SAVE_LABEL',
      label: {
        txid: selectedUtxo.utxo.txid,
        vout: selectedUtxo.utxo.vout,
        label: editLabel,
        origin: editOrigin,
        note: editNote || undefined,
      },
    });

    // Reload labels
    const resp = await sendMessage<UTXOLabel[]>({ type: 'GET_LABELS' });
    if (resp.success) {
      const map = new Map<string, UTXOLabel>();
      for (const l of resp.data) {
        map.set(`${l.txid}:${l.vout}`, l);
      }
      setLabels(map);
    }

    setSelectedUtxo(null);
  };

  const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>UTXO Map</h1>
        <div />
      </div>

      <div className="container">
        {/* Total */}
        <div className="text-center">
          <span className="text-muted text-small">Total: </span>
          <span style={{ fontWeight: 700 }}>{totalSats.toLocaleString()} sats</span>
          <span className="text-muted text-small"> — {utxos.length} UTXOs</span>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '40px auto' }} />
        ) : utxos.length === 0 ? (
          <div className="text-muted text-center" style={{ padding: '40px' }}>No UTXOs</div>
        ) : (
          <>
            {/* Canvas */}
            <div className="card" style={{ padding: '8px', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                style={{ cursor: 'pointer', display: 'block' }}
              />
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
              {Object.entries(ORIGIN_COLORS).map(([key, color]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                  }} />
                  <span className="text-small text-muted">{ORIGIN_LABELS[key]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* UTXO detail modal */}
      {selectedUtxo && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ fontSize: '12px', color: 'var(--accent)', marginBottom: '12px' }}>UTXO Detail</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
              <div>
                <span className="text-muted">TXID: </span>
                <span style={{ wordBreak: 'break-all' }}>{selectedUtxo.utxo.txid}</span>
              </div>
              <div>
                <span className="text-muted">Vout: </span>
                <span>{selectedUtxo.utxo.vout}</span>
              </div>
              <div>
                <span className="text-muted">Amount: </span>
                <span style={{ fontWeight: 700 }}>{selectedUtxo.utxo.value.toLocaleString()} sats</span>
                <span className="text-muted"> ({(selectedUtxo.utxo.value / 1e8).toFixed(8)} BTC)</span>
              </div>
              <div>
                <span className="text-muted">Address: </span>
                <span style={{ wordBreak: 'break-all' }}>{selectedUtxo.utxo.address}</span>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div className="label">Label</div>
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="e.g. freelance payment"
                  style={{ fontSize: '11px' }}
                />
              </div>

              <div>
                <div className="label">Origin</div>
                <div className="select-group">
                  {(['exchange', 'p2p', 'mined', 'mixed', 'unknown'] as const).map((o) => (
                    <button
                      key={o}
                      className={editOrigin === o ? 'active' : ''}
                      onClick={() => setEditOrigin(o)}
                      style={{ fontSize: '9px', padding: '4px 2px' }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="label">Note</div>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="optional note"
                  style={{ fontSize: '11px' }}
                />
              </div>
            </div>

            <div className="row" style={{ marginTop: '12px' }}>
              <button onClick={() => setSelectedUtxo(null)}>Cancel</button>
              <button className="primary" onClick={handleSaveLabel}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
