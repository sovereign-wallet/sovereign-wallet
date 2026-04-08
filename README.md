<p align="center">
  <img src="docs/logo.svg" width="120" alt="Sovereign Wallet" />
</p>

<h1 align="center">Sovereign Wallet</h1>
<p align="center">Privacy-first Bitcoin wallet for Chrome. Connects to your own node.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/network-bitcoin%20mainnet-orange.svg" alt="Bitcoin Mainnet" />
  <img src="https://img.shields.io/badge/manifest-v3-green.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/typescript-strict-blue.svg" alt="TypeScript Strict" />
</p>

---

## What this is

A Chrome extension Bitcoin wallet with advanced privacy features. Connects to your own Fulcrum/Electrum node over WebSocket, or to public APIs (Blockstream, mempool.space) when a personal node isn't available.

Private keys never leave the extension's service worker. No external servers required. No accounts. No telemetry.

---

## Architecture

```
Chrome Extension (Manifest V3)
├── Service Worker (background)
│   ├── keyring.ts          AES-256-GCM vault, PBKDF2 100k, auto-lock 5min
│   ├── connection.ts       Routes between WebSocket (own node) and REST (public)
│   ├── electrum.ts         Electrum protocol client, JSON-RPC over WebSocket
│   ├── esplora-client.ts   REST client for Blockstream/mempool.space APIs
│   ├── wallet-derive.ts    BIP84 HD key derivation (m/84'/0'/0')
│   ├── transactions.ts     TX builder: simple, Stonewall, Ricochet, unsigned PSBT
│   ├── privacy.ts          Heuristic privacy scoring engine (0-100)
│   ├── coin-control.ts     Branch and Bound UTXO selection
│   ├── silent-payments.ts  BIP352 sender-side implementation
│   ├── paynym.ts           BIP47 payment codes + notification TX
│   ├── hardware-wallet.ts  Watch-only mode, PSBT export/import
│   ├── utxo-labels.ts      Persistent UTXO tagging (origin tracking)
│   ├── ai-advisor.ts       Claude API integration for privacy analysis
│   └── node-admin.ts       WireGuard peer management for Family Node
│
├── Popup (React + TypeScript)
│   ├── Onboarding          Create wallet / Import seed / Connect hardware
│   ├── Dashboard           Balance, recent TXs, connection status, privacy banner
│   ├── Send                Destination, amount, fee, mode selector, PSBT flow
│   ├── Receive             QR code, single-use address warning
│   ├── CoinControl         Manual UTXO selection with labels and origin colors
│   ├── UTXOMap             Canvas visualization of UTXO set by size and origin
│   ├── TransactionHistory  Paginated list, filters, CSV export
│   ├── Settings            Node selector, PayNym, API key, seed export
│   ├── FamilyNode          WireGuard peer management, QR invite generation
│   ├── ConnectHardware     Coldcard/Keystone xpub import
│   └── PSBTExchange        Download/upload PSBT for hardware wallet signing
│
├── Config
│   ├── nodes.ts            Known node list with privacy level metadata
│   └── donations.ts        Optional donation addresses (env vars)
│
└── Crypto (no WASM, pure JS)
    └── noble-ecc.ts        secp256k1 adapter using @noble/curves
```

---

## Features

### Wallet core

- **BIP84 HD wallet** — 24-word BIP39 seed, native SegWit (`bc1q...`), gap limit 20
- **AES-256-GCM encryption** — seed encrypted with PBKDF2 (100,000 iterations), unique salt + IV per encryption
- **Auto-lock** — clears private keys from memory after 5 minutes of inactivity
- **Rate limiting** — 5 password attempts, then 30-minute lockout (persisted to storage)
- **Import/export** — BIP39-compatible with Samourai, Sparrow, BlueWallet, Electrum

### Node connection

- **Own node (WebSocket)** — connects to Fulcrum/Electrum Server via `wss://`
- **Public nodes (REST)** — Blockstream and mempool.space via Esplora API
- **Auto-detection** — routes `https://` URLs through REST, `wss://` through WebSocket
- **Privacy levels** — each node option shows who can see your address queries
- **Reconnection** — exponential backoff (1s → 2s → 4s → ... → 60s max)

### Privacy tools

