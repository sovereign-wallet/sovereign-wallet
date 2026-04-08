# Grant Application Template

> Use this as the base for applications to OpenSats, Spiral, HRF, and similar organizations. Adapt tone and details to each org's specific format and focus.

---

## Title

**Sovereign Wallet — Privacy-first Bitcoin browser wallet for the post-Samourai era**

---

## Problem

The arrest of Samourai Wallet's founders in April 2024 eliminated the most advanced Bitcoin privacy wallet from the ecosystem. While the code was open source, it depended on centralized infrastructure (Whirlpool coordinator, Dojo backend) that died with the seizure. No project has successfully rebuilt those privacy tools in a form that can't be shut down.

Meanwhile, chain analysis capabilities continue to advance. KYC requirements expand globally. The average Bitcoin user has no practical tools for on-chain privacy that don't depend on a single company or server.

Bitcoin needs privacy tools that are:
- Free and open source
- Connected to user-controlled infrastructure (own node)
- Resilient to legal attacks on developers
- Accessible to non-technical users

---

## What we built

Sovereign Wallet is a Chrome browser extension that brings Samourai-class privacy tools to the desktop, connected to the user's own Bitcoin node. No central servers. No coordinator. No single point of failure.

**Shipped features:**
- HD wallet (BIP84) with 24-word seed generation and recovery
- Direct connection to user's Fulcrum/Electrum server (or fallback public nodes)
- Stonewall transactions (high-entropy self-spends that mimic CoinJoin)
- Ricochet (intermediate hops to break chain analysis heuristics)
- Full coin control (manual UTXO selection)
- Privacy score (real-time transaction analysis before broadcast)
- UTXO map (visual graph of coin history and linkability)
- Silent Payments send (BIP352)
- PayNyms (BIP47 reusable payment codes)
- Family Node (onboard others to your node via QR)
- AI-powered privacy advisor (plain language transaction risk analysis)

**In development:**
- Silent Payments receive (full BIP352 — Q2 2026)
- CoinJoin via Joinstr/Nostr (Q4 2026)
- Hardware wallet integration (2027)

---

## Why we're the right team

[PLACEHOLDER — Adapt to actual team composition]

We are Bitcoin developers with experience in wallet development, privacy protocols, and open source Bitcoin infrastructure. Our team includes contributors to [relevant projects] and has experience shipping production Bitcoin software.

We started this project because the Samourai codebase deserved to live on, and we believe privacy tools must be built without centralized dependencies.

Key qualifications:
- Deep understanding of Bitcoin privacy (BIP47, BIP84, BIP352, Stonewall, Ricochet)
- Production experience with browser extension development
- Track record of open source contribution in the Bitcoin ecosystem
- Commitment to building without corporate backing or VC funding

---

## Funding request

**Amount:** $80,000 for 12 months

### Budget breakdown

| Category | Allocation | Amount | Details |
|---|---|---|---|
| Developer compensation | 60% | $48,000 | 2 core developers, part-time dedicated |
| Infrastructure | 20% | $16,000 | Servers, CI/CD, test nodes, domain, hosting |
| Security audit | 10% | $8,000 | Third-party audit of key management and transaction signing |
| Community and marketing | 10% | $8,000 | Documentation, tutorials, conference presence, bounties |

---

## Milestones and metrics

### Milestone 1: Foundation (Months 1-3)
- Public repository with CI/CD pipeline
- Core wallet functionality stable and tested
- Documentation complete (setup guides, architecture docs)
- **Metric:** 200 GitHub stars, 50 active installs

### Milestone 2: Silent Payments receive (Months 4-6)
- Full BIP352 support (send and receive)
- Security audit completed
- Node-as-a-service launched for non-technical users
- **Metric:** 1,000 monthly active users, audit report published

### Milestone 3: Scale and resilience (Months 7-9)
- Mobile companion app (Android) in beta
- CoinJoin via Joinstr/Nostr in development
- Community contributions growing
- **Metric:** 2,000 MAU, 10+ external contributors

### Milestone 4: Maturity (Months 10-12)
- Hardware wallet integration (Coldcard priority)
- Joinstr CoinJoin in beta
- Comprehensive test suite (>80% coverage on crypto code)
- **Metric:** 3,000 MAU, 3+ hardware wallets supported

### Summary metrics at 12 months

| Metric | Target |
|---|---|
| Monthly active users | 1,000 by month 6, 3,000 by month 12 |
| Security audit | Completed and published by month 6 |
| Silent Payments receive | Shipped by month 6 |
| Hardware wallet integration | At least 1 device by month 12 |
| Test coverage (crypto code) | >80% |
| External contributors | 10+ |

---

## Long-term sustainability

Beyond grant funding, Sovereign Wallet has a sustainability plan that doesn't compromise its open source nature:

1. **Node-as-a-service** ($9/month via BTCPay Server) for users who want privacy without running hardware
2. **Pre-configured node hardware** ($400-600) for users who want sovereignty without Linux setup
3. **Community donations** via on-chain Bitcoin and Lightning
4. **Recurring grants** from multiple organizations (not dependent on a single funder)

The wallet itself will always be free and open source. Revenue comes from optional services, never from the software.

---

## Links

- Repository: [github.com/sovereign-wallet/sovereign-wallet](https://github.com/sovereign-wallet/sovereign-wallet)
- Website: sovereign-wallet.dev (coming soon)
- Contact: hello@sovereign-wallet.dev
- Security: security@sovereign-wallet.dev
