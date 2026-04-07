import type { UTXOData } from '../types/messages';

// ── Dust attack detection ──

const DUST_THRESHOLD = 546; // sats

export interface DustAnalysis {
  isDust: boolean;
  reason: string;
}

export function isDustAttack(utxo: UTXOData, knownAddresses: Set<string>): DustAnalysis {
  // Not dust if value is above threshold
  if (utxo.value > DUST_THRESHOLD) {
    return { isDust: false, reason: '' };
  }

  // Dust from our own wallet is less suspicious
  if (knownAddresses.has(utxo.address)) {
    return { isDust: false, reason: '' };
  }

  return {
    isDust: true,
    reason: `UTXO de ${utxo.value} sats recibido en ${utxo.address.slice(0, 12)}... — posible dust attack para rastreo.`,
  };
}

export function filterDustUTXOs(
  utxos: UTXOData[],
  knownAddresses: Set<string>,
): { clean: UTXOData[]; dust: UTXOData[] } {
  const clean: UTXOData[] = [];
  const dust: UTXOData[] = [];

  for (const utxo of utxos) {
    const analysis = isDustAttack(utxo, knownAddresses);
    if (analysis.isDust) {
      dust.push(utxo);
    } else {
      clean.push(utxo);
    }
  }

  return { clean, dust };
}

export function getDustWarnings(utxos: UTXOData[], knownAddresses: Set<string>): string[] {
  const warnings: string[] = [];
  const { dust } = filterDustUTXOs(utxos, knownAddresses);

  if (dust.length > 0) {
    const totalDust = dust.reduce((sum, u) => sum + u.value, 0);
    warnings.push(
      `${dust.length} UTXO${dust.length > 1 ? 's' : ''} sospechoso${dust.length > 1 ? 's' : ''} de dust attack (${totalDust} sats total). No los gastes — pueden usarse para rastrearte.`
    );
  }

  return warnings;
}
