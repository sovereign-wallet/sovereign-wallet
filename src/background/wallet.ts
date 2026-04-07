import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';
import { HDKey } from '@scure/bip32';
import { getClient, toElectrumScripthash } from './electrum';
import type { BalanceData, TransactionRecord, UTXOData } from '../types/messages';

bitcoin.initEccLib(ecc);

const GAP_LIMIT = 20;

// ── Address derivation ──

export function deriveAddresses(
  xpub: string,
  count: number,
  change: boolean
): string[] {
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

// ── Scan addresses with gap limit ──

async function scanAddresses(
  xpub: string,
  change: boolean
): Promise<{ addresses: string[]; lastUsedIndex: number }> {
  const client = getClient();
  const allAddresses: string[] = [];
  let lastUsedIndex = -1;
  let currentIndex = 0;

  while (true) {
    const batch = deriveAddresses(xpub, currentIndex + GAP_LIMIT, change).slice(currentIndex);

    let foundActivity = false;
    for (let i = 0; i < batch.length; i++) {
      const addr = batch[i]!;
      allAddresses.push(addr);

      const scripthash = await toElectrumScripthash(addr);
      const history = await client.getHistory(scripthash);

      if (history.length > 0) {
        lastUsedIndex = currentIndex + i;
        foundActivity = true;
      }
    }

    if (!foundActivity) break;
    currentIndex += GAP_LIMIT;
  }

  return { addresses: allAddresses, lastUsedIndex };
}

// ── Balance ──

export async function getBalance(xpub: string): Promise<BalanceData> {
  const client = getClient();
  let confirmed = 0;
  let unconfirmed = 0;

  for (const change of [false, true]) {
    const { addresses } = await scanAddresses(xpub, change);
    for (const addr of addresses) {
      const scripthash = await toElectrumScripthash(addr);
      const bal = await client.getBalance(scripthash);
      confirmed += bal.confirmed;
      unconfirmed += bal.unconfirmed;
    }
  }

  return { confirmed, unconfirmed, total: confirmed + unconfirmed };
}

// ── UTXOs ──

export async function getUTXOs(xpub: string): Promise<UTXOData[]> {
  const client = getClient();
  const utxos: UTXOData[] = [];

  for (const change of [false, true]) {
    const { addresses } = await scanAddresses(xpub, change);
    for (const addr of addresses) {
      const scripthash = await toElectrumScripthash(addr);
      const unspent = await client.listUnspent(scripthash);

      for (const u of unspent) {
        utxos.push({
          txid: u.tx_hash,
          vout: u.tx_pos,
          value: u.value,
          address: addr,
          height: u.height,
        });
      }
    }
  }

  return utxos;
}

// ── Transaction history ──

export async function getTransactionHistory(xpub: string): Promise<TransactionRecord[]> {
  const client = getClient();
  const txMap = new Map<string, TransactionRecord>();
  const myAddresses = new Set<string>();

  for (const change of [false, true]) {
    const { addresses } = await scanAddresses(xpub, change);
    for (const addr of addresses) {
      myAddresses.add(addr);
      const scripthash = await toElectrumScripthash(addr);
      const history = await client.getHistory(scripthash);

      for (const h of history) {
        if (!txMap.has(h.tx_hash)) {
          txMap.set(h.tx_hash, {
            txid: h.tx_hash,
            height: h.height,
            timestamp: h.height > 0 ? h.height * 600 : Date.now() / 1000, // approximate
            amount: 0,
            fee: h.fee ?? 0,
            confirmed: h.height > 0,
          });
        }
      }
    }
  }

  // Note: Full amount calculation requires fetching raw transactions
  // which is expensive. For MVP we return the tx list with height info.
  return Array.from(txMap.values()).sort((a, b) => b.height - a.height);
}

// ── Receive address (first unused) ──

export async function getReceiveAddress(xpub: string): Promise<string> {
  const { addresses, lastUsedIndex } = await scanAddresses(xpub, false);
  const nextIndex = lastUsedIndex + 1;

  if (nextIndex < addresses.length) {
    return addresses[nextIndex]!;
  }

  // Derive one more
  const extra = deriveAddresses(xpub, nextIndex + 1, false);
  return extra[nextIndex]!;
}

// ── Derive signing key for a specific address ──

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

// ── Find address index and chain ──

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
