import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '../noble-ecc';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { getClient } from './electrum';
import { bytesToHex, hexToBytes, concatBytes, bytesToBigint, bigintToBytes32 } from '../utils/bytes';

bitcoin.initEccLib(ecc);

const network = bitcoin.networks.bitcoin;

// ── Types ──

export interface PaymentCode {
  code: string;
  pubkey: Uint8Array;
  chainCode: Uint8Array;
}

export interface NotifTxParams {
  xprv: string;
  xpub: string;
  theirPaymentCode: string;
  utxos: Array<{ txid: string; vout: number; value: number; address: string; height: number }>;
  feeRate: number;
}

const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

// ── Base58Check ──

function base58Encode(data: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const checksum = sha256(sha256(data)).slice(0, 4);
  const full = concatBytes(data, checksum);

  let num = bytesToBigint(full);
  let result = '';
  while (num > 0n) {
    const mod = Number(num % 58n);
    result = ALPHABET[mod]! + result;
    num = num / 58n;
  }

  // Leading zeros
  for (const byte of full) {
    if (byte === 0) result = '1' + result;
    else break;
  }

  return result;
}

function base58Decode(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  // Count leading '1's (= leading zero bytes)
  let leadingZeros = 0;
  for (const char of str) {
    if (char === '1') leadingZeros++;
    else break;
  }

  // Decode base58 to BigInt
  let num = 0n;
  for (const char of str) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Invalid base58 character');
    num = num * 58n + BigInt(idx);
  }

  // Convert BigInt to bytes (ensure even-length hex)
  let hex = num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const decoded = hexToBytes(hex);

  // Prepend leading zero bytes
  const result = new Uint8Array(leadingZeros + decoded.length);
  result.set(decoded, leadingZeros);

  // Verify checksum (last 4 bytes)
  if (result.length < 5) throw new Error('Invalid payment code: too short');
  const payload = result.slice(0, -4);
  const checksum = result.slice(-4);
  const expectedChecksum = sha256(sha256(payload)).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid payment code checksum');
    }
  }

  return payload;
}

// ── Payment Code operations ──

export function derivePaymentCode(xpub: string): PaymentCode {
  // BIP47: derive m/47'/0'/0' from master
  // Since we receive the account xpub (m/84'/0'/0'), we use it directly
  // In a full implementation, we'd derive from a BIP47-specific path
  const node = HDKey.fromExtendedKey(xpub);
  const child = node.deriveChild(0).deriveChild(0);

  if (!child.publicKey || !child.chainCode) {
    throw new Error('Payment code derivation failed');
  }

  // BIP47 payment code format (version 1):
  // 0x47 version(1) features(1) pubkey(33) chaincode(32) reserved(13)
  const payload = new Uint8Array(80);
  payload[0] = 0x47; // 'G' prefix
  payload[1] = 0x01; // version 1
  payload[2] = 0x00; // features
  payload.set(child.publicKey, 3);
  payload.set(child.chainCode, 36);
  // bytes 68-79 are reserved (zeros)

  const code = base58Encode(payload);

  return {
    code,
    pubkey: new Uint8Array(child.publicKey),
    chainCode: new Uint8Array(child.chainCode),
  };
}

export function parsePaymentCode(code: string): PaymentCode {
  const payload = base58Decode(code);

  if (payload[0] !== 0x47 || payload[1] !== 0x01) {
    throw new Error('Invalid payment code');
  }

  const pubkey = payload.slice(3, 36);
  const chainCode = payload.slice(36, 68);

  return { code, pubkey, chainCode };
}

export function isPaymentCode(str: string): boolean {
  try {
    parsePaymentCode(str);
    return true;
  } catch {
    return false;
  }
}

// ── Address derivation ──

