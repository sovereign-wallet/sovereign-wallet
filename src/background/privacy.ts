import type { UTXOData, PrivacyAnalysis, PrivacyIssue } from '../types/messages';

interface AnalyzeParams {
  inputs: UTXOData[];
  outputs: Array<{ address: string; value: number }>;
  mode: 'simple' | 'stonewall' | 'ricochet';
  destination: string;
  amountSats: number;
  fee: number;
  labels?: Map<string, string>;
  usedAddresses?: Set<string>;
  nodeUrl?: string;
}

export function analyzeTransaction(params: AnalyzeParams): PrivacyAnalysis {
  const { inputs, outputs, mode, destination, amountSats, fee, labels, usedAddresses, nodeUrl } = params;

  let score = 100;
  const issues: PrivacyIssue[] = [];
  const bonuses: string[] = [];

  // ── Penalties ──

  // -30: Address reuse
  const inputAddresses = new Set(inputs.map(i => i.address));
  const outputAddresses = outputs.map(o => o.address);
  const reusedAddresses = outputAddresses.filter(a => inputAddresses.has(a));
  if (reusedAddresses.length > 0) {
    score -= 30;
    issues.push({
      severity: 'high',
      title: 'Address reuse',
      explanation: 'An output address matches an input address. This directly links your funds.',
      suggestion: 'Always use fresh addresses for change outputs.',
    });
  }

  // -25: Input merging from different origins
  if (inputs.length > 1 && labels) {
    const origins = new Set<string>();
    for (const input of inputs) {
      const label = labels.get(input.address);
      if (label) origins.add(label);
    }
    if (origins.size > 1) {
      score -= 25;
      issues.push({
        severity: 'high',
        title: 'Mixed origins',
        explanation: `You are combining UTXOs from ${origins.size} different origins in one transaction. This links those funds together.`,
        suggestion: 'Use coin control to select UTXOs from the same origin.',
      });
    }
  } else if (inputs.length > 1) {
    const uniqueInputAddrs = new Set(inputs.map(i => i.address));
    if (uniqueInputAddrs.size > 1) {
      score -= 25;
      issues.push({
        severity: 'high',
        title: 'Input merging',
        explanation: `You are using ${uniqueInputAddrs.size} different addresses as inputs. An observer can assume they all belong to you.`,
        suggestion: 'Use coin control to send from a single address, or use Stonewall to add ambiguity.',
      });
    }
  }

  // -20: Obvious change output
  const nonDestOutputs = outputs.filter(o => o.address !== destination);
  if (nonDestOutputs.length === 1 && outputs.length === 2) {
    const changeOutput = nonDestOutputs[0]!;
    const paymentOutput = outputs.find(o => o.address === destination);
    if (paymentOutput) {
      const ratio = changeOutput.value / paymentOutput.value;
      if (ratio > 5 || ratio < 0.2) {
        score -= 20;
        issues.push({
          severity: 'medium',
          title: 'Obvious change',
          explanation: 'The difference between the payment and change amounts makes it easy to identify which is which.',
          suggestion: 'Consider using Stonewall to create multiple outputs and complicate analysis.',
        });
      }
    }
  }

  // -15: Round amount
  if (amountSats % 100_000 === 0 || amountSats % 1_000_000 === 0) {
    score -= 15;
    issues.push({
      severity: 'medium',
      title: 'Round amount',
      explanation: 'Sending round amounts makes it easier to identify the payment vs change output.',
      suggestion: 'Add a random number of satoshis to the amount.',
    });
  }

  // -10: Single input
  if (inputs.length === 1 && mode === 'simple') {
    score -= 10;
    issues.push({
      severity: 'low',
      title: 'Single input',
      explanation: 'With a single input, the entire transaction is linked to one address.',
      suggestion: 'This is not always avoidable, but Stonewall can add ambiguity.',
    });
  }

  // -15: UTXO consolidation (spending many small UTXOs)
  if (inputs.length >= 5) {
    score -= 15;
    issues.push({
      severity: 'medium',
      title: 'UTXO consolidation',
      explanation: `You are spending ${inputs.length} UTXOs together. This consolidation pattern enables fingerprinting and reveals that all addresses belong to you.`,
      suggestion: 'Avoid consolidating many UTXOs in a single transaction. Send in smaller batches over time.',
    });
  }

  // -20: Change address reuse
  if (usedAddresses) {
    const changeAddresses = nonDestOutputs.map(o => o.address);
    const reusedChange = changeAddresses.filter(a => usedAddresses.has(a));
    if (reusedChange.length > 0) {
      score -= 20;
      issues.push({
        severity: 'high',
        title: 'Change address reuse',
        explanation: 'The change address was already used before. This links this transaction to previous activity.',
        suggestion: 'Always use fresh change addresses. If you see this error repeatedly, there may be a derivation bug.',
      });
    }
  }

  // ── Bonuses ──

  if (mode === 'stonewall') {
    score += 20;
    bonuses.push('Stonewall: multiple outputs complicate transaction analysis.');
  }

  if (mode === 'ricochet') {
    score += 15;
    bonuses.push('Ricochet: intermediate hops break direct traceability.');
  }

  if (fee % 100 !== 0 && fee % 1000 !== 0) {
    score += 10;
    bonuses.push('Non-round fee: makes fee fingerprinting harder.');
  }

  const hasTaproot = outputs.some(o => o.address.startsWith('bc1p'));
  if (hasTaproot) {
    score += 10;
    bonuses.push('Taproot output: improves anonymity set.');
  }

  if (nodeUrl && nodeUrl.includes('.onion')) {
    score += 5;
    bonuses.push('Tor connection: your node does not reveal your IP to the network.');
  }

  score = Math.max(0, Math.min(100, score));

  return { score, issues, bonuses };
}
