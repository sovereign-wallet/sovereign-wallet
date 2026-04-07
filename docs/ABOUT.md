# About Sovereign Wallet

## Origin: The day Samourai died

On April 24, 2024, the U.S. Department of Justice arrested the founders of Samourai Wallet and seized their servers. Overnight, the most advanced Bitcoin privacy wallet ever built went dark. The Whirlpool coordinator stopped. The Dojo backend stopped responding. Millions of users lost access to their privacy tools.

The code was open source. It had always been open source. But the wallet depended on centralized infrastructure — a coordinator for CoinJoin, servers for transaction broadcasting, APIs for UTXO lookups. Without those servers, the app was a shell.

Sovereign Wallet started as a question: what if someone rebuilt those privacy tools without the single point of failure? What if the wallet connected directly to your own node, with no intermediary infrastructure that could be seized?

That question became this project.

---

## Why a browser extension, not Android

Samourai was an Android app. It made sense at the time — mobile-first, always with you, great UX. But the Android ecosystem has problems for privacy software:

1. **Google Play is a chokepoint.** Google removed Samourai from the Play Store before the arrest. Any privacy wallet on the Play Store exists at Google's discretion.
2. **Sideloading is friction.** Most users won't install APKs manually. The ones who will are already running their own node.
3. **Browser extensions are permissionless.** You can distribute a Chrome extension as a zip file. No app store approval needed. Users can load it unpacked from source.
4. **Desktop is where the node is.** If you're running Bitcoin Core and Fulcrum, you're on a desktop or server. A browser extension connects to localhost with zero configuration.
5. **Cross-platform by default.** Chrome, Brave, Edge, Firefox — one codebase, every desktop OS.

The tradeoff is clear: you lose mobile convenience. We plan to address that with a companion Android app in Q3 2026. But the core wallet lives in the browser because that's where censorship resistance is highest.

---

## Technical decisions

### Your node, always

Every other Bitcoin wallet either runs its own backend or connects to a third-party API. Both models leak your addresses to someone. Sovereign Wallet's default configuration connects to `localhost` — your own Fulcrum or Electrum server. We provide fallback options (developer node, Blockstream, mempool.space) for testing and onboarding, but the entire architecture assumes you'll graduate to your own node.

### No custodians, no coordinators

Samourai's Whirlpool required a central coordinator to match CoinJoin participants. When that coordinator was seized, CoinJoin stopped. Sovereign Wallet's roadmap includes CoinJoin via Joinstr, a Nostr-based protocol where coordination happens over decentralized relays. No server to seize. No coordinator to arrest.

Until Joinstr is production-ready, we focus on Stonewall (self-spend transactions that mimic CoinJoin) and Ricochet (intermediate hops). These provide meaningful privacy without any external coordination.

### BIP352 Silent Payments first

Most wallet teams treat Silent Payments as a nice-to-have. We treat it as a priority. Silent Payments solve the fundamental problem of Bitcoin address reuse without requiring any interaction between sender and receiver. You publish a static address, and every payment to that address generates a unique on-chain output. No notification transactions, no server lookups, no BIP47 setup dance.

We shipped Silent Payments send support at launch. Receive support (which requires scanning every transaction in every block) is the Q2 2026 milestone.

### BIP47 PayNyms for backward compatibility

BIP47 is older and requires a notification transaction, but it works today with existing wallets that support it. We include it because pragmatism matters more than purity. Use Silent Payments when the sender supports BIP352. Use PayNyms when they don't.

---

## Vision: Bitcoin privacy in 2026

The surveillance landscape has changed. Chain analysis companies have contracts with every major government. Exchanges share data freely. KYC requirements expand every year. The on-chain heuristics get better, the clustering gets tighter, and the average Bitcoin user has no idea how exposed they are.

Bitcoin privacy in 2026 should look like this:

- **Default, not opt-in.** Privacy shouldn't require a PhD in cryptography. The wallet should make the private choice the easy choice.
- **Self-sovereign infrastructure.** Your node, your rules. No third-party API knows your balance, your addresses, or your transaction history.
- **Resilient to legal attacks.** Open source code. No company to subpoena. No server to seize. Decentralized coordination. The tools survive even if the developers don't.
- **Accessible to normal people.** Not everyone will run a node. That's fine. But the option should always be there, and the path from "quick start" to "fully sovereign" should be clear and well-documented.

We're not there yet. But every feature in Sovereign Wallet moves in that direction.

---

## Who built this and why

Sovereign Wallet was started by Bitcoin developers who watched the Samourai arrest and decided that privacy tools shouldn't have a kill switch. We're not a company. We don't have investors. We don't plan to have either.

We build this because Bitcoin without privacy is a surveillance tool. Because financial privacy is a human right, not a feature request. Because the Samourai codebase deserved to live on, and nobody else was doing it.

If you want to know more about the team, look at the commit history. The code speaks for itself.

---

## Contact

- GitHub: [github.com/nicacripto/sovereign-wallet](https://github.com/nicacripto/sovereign-wallet)
- Security: security@sovereign-wallet.dev
- General: hello@sovereign-wallet.dev
