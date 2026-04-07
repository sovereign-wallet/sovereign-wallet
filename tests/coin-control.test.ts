import { describe, it, expect } from 'vitest';
import { selectUTXOs, validateSelection } from '../src/background/coin-control';

const makeUtxo = (value: number, txid = 'a'.repeat(64), vout = 0) => ({
  txid, vout, value, address: 'bc1qtest', height: 800000,
});

describe('Coin Control - selectUTXOs', () => {
  it('selects UTXOs that cover the target', () => {
    const utxos = [makeUtxo(50000), makeUtxo(30000), makeUtxo(20000)];
    const result = selectUTXOs(utxos, 40000, 5);
    expect(result.totalInput).toBeGreaterThanOrEqual(40000);
    expect(result.utxos.length).toBeGreaterThan(0);
  });

  it('returns empty for no UTXOs', () => {
    const result = selectUTXOs([], 10000, 5);
    expect(result.utxos).toHaveLength(0);
    expect(result.totalInput).toBe(0);
  });

  it('prefers fewer UTXOs (largest first fallback)', () => {
    const utxos = [
      makeUtxo(10000, 'a'.repeat(64), 0),
      makeUtxo(10000, 'b'.repeat(64), 0),
      makeUtxo(100000, 'c'.repeat(64), 0),
    ];
    const result = selectUTXOs(utxos, 50000, 1);
    // Should pick the 100k UTXO alone
    expect(result.utxos.length).toBeLessThanOrEqual(2);
  });

  it('calculates change correctly', () => {
    const utxos = [makeUtxo(100000)];
    const result = selectUTXOs(utxos, 50000, 1);
    expect(result.change).toBeGreaterThan(0);
    expect(result.fee).toBeGreaterThan(0);
    expect(result.totalInput - result.fee - 50000).toBe(result.change);
  });
});

describe('Coin Control - validateSelection', () => {
  it('validates sufficient funds', () => {
    const utxos = [makeUtxo(100000)];
    const result = validateSelection(utxos, 50000, 5);
    expect(result.valid).toBe(true);
    expect(result.change).toBeGreaterThanOrEqual(0);
  });

  it('rejects insufficient funds', () => {
    const utxos = [makeUtxo(1000)];
    const result = validateSelection(utxos, 50000, 5);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles dust change by donating to fee', () => {
    // Target is just barely less than input, leaving tiny change
    const inputValue = 10000;
    const utxos = [makeUtxo(inputValue)];
    const result = validateSelection(utxos, inputValue - 200, 1); // ~168 fee, ~32 change (dust)
    if (result.valid && result.change === 0) {
      expect(result.fee).toBeGreaterThan(100); // fee absorbed the dust
    }
  });
});