function deriveSharedSecret(
  ourPrivKey: Uint8Array,
  theirPubkey: Uint8Array,
  theirChainCode: Uint8Array,
  index: number,
): { pubkey: Uint8Array; chainCode: Uint8Array } {
  // HMAC-SHA512 based child derivation (similar to BIP32)
  const indexBuf = new Uint8Array(4);
  new DataView(indexBuf.buffer).setUint32(0, index, false);

  const data = concatBytes(theirPubkey, indexBuf);
  const I = hmac(sha512, theirChainCode, data);

  const IL = I.slice(0, 32);
  const IR = I.slice(32);

  return { pubkey: IL, chainCode: IR };
}

export function deriveSendAddress(
  ourPrivKey: Uint8Array,
  theirPaymentCode: string,
  index: number,
): string {
  const their = parsePaymentCode(theirPaymentCode);

  // ECDH: shared secret = our_privkey * their_pubkey
  const theirPoint = secp256k1.Point.fromHex(bytesToHex(their.pubkey));
  const sharedPoint = theirPoint.multiply(bytesToBigint(ourPrivKey));
  const sharedSecret = sha256(hexToBytes(sharedPoint.toHex(true)));

  // Derive child key for index
  const derived = deriveSharedSecret(ourPrivKey, their.pubkey, their.chainCode, index);

  // Output pubkey = their_pubkey + SHA256(shared_secret || index) * G
  const tweakScalar = bytesToBigint(derived.pubkey) % CURVE_ORDER;
  const tweakPoint = secp256k1.Point.BASE.multiply(tweakScalar);
  const outputPoint = theirPoint.add(tweakPoint);

  const outputPubkey = hexToBytes(outputPoint.toHex(true));

  // P2WPKH address
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(outputPubkey),
    network,
  });

  if (!address) throw new Error('Failed to generate send address');
  return address;
}

export function deriveReceiveAddress(
  theirPaymentCode: string,
  ourPrivKey: Uint8Array,
  index: number,
): string {
  const their = parsePaymentCode(theirPaymentCode);

  // ECDH from our side
  const theirPoint = secp256k1.Point.fromHex(bytesToHex(their.pubkey));
  const derived = deriveSharedSecret(ourPrivKey, their.pubkey, their.chainCode, index);

  // Our receive key = our_privkey + tweak
  const tweakScalar = bytesToBigint(derived.pubkey) % CURVE_ORDER;
  const ourPrivBig = bytesToBigint(ourPrivKey);
  const receivePriv = (ourPrivBig + tweakScalar) % CURVE_ORDER;
  const receivePub = secp256k1.getPublicKey(bigintToBytes32(receivePriv), true);

  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(receivePub),
    network,
  });

  if (!address) throw new Error('Failed to generate receive address');
  return address;
}

// ── Notification transaction ──

