import { describe, it, expect } from 'vitest';
import { isDustAttack, filterDustUTXOs, getDustWarnings } from '../src/background/security';

const makeUtxo = (value: number, address = 'bc1qexternal') => ({
  txid: 'a'.repeat(64), vout: 0, value, address, height: 800000,
});

describe('Dust Attack Detection', () => {
  it('detects dust from unknown addresses', () => {
    const known = new Set(['bc1qmyaddr1', 'bc1qmyaddr2']);
    const result = isDustAttack(makeUtxo(300, 'bc1qexternal'), known);
    expect(result.isDust).toBe(true);
  });

  it('does not flag dust from known addresses', () => {
    const known = new Set(['bc1qmyaddr1']);
    const result = isDustAttack(makeUtxo(300, 'bc1qmyaddr1'), known);
    expect(result.isDust).toBe(false);
  });

  it('does not flag non-dust UTXOs', () => {
    const known = new Set<string>();
    const result = isDustAttack(makeUtxo(10000, 'bc1qexternal'), known);
    expect(result.isDust).toBe(false);
  });

  it('filters dust from clean UTXOs', () => {
    const known = new Set(['bc1qmine']);
    const utxos = [
      makeUtxo(100000, 'bc1qmine'),
      makeUtxo(300, 'bc1qattacker'),
      makeUtxo(50000, 'bc1qmine'),
      makeUtxo(200, 'bc1qattacker2'),
    ];
    const { clean, dust } = filterDustUTXOs(utxos, known);
    expect(clean).toHaveLength(2);
    expect(dust).toHaveLength(2);
  });

  it('generates warnings for dust', () => {
    const known = new Set<string>();
    const utxos = [makeUtxo(300, 'bc1qattacker'), makeUtxo(100, 'bc1qattacker2')];
    const warnings = getDustWarnings(utxos, known);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('dust attack');
  });
});
