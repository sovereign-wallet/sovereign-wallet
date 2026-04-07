# Monetization Strategy

> Internal document. Not linked from README or public docs.

---

## Principles

1. The wallet is free and open source. Always. No freemium, no premium tiers, no feature gates.
2. Revenue comes from infrastructure and services, never from the software itself.
3. Every revenue model must be compatible with the project's privacy philosophy.
4. Users must always have the option to use Sovereign Wallet with zero cost by running their own node.

---

## Model 1: Node as a Service

**What:** Managed Bitcoin Core + Fulcrum node that users connect to from Sovereign Wallet.

**Price:** $9/month, paid via BTCPay Server (Bitcoin on-chain or Lightning).

**What's included:**
- Dedicated Fulcrum Electrum server endpoint
- 99.9% uptime SLA
- Automatic Bitcoin Core and Fulcrum updates
- No logs policy — connection logs rotated every 24 hours
- Support via encrypted email

**Infrastructure cost:** ~$50-80/month per server (dedicated, not shared). Each server supports approximately 50-100 concurrent users. Break-even at ~8 users per server.

**Privacy tradeoff:** Users trust us not to log their addresses. This is explicitly stated in onboarding. We recommend own-node for maximum privacy.

**Payment processing:** BTCPay Server self-hosted instance. No third-party payment processor. No KYC for service signup — email and payment only.

**Target:** Users who want privacy benefits without running their own hardware. Estimated 5-15% conversion from free users.

---

## Model 2: Pre-configured NUC Hardware

**What:** Intel NUC with Bitcoin Core, Fulcrum, and Tor pre-installed. Plug in, connect to internet, wait for sync.

**Price:** $400-600 depending on configuration.

| Config | Specs | Price |
|---|---|---|
| Standard | Intel N100, 16GB RAM, 1TB NVMe SSD | $400 |
| Pro | Intel i5, 32GB RAM, 2TB NVMe SSD | $600 |

**Margin:** ~$100-150 per unit after hardware, assembly, shipping.

**Fulfillment:** Initially manual (order, assemble, ship). At scale, partner with a hardware assembler.

**Target:** Users who want to run their own node but don't want to deal with Linux setup. Estimated low volume (5-10 units/month initially).

**Software:** Pre-loaded with Ubuntu 24.04 LTS, Bitcoin Core, Fulcrum, Tor, and a simple web dashboard for monitoring. All open source. Users can wipe and reinstall whatever they want.

---

## Model 3: Bitcoin Grants

**What:** Apply for grants from organizations that fund Bitcoin open source development.

**Target organizations:**

| Organization | Typical grant size | Focus |
|---|---|---|
| OpenSats | $50-100k/yr | Bitcoin open source |
| Spiral (Block) | $50-150k/yr | Bitcoin development |
| Human Rights Foundation | $10-50k | Privacy and freedom tools |
| Maelstrom (BitMEX) | $50-100k/yr | Bitcoin infrastructure |
| Brink | $50-100k/yr | Bitcoin Core and ecosystem |

**Expected outcome:** $80-150k/year if 1-2 grants are secured.

**Requirements:** Public development, regular progress reports, open source commitment (already met).

**Application template:** See [GRANTS.md](GRANTS.md).

---

## Model 4: Passive Donations

**What:** Bitcoin and Lightning donations from users and supporters.

**Channels:**
- On-chain address in README and website: `bc1qlwgnpsxxr7smmu880g26hfdzyrcd8egrqm0j8c`
- Lightning address in README and website: `peppyfortune074@walletofsatoshi.com`
- Geyser Fund campaign (for visibility in Bitcoin community)
- GitHub Sponsors (for developer-focused audience)

**Expected outcome:** Unpredictable. Likely $500-2000/month if the project gains traction. Not a primary revenue source.

---

## Timeline

| Month | Milestone | Revenue model |
|---|---|---|
| Month 1 | Launch repo, publish README, start building community | Donations only |
| Month 2 | Apply for OpenSats and Spiral grants | Grant applications submitted |
| Month 3 | Launch sovereign-wallet.dev website | Donations + grant pipeline |
| Month 4 | Grant decisions (first round) | Grants (if approved) |
| Month 6 | Launch node-as-a-service on BTCPay | Node service ($9/mo) |
| Month 8 | First hardware NUC batch | Hardware sales |
| Month 12 | Evaluate all revenue streams | Full assessment |

---

## Financial targets

| Timeframe | Monthly target | Source breakdown |
|---|---|---|
| Month 1-3 | $0-500 | Donations |
| Month 4-6 | $3,000-5,000 | Grants + donations |
| Month 7-12 | $5,000-10,000 | Grants + node service + donations |
| Year 2 | $10,000-15,000 | All streams combined |

---

## What we will NOT do

- Sell user data. Ever.
- Add premium features behind a paywall.
- Take VC money or issue a token.
- Partner with exchanges or KYC services.
- Run ads.
- Compromise privacy for revenue.

The project stays free. The code stays open. Revenue comes from services that users voluntarily choose.
