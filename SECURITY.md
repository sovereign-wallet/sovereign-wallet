# Security Policy

Sovereign Wallet handles private keys and Bitcoin transactions. Security vulnerabilities are taken extremely seriously.

---

## Reporting a vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Email: **security@sovereign-wallet.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

Encrypt your email with our PGP key if possible (key available on request).

---

## Response timeline

| Step | Timeframe |
|---|---|
| Acknowledgment of report | Within 48 hours |
| Initial assessment | Within 72 hours |
| Fix development | Depends on severity |
| Patch release | As soon as fix is verified |
| Public disclosure | After patch is deployed and users have time to update |

---

## What qualifies as a security issue

- Private key exposure or leakage
- Seed phrase exposure (in memory, logs, storage, network requests)
- Transaction signing bypasses or manipulation
- Address generation errors that could lead to fund loss
- UTXO data leakage to unintended third parties
- Node connection downgrade attacks (forcing connection to a surveilled node)
- Extension permission escalation
- Cross-site scripting (XSS) within the extension context
- Dependency vulnerabilities that affect key management or transaction building
- Any bypass of privacy features (Stonewall, Ricochet, coin control)

---

## What does NOT qualify

- UI bugs that don't expose sensitive data
- Feature requests
- Performance issues
- Typos in documentation

These should be reported as regular [GitHub Issues](https://github.com/nicacripto/sovereign-wallet/issues).

---

## Responsible disclosure

We ask that you:
1. **Do not** publicly disclose the vulnerability before we've had time to fix it.
2. **Do not** exploit the vulnerability beyond what's necessary to demonstrate it.
3. **Do not** access or modify other users' data.
4. **Give us reasonable time** to respond and deploy a fix.

---

## Hall of Fame

We recognize researchers who responsibly disclose security vulnerabilities. With your permission, we'll add your name (or pseudonym) here after the issue is resolved.

| Researcher | Vulnerability | Date |
|---|---|---|
| — | *Be the first* | — |

If you'd prefer to remain anonymous, we respect that completely.

---

## Scope

This policy applies to:
- The Sovereign Wallet browser extension
- All code in the `sovereign-wallet` repository
- Infrastructure operated by the project (developer node, website)

Third-party dependencies are in scope only when the vulnerability is exploitable through Sovereign Wallet.

---

## Safe harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:
- Act in good faith
- Avoid privacy violations, data destruction, or service disruption
- Follow this responsible disclosure policy

Thank you for helping keep Sovereign Wallet and its users safe.
