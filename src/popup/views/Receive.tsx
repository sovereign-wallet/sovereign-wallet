import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { sendMessage } from '../../types/messages';

interface ReceiveProps {
  onBack: () => void;
}

export default function Receive({ onBack }: ReceiveProps) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadAddress();
  }, []);

  useEffect(() => {
    if (address && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, `bitcoin:${address}`, {
        width: 200,
        margin: 2,
        color: {
          dark: '#e0e0e0',
          light: '#111111',
        },
        errorCorrectionLevel: 'M',
      });
    }
  }, [address]);

  const loadAddress = async () => {
    setLoading(true);
    const resp = await sendMessage<string>({ type: 'GET_RECEIVE_ADDRESS' });
    setLoading(false);
    if (resp.success) {
      setAddress(resp.data);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
      <div className="header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '4px' }}>
          &larr; Back
        </button>
        <h1>Receive</h1>
        <div />
      </div>

      <div className="container" style={{ alignItems: 'center' }}>
        {loading ? (
          <div className="spinner" style={{ marginTop: '40px' }} />
        ) : (
          <>
            {/* QR Code */}
            <div className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
              <canvas ref={canvasRef} />
            </div>

            {/* Address */}
            <div
              className="card"
              style={{
                wordBreak: 'break-all',
                fontSize: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                lineHeight: 1.8,
              }}
              onClick={copyAddress}
            >
              {address}
            </div>

            {/* Copy button */}
            <button className="full" onClick={copyAddress}>
              {copied ? 'Copied' : 'Copy address'}
            </button>

            {/* Warning */}
            <div className="warning">
              EVERY ADDRESS IS SINGLE USE. Reusing addresses destroys your privacy
              and the privacy of those who send you bitcoin. Generate a new one for each transaction.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
