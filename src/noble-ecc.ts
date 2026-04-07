import { secp256k1 } from '@noble/curves/secp256k1.js';

// Adapter matching TinySecp256k1Interface required by bitcoinjs-lib
// Uses @noble/curves (pure JS, no WASM) — works in Chrome extension service workers

const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isPoint(p: Uint8Array): boolean {
  try {
    secp256k1.Point.fromHex(toHex(p));
    return true;
  } catch {
    return false;
  }
}

function isXOnlyPoint(p: Uint8Array): boolean {
  if (p.length !== 32) return false;
  try {
    secp256k1.Point.fromHex('02' + toHex(p));
    return true;
  } catch {
    return false;
  }
}

function isPrivate(d: Uint8Array): boolean {
  if (d.length !== 32) return false;
  const n = bytesToBigInt(d);
  return n > 0n && n < CURVE_ORDER;
}

function pointFromScalar(d: Uint8Array, compressed = true): Uint8Array | null {
  try {
    return secp256k1.getPublicKey(d, compressed);
  } catch {
    return null;
  }
}

function pointCompress(p: Uint8Array, compressed = true): Uint8Array {
  const point = secp256k1.Point.fromHex(toHex(p));
  const hex = point.toHex(compressed);
  return hexToBytes(hex);
}

function pointAddScalar(p: Uint8Array, tweak: Uint8Array, compressed = true): Uint8Array | null {
  try {
    const point = secp256k1.Point.fromHex(toHex(p));
    const tweakPoint = secp256k1.Point.fromHex(toHex(secp256k1.getPublicKey(tweak, false)));
    const result = point.add(tweakPoint);
    return hexToBytes(result.toHex(compressed));
  } catch {
    return null;
  }
}

function xOnlyPointAddTweak(p: Uint8Array, tweak: Uint8Array): { parity: 0 | 1; xOnlyPubkey: Uint8Array } | null {
  try {
    const point = secp256k1.Point.fromHex('02' + toHex(p));
    const tweakPub = secp256k1.getPublicKey(tweak, false);
    const tweakPoint = secp256k1.Point.fromHex(toHex(tweakPub));
    const result = point.add(tweakPoint);
    const compressed = hexToBytes(result.toHex(true));
    const parity = (compressed[0] === 0x03 ? 1 : 0) as 0 | 1;
    return { parity, xOnlyPubkey: compressed.slice(1) };
  } catch {
    return null;
  }
}

function privateAdd(d: Uint8Array, tweak: Uint8Array): Uint8Array | null {
  try {
    const dBig = bytesToBigInt(d);
    const tweakBig = bytesToBigInt(tweak);
    const sum = (dBig + tweakBig) % CURVE_ORDER;
    if (sum === 0n) return null;
    return bigIntToBytes(sum);
  } catch {
    return null;
  }
}

function sign(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return secp256k1.sign(hash, privateKey, { lowS: true });
}

function verify(hash: Uint8Array, publicKey: Uint8Array, signature: Uint8Array): boolean {
  try {
    return secp256k1.verify(signature, hash, publicKey);
  } catch {
    return false;
  }
}

// ── Helpers ──

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt('0x' + toHex(bytes));
}

function bigIntToBytes(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0');
  return hexToBytes(hex);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export {
  isPoint,
  isXOnlyPoint,
  isPrivate,
  pointFromScalar,
  pointCompress,
  pointAddScalar,
  xOnlyPointAddTweak,
  privateAdd,
  sign,
  verify,
};
