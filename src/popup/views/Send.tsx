import { useState, useEffect, useCallback } from 'react';
import { sendMessage } from '../../types/messages';
import type { FeeRates, PrivacyAnalysis } from '../../types/messages';
import PrivacyScore from '../components/PrivacyScore';
import CoinControl from './CoinControl';
import AIAdvisor from './AIAdvisor';

interface SendProps {
  onBack: () => void;
}

type FeeLevel = 'slow' | 'normal' | 'fast';
type TxMode = 'simple' | 'stonewall' | 'ricochet';

const MODE_DESCRIPTIONS: Record<TxMode, string> = {
  simple: 'Standard Bitcoin transaction.',
  stonewall: '4 outputs for maximum ambiguity. Higher fee.',
  ricochet: '2 intermediate hops before destination. Higher fee.',
};

export default function Send({ onBack }: SendProps) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [feeLevel, setFeeLevel] = useState<FeeLevel>('normal');
  const [feeRates, setFeeRates] = useState<FeeRates>({ slow: 1, normal: 5, fast: 20 });
  const [mode, setMode] = useState<TxMode>('simple');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCoinControl, setShowCoinControl] = useState(false);
  const [selectedUtxos, setSelectedUtxos] = useState<Set<string>>(new Set());
  const [privacy, setPrivacy] = useState<PrivacyAnalysis | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);

  useEffect(() => {
    loadFeeRates();
  }, []);

  const analyzePrivacy = useCallback(async () => {
    const amountSats = Math.round(parseFloat(amount) * 1e8);
    if (!destination || isNaN(amountSats) || amountSats <= 0) {
      setPrivacy(null);
      return;
    }

    const resp = await sendMessage<PrivacyAnalysis>({
      type: 'ANALYZE_PRIVACY',
      destination,
      amountSats,
      feeRate: feeRates[feeLevel],
      mode,
      selectedUtxos: selectedUtxos.size > 0 ? Array.from(selectedUtxos) : undefined,
    });
    if (resp.success) setPrivacy(resp.data);
  }, [destination, amount, feeLevel, mode, selectedUtxos, feeRates]);

  useEffect(() => {
    const timeout = setTimeout(analyzePrivacy, 500);
    return () => clearTimeout(timeout);
  }, [analyzePrivacy]);

  const loadFeeRates = async () => {
    const resp = await sendMessage<FeeRates>({ type: 'GET_FEE_RATES' });
    if (resp.success) setFeeRates(resp.data);
  };

  const handleSend = async () => {
    setError('');
    setSending(true);

    const amountSats = Math.round(parseFloat(amount) * 1e8);
    const resp = await sendMessage<{ txid: string; fee: number }>({
      type: 'SEND_TRANSACTION',
      destination,
      amountSats,
      feeRate: feeRates[feeLevel],
      mode,
      selectedUtxos: selectedUtxos.size > 0 ? Array.from(selectedUtxos) : undefined,
    });

    setSending(false);
    setShowConfirm(false);

    if (resp.success) {
      setTxResult(resp.data.txid);
    } else {
      setError(resp.error);
    }
  };

  const handleCoinControlSelect = (selected: Set<string>) => {
    setSelectedUtxos(selected);
  };

  const currentFeeRate = feeRates[feeLevel];
  const amountSats = Math.round(parseFloat(amount) * 1e8);
  const canSend = destination && amount && !isNaN(amountSats) && amountSats > 0;
  const lowPrivacy = privacy && privacy.score < 40;

  const detectDestType = (): string => {
    if (destination.startsWith('sp1')) return 'silent';
    if (destination.startsWith('bc1p')) return 'p2tr';
    if (destination.startsWith('bc1q')) return 'p2wpkh';
    if (destination.startsWith('3')) return 'p2sh';
    if (destination.startsWith('1')) return 'p2pkh';
    if (destination.length > 80) return 'paynym'; // payment codes are long
    return 'unknown';
  };

  const destType = detectDestType();
  const isSilent = destType === 'silent';
  const isPayNym = destType === 'paynym';

  // Success screen
  if (txResult) {
    return (
      <div className="container" style={{ justifyContent: 'center', minHeight: '560px' }}>
        <div className="text-center">
          <div style={{ fontSize: '48px', color: 'var(--green)', marginBottom: '16px' }}>&#10003;</div>
          <p style={{ fontWeight: 700 }}>Transaction sent</p>
          <div className="card mt-16" style={{ wordBreak: 'break-all', fontSize: '11px' }}>
            {txResult}
          </div>
          <button className="full mt-16" onClick={onBack}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Send</h1>
        <div />
      </div>

      <div className="container">
        {/* Destination */}
        <div>
          <div className="label">Destination</div>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="bc1q..."
            spellCheck={false}
          />
        </div>

        {/* Amount */}
        <div>
          <div className="label">Amount (BTC)</div>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00000000"
          />
        </div>

        {/* Fee selector */}
        <div>
          <div className="label">Fee ({currentFeeRate} sat/vB)</div>
          <div className="select-group">
            {(['slow', 'normal', 'fast'] as const).map((level) => (
              <button
                key={level}
                className={feeLevel === level ? 'active' : ''}
                onClick={() => setFeeLevel(level)}
              >
                {level === 'slow' ? 'Slow' : level === 'normal' ? 'Normal' : 'Fast'}
                <br />
                <span style={{ fontSize: '9px', opacity: 0.7 }}>{feeRates[level]} sat/vB</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mode indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '2px',
              background: mode === 'simple' ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: mode === 'simple' ? 'var(--text-secondary)' : '#000',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {mode}
          </span>
          <span className="text-small text-muted">{MODE_DESCRIPTIONS[mode]}</span>
        </div>

        {/* Privacy Score - real time */}
        {privacy && <PrivacyScore analysis={privacy} compact />}

        {/* Low privacy warning */}
        {lowPrivacy && (
          <div className="warning">
            Low Privacy Score ({privacy.score}/100). Consider using Stonewall, Ricochet or Coin Control before sending.
          </div>
        )}

        {/* Advanced options */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', padding: '0', textAlign: 'left' }}
        >
          {showAdvanced ? '▾' : '▸'} Advanced
        </button>

        {showAdvanced && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Mode selector */}
            <div>
              <div className="label">Transaction mode</div>
              <div className="select-group">
                {(['simple', 'stonewall', 'ricochet'] as const).map((m) => (
                  <button
                    key={m}
                    className={mode === m ? 'active' : ''}
                    onClick={() => setMode(m)}
                  >
                    {m === 'simple' ? 'Simple' : m === 'stonewall' ? 'Stonewall' : 'Ricochet'}
                  </button>
                ))}
              </div>
            </div>

            {/* Coin Control button */}
            <button onClick={() => setShowCoinControl(true)}>
              Coin Control
              {selectedUtxos.size > 0 && (
                <span style={{ marginLeft: '6px', color: 'var(--accent)' }}>
                  ({selectedUtxos.size} selected)
                </span>
              )}
            </button>

            {/* Full privacy analysis */}
            {privacy && <PrivacyScore analysis={privacy} />}

            {/* AI Advisor */}
            {privacy && (
              <AIAdvisor
                analysis={privacy}
                mode={mode}
                utxoCount={selectedUtxos.size || 1}
                destinationType={destType}
              />
            )}
          </div>
        )}

        {/* Silent payment / PayNym indicator */}
        {(isSilent || isPayNym) && (
          <div className="card" style={{ padding: '8px 12px' }}>
            <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {isSilent ? 'SILENT PAYMENT' : 'PAYNYM'}
            </span>
            <span className="text-small text-muted" style={{ marginLeft: '8px' }}>
              {isSilent ? 'Unique Taproot output generated via ECDH' : 'BIP47 notification will be sent first'}
            </span>
          </div>
        )}

        {error && <p className="text-red text-small">{error}</p>}

        <button
          className="primary full"
          onClick={() => setShowConfirm(true)}
          disabled={!canSend}
        >
          Review transaction
        </button>
      </div>

      {/* Coin Control modal */}
      {showCoinControl && (
        <CoinControl
          target={isNaN(amountSats) ? 0 : amountSats}
          feeRate={currentFeeRate}
          selectedUtxos={selectedUtxos}
          onSelect={handleCoinControlSelect}
          onClose={() => setShowCoinControl(false)}
        />
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent)' }}>
              Confirm send
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div className="label">Destination</div>
                <div className="text-small" style={{ wordBreak: 'break-all' }}>{destination}</div>
              </div>
              <div>
                <div className="label">Amount</div>
                <div>{amount} BTC</div>
              </div>
              <div>
                <div className="label">Fee rate</div>
                <div className="text-small">{currentFeeRate} sat/vB ({feeLevel})</div>
              </div>
              <div>
                <div className="label">Mode</div>
                <div className="text-small" style={{ textTransform: 'uppercase' }}>{mode}</div>
              </div>
              {selectedUtxos.size > 0 && (
                <div>
                  <div className="label">Coin Control</div>
                  <div className="text-small">{selectedUtxos.size} UTXOs selected</div>
                </div>
              )}
              {privacy && (
                <div>
                  <div className="label">Privacy</div>
                  <PrivacyScore analysis={privacy} compact />
                </div>
              )}
            </div>

            {lowPrivacy && (
              <div className="warning" style={{ marginTop: '12px' }}>
                You are sending with a Privacy Score of {privacy?.score}/100.
              </div>
            )}

            <div className="row mt-16">
              <button onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