export async function buildNotificationTransaction(params: NotifTxParams): Promise<{
  hex: string;
  txid: string;
  fee: number;
}> {
  const { xprv, xpub, theirPaymentCode, utxos, feeRate } = params;

  const their = parsePaymentCode(theirPaymentCode);
  const ourPC = derivePaymentCode(xpub);

  // Get the notification address (first derived address of their payment code)
  const theirNotifPubkey = their.pubkey;
  const { address: notifAddress } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(theirNotifPubkey),
    network,
  });

  if (!notifAddress) throw new Error('Notification address error');

  // Use first input's private key for the ECDH
  const privNode = HDKey.fromExtendedKey(xprv);
  const firstChild = privNode.deriveChild(0).deriveChild(0);
  if (!firstChild.privateKey) throw new Error('Failed to get private key');

  // ECDH shared secret for blinding the payment code
  const theirPoint = secp256k1.Point.fromHex(bytesToHex(theirNotifPubkey));
  const sharedPoint = theirPoint.multiply(bytesToBigint(firstChild.privateKey));
  const blindingKey = sha256(hexToBytes(sharedPoint.toHex(true)));

  // Blind our payment code
  // XOR the x-coordinate of our pubkey and chain code with the blinding key
  const blindedPayload = new Uint8Array(80);
  blindedPayload.set(new Uint8Array([0x47, 0x01, 0x00])); // header
  const pubkeyBytes = ourPC.pubkey;
  const chainBytes = ourPC.chainCode;

  // XOR pubkey x-coordinate (bytes 1-32 of compressed pubkey) with first 32 bytes of blinding
  const blindedPubkey = new Uint8Array(33);
  blindedPubkey[0] = pubkeyBytes[0]!; // prefix byte unchanged
  for (let i = 0; i < 32; i++) {
    blindedPubkey[i + 1] = (pubkeyBytes[i + 1] ?? 0) ^ (blindingKey[i] ?? 0);
  }
  blindedPayload.set(blindedPubkey, 3);

  // Chain code blinded with SHA256 of blinding key
  const chainBlind = sha256(blindingKey);
  const blindedChain = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    blindedChain[i] = (chainBytes[i] ?? 0) ^ (chainBlind[i] ?? 0);
  }
  blindedPayload.set(blindedChain, 36);

  // Build the transaction
  // Outputs: 1) OP_RETURN with blinded payment code, 2) dust to notification address
  const DUST = 546;
  const opReturnScript = Buffer.concat([
    Buffer.from([0x6a, 0x4c, 80]), // OP_RETURN OP_PUSHDATA1 80
    Buffer.from(blindedPayload),
  ]);

  // Estimate fee: inputs + 2 outputs (OP_RETURN + dust P2WPKH)
  const vsize = Math.ceil(10.5 + 68 * 1 + 31 * 2 + 83); // OP_RETURN is ~83 vbytes
  const fee = Math.ceil(vsize * feeRate);

  // Select first UTXO that covers dust + fee
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const input = sorted.find(u => u.value >= DUST + fee);
  if (!input) throw new Error('No UTXO large enough for notification transaction');

  const change = input.value - DUST - fee;

  const client = getClient();
  const rawHex = await client.getTransaction(input.txid);

  const psbt = new bitcoin.Psbt({ network });
  psbt.addInput({
    hash: input.txid,
    index: input.vout,
    witnessUtxo: {
      script: bitcoin.address.toOutputScript(input.address, network),
      value: BigInt(input.value),
    },
    nonWitnessUtxo: Buffer.from(rawHex, 'hex'),
  });

  // OP_RETURN output
  psbt.addOutput({
    script: opReturnScript,
    value: 0n,
  });

  // Dust to notification address
  psbt.addOutput({
    address: notifAddress,
    value: BigInt(DUST),
  });

  // Change if any
  if (change > DUST) {
    const changeNode = HDKey.fromExtendedKey(xpub);
    const changeChild = changeNode.deriveChild(1).deriveChild(0);
    if (changeChild.publicKey) {
      const { address: changeAddr } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(changeChild.publicKey),
        network,
      });
      if (changeAddr) {
        psbt.addOutput({ address: changeAddr, value: BigInt(change) });
      }
    }
  }

  // Sign with first input key
  // Find the address info to sign properly
  const { findAddressInfo } = await import('./wallet');
  const info = findAddressInfo(xpub, input.address);
  if (!info) throw new Error('Input address not found');

  const signingChild = privNode.deriveChild(info.change ? 1 : 0).deriveChild(info.index);
  if (!signingChild.privateKey || !signingChild.publicKey) throw new Error('Failed to get key');

  const { secp256k1: secp } = await import('@noble/curves/secp256k1.js');
  const signer = {
    publicKey: Buffer.from(signingChild.publicKey),
    sign(hash: Buffer): Buffer {
      const sig = secp.sign(new Uint8Array(hash), signingChild.privateKey!, { lowS: true });
      return Buffer.from(sig);
    },
  };
  psbt.signInput(0, signer);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  return {
    hex: tx.toHex(),
    txid: tx.getId(),
    fee,
  };
}
