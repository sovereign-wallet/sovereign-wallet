import { useState } from 'react';
import type { NodeBadge } from '../../config/nodes';

interface PrivacyWarningBannerProps {
  badge: NodeBadge;
  nodeName: string;
  warningText?: string;
  onChangeNode: () => void;
}

export default function PrivacyWarningBanner({ badge, nodeName, warningText, onChangeNode }: PrivacyWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (badge === 'own' || badge === 'custom') return null;

  const isPublic = badge === 'public';
  const borderColor = isPublic ? 'rgba(255, 51, 51, 0.3)' : 'rgba(255, 204, 0, 0.3)';
  const bgColor = isPublic ? 'rgba(255, 51, 51, 0.06)' : 'rgba(255, 204, 0, 0.06)';
  const textColor = isPublic ? 'var(--red)' : 'var(--yellow)';

  const defaultMsg = isPublic
    ? `Connected to ${nodeName}. This node can see your Bitcoin addresses.`
    : `Connected to developer node. Your addresses are visible to the developer.`;

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius)',
      padding: '8px 12px',
      fontSize: '11px',
      color: textColor,
      lineHeight: 1.6,
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: '14px', lineHeight: 1 }}>&#9888;</span>
      <div style={{ flex: 1 }}>
        <div>{warningText ?? defaultMsg}</div>
        <div style={{ marginTop: '4px', display: 'flex', gap: '12px' }}>
          <span
            onClick={onChangeNode}
            style={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
          >
            Change node
          </span>
          <span
            onClick={() => setDismissed(true)}
            style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            Dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