| Tool | Protocol | How it works |
|---|---|---|
| **Stonewall** | Custom | Creates 4 outputs (2 payment + 2 change) to simulate a collaborative transaction. No external coordinator. |
| **Ricochet** | Custom | Builds a chain of 3 transactions through 2 intermediate self-owned addresses before reaching the destination. |
| **Coin Control** | — | Manual UTXO selection with Branch and Bound optimization. Labels by origin (exchange / p2p / mined / mixed). |
| **Privacy Score** | — | Heuristic scoring engine (0-100). Penalties: address reuse (-30), input merging (-25), obvious change (-20), round amounts (-15), UTXO consolidation (-15), change reuse (-20). Bonuses: Stonewall (+20), Ricochet (+15), Tor (+5), Taproot (+10). |
| **Silent Payments** | BIP352 | Sender-side ECDH: computes shared secret between sender's input keys and recipient's scan pubkey to derive a unique P2TR output. |
| **PayNyms** | BIP47 | Payment code derivation, notification transaction with blinded code in OP_RETURN, per-index send/receive address derivation via ECDH. |
| **UTXO Map** | — | Canvas-rendered visualization. Each UTXO is a circle sized by value, colored by origin. Click to view details and add labels. |
| **AI Advisor** | Claude API | Sends anonymized metadata (score, issue types, UTXO count, mode) for plain-language privacy analysis. Never sends addresses, amounts, or txids. Requires user-provided API key. |

### Hardware wallets

| Device | Connection | Signing |
|---|---|---|
| **Coldcard** | xpub import (JSON export → paste zpub) | PSBT file via microSD |
| **Keystone** | xpub import (menu → extended public key) | PSBT file transfer |

Flow: import xpub → wallet operates in watch-only mode → build unsigned PSBT → export `.psbt` file → sign on device → upload signed PSBT → broadcast.

### Network

- **Transaction notifications** — Chrome notification on incoming bitcoin or TX confirmation
- **Family Node** — generate WireGuard configs with QR codes to share your node with others
- **Fee estimation** — 3-tier (slow / normal / fast) from Electrum `estimatefee` or Esplora `/fee-estimates`

---

## Security model

| Layer | Implementation |
|---|---|
| Key storage | AES-256-GCM + PBKDF2 100k iterations, `chrome.storage.local` only |
| Key isolation | Seed and xprv exist only in service worker memory, never sent to popup |
| CSP | `script-src 'self'; object-src 'self'; connect-src 'self' https://* wss://* ws://*` |
| Input validation | TypeScript strict mode, no `any`, no `eval()`, no inline scripts |
| Brute force | 5 attempts → 30-minute lockout, counter persisted |
| Auto-lock | Clears keys from memory after 5 minutes of inactivity |
| API isolation | AI advisor receives only anonymized scores, never private data |
| Crypto | `@noble/curves` (pure JS, audited) — no WASM, no native bindings |

---

## Install

```bash
git clone https://github.com/sovereign-wallet/sovereign-wallet.git
cd sovereign-wallet
npm install
cp .env.example .env    # optional: configure your node URL
npm run build
```

Load in Chrome:

1. `chrome://extensions` → enable Developer Mode
2. Load unpacked → select the `dist/` folder

```bash
npm run build          # TypeScript check + Vite production build
npm run build:prod     # Build + generate sovereign-wallet.zip
npm test               # Vitest test suite
```

---

## Node setup

To run your own node you need a dedicated machine (Intel NUC, old laptop, Raspberry Pi 5) with 1TB+ SSD and Ubuntu 20.04+.

```bash
bash scripts/setup-nuc.sh
```

The script installs Bitcoin Core, Fulcrum, Tor, and WireGuard. Bitcoin Core initial sync takes 12-18 hours, Fulcrum indexing 4-8 hours after that.

---

## Environment variables

```
VITE_DEFAULT_NODE_URL=             # wss://your-node-ip:50002
VITE_NODE_ONION_ADDRESS=           # wss://your-node.onion:50002 (optional)
VITE_WIREGUARD_PUBLIC_KEY=         # WireGuard server public key (optional)
VITE_ANTHROPIC_API_KEY=            # Claude API key for AI advisor (optional)
VITE_DONATION_BTC_ADDRESS=         # Donation address (optional)
VITE_DONATION_LIGHTNING_ADDRESS=   # Lightning address (optional)
```

---

## Tests

```bash
npm test
```

Coverage: privacy scoring (all penalties and bonuses), coin control (Branch and Bound, validation, edge cases), silent payment address detection.

---

## Not yet implemented

- Silent Payments receive (BIP352 scanning)
- CoinJoin (Whirlpool / Joinstr)
- Ledger / Trezor via WebHID
- Mobile companion app
- Passphrase (BIP39 passphrase / 25th word) support

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Security vulnerabilities: do not open a public issue. Email `security@sovereign-wallet.dev` — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
