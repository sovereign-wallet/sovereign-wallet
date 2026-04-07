// Re-export derivation functions from wallet-derive (used by transactions.ts, paynym.ts)
export { deriveAddresses, findAddressInfo } from './wallet-derive';

import { HDKey } from '@scure/bip32';

// Derive signing key for a specific address
export function deriveSigningKey(
  xprv: string,
  addressIndex: number,
  change: boolean
): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const node = HDKey.fromExtendedKey(xprv);
  const chainIndex = change ? 1 : 0;
  const child = node.deriveChild(chainIndex).deriveChild(addressIndex);

  if (!child.privateKey || !child.publicKey) {
    throw new Error('Signing key derivation failed');
  }

  return { privateKey: child.privateKey, publicKey: child.publicKey };
}
