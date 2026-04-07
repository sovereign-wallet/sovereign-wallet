// Address derivation — extracted to avoid circular imports between wallet.ts and connection.ts

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';
import { HDKey } from '@scure/bip32';

bitcoin.initEccLib(ecc);

export function deriveAddresses(xpub: string, count: number, change: boolean): string[] {
  const node = HDKey.fromExtendedKey(xpub);
  const chainIndex = change ? 1 : 0;
  const addresses: string[] = [];

  for (let i = 0; i < count; i++) {
    const child = node.deriveChild(chainIndex).deriveChild(i);
    if (!child.publicKey) throw new Error('Public key derivation failed');

    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: bitcoin.networks.bitcoin,
    });

    if (!address) throw new Error('Address generation failed');
    addresses.push(address);
  }

  return addresses;
}

export function findAddressInfo(
  xpub: string,
  address: string,
  maxIndex: number = 100
): { index: number; change: boolean } | null {
  for (const change of [false, true]) {
    const addresses = deriveAddresses(xpub, maxIndex, change);
    const idx = addresses.indexOf(address);
    if (idx !== -1) {
      return { index: idx, change };
    }
  }
  return null;
}
