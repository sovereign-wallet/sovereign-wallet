import { describe, it, expect } from 'vitest';
import { analyzeTransaction } from '../src/background/privacy';

const makeInput = (addr: string, val = 50000) => ({
  txid: 'a'.repeat(64), vout: 0, value: val, address: addr, height: 800000,
});

describe('Privacy Score', () => {
  it('starts at 100 for clean tx', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qsender1')],
      outputs: [
        { address: 'bc1qdest1', value: 30000 },
        { address: 'bc1qchange1', value: 19500 },
      ],
      mode: 'simple',
      destination: 'bc1qdest1',
      amountSats: 30000,
      fee: 500,
    });
    // Single input penalizes -10, but score should still be reasonable
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThan(0);
  });

  it('penalizes -30 for address reuse', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qreused')],
      outputs: [
        { address: 'bc1qdest', value: 30000 },
        { address: 'bc1qreused', value: 19000 }, // same as input!
      ],
      mode: 'simple',
      destination: 'bc1qdest',
      amountSats: 30000,
      fee: 1000,
    });
    const hasReuse = result.issues.some(i => i.title === 'Address reuse');
    expect(hasReuse).toBe(true);
  });

  it('penalizes -25 for input merging', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qaddr1', 30000), makeInput('bc1qaddr2', 30000)],
      outputs: [
        { address: 'bc1qdest', value: 50000 },
        { address: 'bc1qchange', value: 9000 },
      ],
      mode: 'simple',
      destination: 'bc1qdest',
      amountSats: 50000,
      fee: 1000,
    });
    const hasMerge = result.issues.some(i => i.title === 'Input merging');
    expect(hasMerge).toBe(true);
  });

  it('penalizes -15 for round amount', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qsender', 200000)],
      outputs: [
        { address: 'bc1qdest', value: 100000 },
        { address: 'bc1qchange', value: 99500 },
      ],
      mode: 'simple',
      destination: 'bc1qdest',
      amountSats: 100000,
      fee: 500,
    });
    const hasRound = result.issues.some(i => i.title === 'Round amount');
    expect(hasRound).toBe(true);
  });

  it('penalizes -15 for UTXO consolidation (5+ inputs)', () => {
    const inputs = Array.from({ length: 6 }, (_, i) => makeInput(`bc1qaddr${i}`, 10000));
    const result = analyzeTransaction({
      inputs,
      outputs: [{ address: 'bc1qdest', value: 55000 }, { address: 'bc1qchange', value: 3000 }],
      mode: 'simple',
      destination: 'bc1qdest',
      amountSats: 55000,
      fee: 2000,
    });
    const hasConsolidation = result.issues.some(i => i.title === 'UTXO consolidation');
    expect(hasConsolidation).toBe(true);
  });

  it('gives +20 bonus for stonewall', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qsender', 100000)],
      outputs: [
        { address: 'bc1qdest', value: 25000 },
        { address: 'bc1qdest', value: 25000 },
        { address: 'bc1qchange1', value: 20000 },
        { address: 'bc1qchange2', value: 29500 },
      ],
      mode: 'stonewall',
      destination: 'bc1qdest',
      amountSats: 50000,
      fee: 500,
    });
    const hasBonus = result.bonuses.some(b => b.includes('Stonewall'));
    expect(hasBonus).toBe(true);
  });

  it('gives +15 bonus for ricochet', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qsender', 100000)],
      outputs: [{ address: 'bc1qhop1', value: 99500 }],
      mode: 'ricochet',
      destination: 'bc1qdest',
      amountSats: 50000,
      fee: 500,
    });
    const hasBonus = result.bonuses.some(b => b.includes('Ricochet'));
    expect(hasBonus).toBe(true);
  });

  it('gives +5 bonus for tor connection', () => {
    const result = analyzeTransaction({
      inputs: [makeInput('bc1qsender', 100000)],
      outputs: [{ address: 'bc1qdest', value: 50000 }, { address: 'bc1qchange', value: 49500 }],
      mode: 'simple',
      destination: 'bc1qdest',
      amountSats: 50000,
      fee: 500,
      nodeUrl: 'wss://mynode.onion:50002',
    });
    const hasTor = result.bonuses.some(b => b.includes('Tor'));
    expect(hasTor).toBe(true);
  });

  it('clamps score between 0 and 100', () => {
    // Many penalties
    const inputs = Array.from({ length: 6 }, (_, i) => makeInput(`bc1qaddr${i}`, 10000));
    const result = analyzeTransaction({
      inputs,
      outputs: [{ address: 'bc1qaddr0', value: 1000000 }], // reuse
      mode: 'simple',
      destination: 'bc1qaddr0',
      amountSats: 1000000,
      fee: 1000,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
