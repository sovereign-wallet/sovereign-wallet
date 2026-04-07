import { useState } from 'react';
import { sendMessage } from '../../types/messages';

interface PSBTExchangeProps {
  psbtBase64: string;
  device: string;
  onBroadcast: (txid: string) => void;
  onCancel: () => void;
}

export default function PSBTExchange({ psbtBase64, device, onBroadcast, onCancel }: PSBTExchangeProps) {
  const [step, setStep] = useState<'export' | 'import'>('export');
  const [signedPsbt, setSignedPsbt] = useState('');
  const [error, setError] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [copied, setCopied] = useState(false);

  const downloadPSBT = () => {
    const binary = atob(psbtBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign-tx-${Date.now()}.psbt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPSBT = async () => {
    await navigator.clipboard.writeText(psbtBase64);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      setSignedPsbt(btoa(binary));
      setError('');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBroadcast = async () => {
    if (!signedPsbt) {
      setError('Paste or upload the signed PSBT first.');
      return;
    }

    setError('');
    setBroadcasting(true);

    const resp = await sendMessage<{ txid: string }>({
      type: 'BROADCAST_SIGNED_PSBT',
      psbtBase64: signedPsbt,
    });

    setBroadcasting(false);

    if (resp.success) {
      onBroadcast(resp.data.txid);
    } else {
      setError(resp.error);
    }
  };

  const deviceName = device === 'coldcard' ? 'Coldcard' : device === 'keystone' ? 'Keystone' : 'hardware wallet';

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        {step === 'export' && (
          <>
            <h2 style={{ fontSize: '13px', color: 'var(--accent)', marginBottom: '12px' }}>
              Sign with {deviceName}
            </h2>

            <div className="text-small text-secondary" style={{ lineHeight: 1.6, marginBottom: '12px' }}>
              1. Download the PSBT file below<br />
              2. Transfer it to your {deviceName}
              {device === 'coldcard' ? ' via microSD card' : ''}<br />
              3. Sign it on the device<br />
              4. Bring the signed file back and upload it
            </div>

            <div className="row" style={{ marginBottom: '12px' }}>
              <button onClick={downloadPSBT} className="primary">
                Download .psbt
              </button>
              <button onClick={copyPSBT}>
                {copied ? 'Copied' : 'Copy base64'}
              </button>
            </div>

            <button className="full" onClick={() => setStep('import')}>
              I signed it, next &rarr;
            </button>

            <button
              onClick={onCancel}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', marginTop: '8px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </>
        )}

        {step === 'import' && (
          <>
            <h2 style={{ fontSize: '13px', color: 'var(--accent)', marginBottom: '12px' }}>
              Upload signed PSBT
            </h2>

            <div className="text-small text-secondary" style={{ marginBottom: '12px' }}>
              Upload the signed PSBT file from your {deviceName}, or paste the base64 content.
            </div>

            {/* File upload */}
            <div style={{ marginBottom: '8px' }}>
              <input
                type="file"
                accept=".psbt,.txn"
                onChange={handleFileUpload}
                style={{ fontSize: '11px', width: '100%' }}
              />
            </div>

            <div className="text-muted text-small text-center" style={{ margin: '4px 0' }}>or</div>

            {/* Paste base64 */}
            <textarea
              value={signedPsbt}
              onChange={(e) => { setSignedPsbt(e.target.value); setError(''); }}
              placeholder="Paste signed PSBT base64..."
              rows={4}
              spellCheck={false}
              style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '10px', marginBottom: '8px' }}
            />

            {error && <p className="text-red text-small" style={{ marginBottom: '8px' }}>{error}</p>}

            <div className="row">
              <button onClick={() => { setStep('export'); setSignedPsbt(''); setError(''); }}>
                &larr; Back
              </button>
              <button className="primary" onClick={handleBroadcast} disabled={broadcasting || !signedPsbt}>
                {broadcasting ? 'Broadcasting...' : 'Broadcast transaction'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
