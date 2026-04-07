import { getClient, toElectrumScripthash } from './electrum';

// ── Types ──

export type RiskLevel = 'clean' | 'used-once' | 'reused' | 'unknown';

export interface AddressRisk {
  level: RiskLevel;
  label: string;
  txCount: number;
}

// ── Address verification ──

export function checkAddressReuse(
  address: string,
  historyTxCount: number,
): RiskLevel {
  if (historyTxCount === 0) return 'clean';
  if (historyTxCount === 1) return 'used-once';
  return 'reused';
}

export async function getAddressRiskLevel(address: string): Promise<AddressRisk> {
  try {
    const client = getClient();
    if (!client.isConnected()) {
      return { level: 'unknown', label: 'Not connected to node', txCount: 0 };
    }

    const scripthash = await toElectrumScripthash(address);
    const history = await client.getHistory(scripthash);
    const txCount = history.length;
    const level = checkAddressReuse(address, txCount);

    const labels: Record<RiskLevel, string> = {
      clean: 'Fresh address — no history',
      'used-once': 'Used once — received funds before',
      reused: `Reused ${txCount} times — privacy risk`,
      unknown: 'Could not verify',
    };

    return { level, label: labels[level], txCount };
  } catch {
    return { level: 'unknown', label: 'Error verifying address', txCount: 0 };
  }
}
