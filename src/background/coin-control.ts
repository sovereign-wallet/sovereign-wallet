import type { UTXOData } from '../types/messages';

// ── Types ──

export interface UTXOSelection {
  utxos: UTXOData[];
  totalInput: number;
  change: number;
  fee: number;
}

export interface ValidationResult {
  valid: boolean;
  totalInput: number;
  totalNeeded: number;
  fee: number;
  change: number;
  error?: string;
}

// ── Fee estimation ──

function estimateFee(inputCount: number, outputCount: number, feeRate: number): number {
  // P2WPKH: ~10.5 overhead + 68 per input + 31 per output
  const vsize = Math.ceil(10.5 + 68 * inputCount + 31 * outputCount);
  return Math.ceil(vsize * feeRate);
}

// ── Branch and Bound ──

function branchAndBound(
  utxos: UTXOData[],
  target: number,
  feeRate: number,
): UTXOData[] | null {
  const MAX_TRIES = 100_000;
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const feePerInput = Math.ceil(68 * feeRate);
  const costOfChange = Math.ceil(99 * feeRate); // output + future spend

  let bestSelection: UTXOData[] | null = null;
  let bestWaste = Infinity;
  let tries = 0;

  function search(index: number, selected: UTXOData[], currentValue: number): void {
    if (tries++ > MAX_TRIES) return;

    const effectiveTarget = target + estimateFee(selected.length, 2, feeRate);

    if (currentValue >= effectiveTarget) {
      const waste = currentValue - effectiveTarget;
      if (waste < costOfChange && waste < bestWaste) {
        bestWaste = waste;
        bestSelection = [...selected];
      }
      return;
    }

    if (index >= sorted.length) return;

    // Remaining value check
    let remaining = 0;
    for (let i = index; i < sorted.length; i++) {
      remaining += sorted[i]!.value;
    }
    if (currentValue + remaining < effectiveTarget) return;

    // Include
    selected.push(sorted[index]!);
    search(index + 1, selected, currentValue + sorted[index]!.value);
    selected.pop();

    // Exclude
    search(index + 1, selected, currentValue);
  }

  search(0, [], 0);
  return bestSelection;
}

// ── Largest-first fallback ──

function largestFirst(
  utxos: UTXOData[],
  target: number,
  feeRate: number,
): UTXOData[] {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: UTXOData[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.value;
    const fee = estimateFee(selected.length, 2, feeRate);
    if (total >= target + fee) break;
  }

  return selected;
}

// ── Public API ──

export function selectUTXOs(
  available: UTXOData[],
  target: number,
  feeRate: number,
): UTXOSelection {
  if (available.length === 0) {
    return { utxos: [], totalInput: 0, change: 0, fee: 0 };
  }

  // Try Branch and Bound first (minimizes change)
  const bnb = branchAndBound(available, target, feeRate);
  const selected = bnb ?? largestFirst(available, target, feeRate);

  const totalInput = selected.reduce((sum, u) => sum + u.value, 0);
  const fee = estimateFee(selected.length, 2, feeRate);
  const change = totalInput - target - fee;

  return {
    utxos: selected,
    totalInput,
    change: Math.max(0, change),
    fee,
  };
}

export function validateSelection(
  utxos: UTXOData[],
  target: number,
  feeRate: number,
): ValidationResult {
  const totalInput = utxos.reduce((sum, u) => sum + u.value, 0);
  const outputCount = 2; // destination + change
  const fee = estimateFee(utxos.length, outputCount, feeRate);
  const totalNeeded = target + fee;
  const change = totalInput - totalNeeded;

  if (totalInput < totalNeeded) {
    return {
      valid: false,
      totalInput,
      totalNeeded,
      fee,
      change: 0,
      error: `Missing ${(totalNeeded - totalInput).toLocaleString()} sats. Select more UTXOs.`,
    };
  }

  const DUST_THRESHOLD = 546;
  if (change > 0 && change < DUST_THRESHOLD) {
    return {
      valid: true,
      totalInput,
      totalNeeded,
      fee: fee + change, // change donated to miners
      change: 0,
    };
  }

  return {
    valid: true,
    totalInput,
    totalNeeded,
    fee,
    change: Math.max(0, change),
  };
}
