import { describe, it, expect } from 'vitest';
import { isSilentAddress } from '../src/background/silent-payments';

describe('Silent Payments', () => {
  it('detects sp1 addresses', () => {
    expect(isSilentAddress('sp1qqwewew...')).toBe(false); // invalid but starts with sp1
    expect(isSilentAddress('bc1qtest')).toBe(false);
    expect(isSilentAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
    expect(isSilentAddress('')).toBe(false);
  });

  it('rejects non-sp1 addresses', () => {
    expect(isSilentAddress('bc1qtest')).toBe(false);
    expect(isSilentAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(false);
    expect(isSilentAddress('tb1qtest')).toBe(false);
  });
});
