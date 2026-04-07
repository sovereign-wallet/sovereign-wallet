import { useState } from 'react';
import { sendMessage } from '../../types/messages';
import type { PrivacyAnalysis } from '../../types/messages';

interface AIAdvisorProps {
  analysis: PrivacyAnalysis;
  mode: 'simple' | 'stonewall' | 'ricochet';
  utxoCount: number;
  destinationType: string;
}

export default function AIAdvisor({ analysis, mode, utxoCount, destinationType }: AIAdvisorProps) {
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const handleAnalyze = async () => {
    setError('');
    setLoading(true);

    const resp = await sendMessage<string>({
      type: 'AI_ANALYZE',
      context: {
        score: analysis.score,
        issues: analysis.issues.map(i => ({ severity: i.severity, title: i.title })),
        utxoCount,
        hasStonewall: mode === 'stonewall',
        hasRicochet: mode === 'ricochet',
        destinationType,
      },
    });

    setLoading(false);

    if (resp.success) {
      setResponse(resp.data);
      setExpanded(true);
    } else {
      setError(resp.error);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      {!response && !loading && (
        <button
          onClick={handleAnalyze}
          style={{
            width: '100%',
            fontSize: '11px',
            padding: '6px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-secondary)',
          }}
        >
          Analyze with AI
        </button>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
          <div className="spinner" style={{ width: '14px', height: '14px' }} />
          <span className="text-small text-muted">Analyzing privacy...</span>
        </div>
      )}

      {error && (
        <div className="text-small text-red" style={{ padding: '4px 0' }}>
          {error}
        </div>
      )}

      {response && (
        <div
          className="card"
          style={{
            padding: '10px 12px',
            borderColor: 'var(--accent)',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-small text-accent" style={{ fontWeight: 700 }}>
              AI Analysis
            </span>
            <span className="text-muted" style={{ fontSize: '10px' }}>
              {expanded ? '▾' : '▸'}
            </span>
          </div>
          {expanded && (
            <div className="text-small text-secondary" style={{ marginTop: '8px', lineHeight: 1.7 }}>
              {response}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
