import { useState } from 'react';
import type { PrivacyAnalysis } from '../../types/messages';

interface PrivacyScoreProps {
  analysis: PrivacyAnalysis;
  compact?: boolean;
}

function getScoreColor(score: number): string {
  if (score >= 71) return 'var(--green)';
  if (score >= 41) return 'var(--yellow)';
  return 'var(--red)';
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'high': return '!!';
    case 'medium': return '!';
    case 'low': return '~';
    default: return '-';
  }
}

export default function PrivacyScore({ analysis, compact = false }: PrivacyScoreProps) {
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const color = getScoreColor(analysis.score);

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="36" height="36" viewBox="0 0 36 36">
          {/* Background circle */}
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          {/* Score arc */}
          <circle
            cx="18" cy="18" r="15"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${(analysis.score / 100) * 94.2} 94.2`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
          {/* Score text */}
          <text
            x="18" y="19"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="10"
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {analysis.score}
          </text>
        </svg>
        <div>
          <div className="text-small" style={{ color }}>
            Privacy Score
          </div>
          {analysis.issues.length > 0 && (
            <div className="text-small text-muted">
              {analysis.issues.length} issue{analysis.issues.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '12px' }}>
      {/* Score circle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          {/* Background circle */}
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke="var(--border)"
            strokeWidth="4"
          />
          {/* Score arc */}
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={`${(analysis.score / 100) * 213.6} 213.6`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
          />
          {/* Score text */}
          <text
            x="40" y="38"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="24"
            fontFamily="var(--font-mono)"
            fontWeight="700"
          >
            {analysis.score}
          </text>
          <text
            x="40" y="52"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize="8"
            fontFamily="var(--font-mono)"
          >
            / 100
          </text>
        </svg>
      </div>

      {/* Issues */}
      {analysis.issues.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div className="label mb-8">Issues detected</div>
          {analysis.issues.map((issue, i) => {
            const isExpanded = expandedIssue === i;
            const sevColor = issue.severity === 'high' ? 'var(--red)'
              : issue.severity === 'medium' ? 'var(--yellow)'
                : 'var(--text-muted)';

            return (
              <div
                key={i}
                style={{
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedIssue(isExpanded ? null : i)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: sevColor,
                    minWidth: '16px',
                  }}>
                    {getSeverityIcon(issue.severity)}
                  </span>
                  <span className="text-small">{issue.title}</span>
                  <span className="text-muted" style={{ marginLeft: 'auto', fontSize: '10px' }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ marginLeft: '22px', marginTop: '6px' }}>
                    <div className="text-small text-secondary" style={{ lineHeight: 1.6 }}>
                      {issue.explanation}
                    </div>
                    <div className="text-small text-accent" style={{ marginTop: '4px' }}>
                      {issue.suggestion}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bonuses */}
      {analysis.bonuses.length > 0 && (
        <div>
          <div className="label mb-8">Bonuses</div>
          {analysis.bonuses.map((bonus, i) => (
            <div key={i} className="text-small text-green" style={{ padding: '2px 0' }}>
              + {bonus}
            </div>
          ))}
        </div>
      )}

      {/* Suggestions summary */}
      {analysis.score < 40 && (
        <div className="warning" style={{ marginTop: '8px' }}>
          Low score. Consider using Stonewall or Ricochet, or select UTXOs from the same origin with Coin Control.
        </div>
      )}
    </div>
  );
}
