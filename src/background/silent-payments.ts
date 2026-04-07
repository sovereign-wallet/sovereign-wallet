import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32m } from 'bech32';

// ── Types ──

export interface SilentPaymentAddress {
  scanPubkey: Uint8Array;  // 33 bytes compressed
  spendPubkey: Uint8Array; // 33 bytes compressed
  raw: string;
}

export interface SilentOutputParams {
  inputPrivateKeys: Uint8Array[]; // private keys of sender's inputs
  silentAddress: SilentPaymentAddress;
  outputIndex: number; // k = 0 for first output to this recipient
}

// ── Helpers ──

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function bigintToBytes32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

function bytesToBigint(bytes: Uint8Array): bigint {
  return BigInt('0x' + bytesToHex(bytes));
}

const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

// ── Detection ──

export function isSilentAddress(address: string): boolean {
  if (!address.startsWith('sp1')) return false;
  try {
    parseSilentAddress(address);
    return true;
  } catch {
    return false;
  }
}

// ── Parsing ──

export function parseSilentAddress(address: string): SilentPaymentAddress {
  if (!address.startsWith('sp1')) {
    throw new Error('Silent Payment address must start with sp1');
  }

  const decoded = bech32m.decode(address, 1023);
  const data = bech32m.fromWords(decoded.words.slice(1)); // skip version byte
  const bytes = new Uint8Array(data);

  if (bytes.length !== 66) {
    throw new Error(`Invalid Silent Payment address: expected 66 bytes, got ${bytes.length}`);
  }

  const scanPubkey = bytes.slice(0, 33);
  const spendPubkey = bytes.slice(33, 66);

  // Validate both are valid points
  try {
    secp256k1.Point.fromHex(bytesToHex(scanPubkey));
    secp256k1.Point.fromHex(bytesToHex(spendPubkey));
  } catch {
    throw new Error('Silent Payment address contains invalid pubkeys');
  }

  return { scanPubkey, spendPubkey, raw: address };
}

// ── Output generation (BIP352 sender side) ──

export function generateSilentOutput(params: SilentOutputParams): Uint8Array {
  const { inputPrivateKeys, silentAddress, outputIndex } = params;

  if (inputPrivateKeys.length === 0) {
    throw new Error('At least one input private key is required');
  }

  // Step 1: Sum all input private keys (a_sum = sum of a_i)
  let aSum = 0n;
  for (const privKey of inputPrivateKeys) {
    aSum = (aSum + bytesToBigint(privKey)) % CURVE_ORDER;
  }
  if (aSum === 0n) throw new Error('Sum of private keys is zero');

  const aSumBytes = bigintToBytes32(aSum);

  // Step 2: Compute input_hash = hash(outpoints || A_sum)
  // For simplicity in MVP, we use a_sum pubkey as the "sum of input pubkeys"
  const aSumPubkey = secp256k1.getPublicKey(aSumBytes, true);

  // input_hash = SHA256(sort(outpoints) || A_sum)
  // In a full implementation, outpoints would be sorted and included
  // For MVP, we use the pubkey directly
  const inputHash = sha256(aSumPubkey);

  // Step 3: ECDH shared secret
  // ecdh_shared_secret = input_hash * a_sum * B_scan
  const scanPoint = secp256k1.Point.fromHex(bytesToHex(silentAddress.scanPubkey));

  // Multiply a_sum * input_hash mod n
  const tweakedPriv = (bytesToBigint(aSumBytes) * bytesToBigint(inputHash)) % CURVE_ORDER;
  const tweakedPrivBytes = bigintToBytes32(tweakedPriv);

  // Shared secret = tweakedPriv * B_scan
  const sharedSecretPoint = scanPoint.multiply(tweakedPriv);
  const sharedSecretBytes = hexToBytes(sharedSecretPoint.toHex(true));

  // Step 4: t_k = SHA256(sharedSecret || ser32(k))
  const kBytes = new Uint8Array(4);
  new DataView(kBytes.buffer).setUint32(0, outputIndex, false);
  const tk = sha256(concatBytes(sharedSecretBytes, kBytes));

  // Step 5: P_output = B_spend + t_k * G
  const spendPoint = secp256k1.Point.fromHex(bytesToHex(silentAddress.spendPubkey));
  const tkPoint = secp256k1.Point.BASE.multiply(bytesToBigint(tk));
  const outputPoint = spendPoint.add(tkPoint);

  // Step 6: Create P2TR output script
  // x-only pubkey (drop the prefix byte)
  const outputPubkeyFull = hexToBytes(outputPoint.toHex(true));
  const xOnlyPubkey = outputPubkeyFull.slice(1); // remove 02/03 prefix

  // P2TR scriptPubKey: OP_1 OP_PUSH32 <x-only-pubkey>
  const scriptPubKey = new Uint8Array(34);
  scriptPubKey[0] = 0x51; // OP_1 (witness version 1)
  scriptPubKey[1] = 0x20; // push 32 bytes
  scriptPubKey.set(xOnlyPubkey, 2);

  return scriptPubKey;
}
