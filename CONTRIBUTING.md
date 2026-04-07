# Contributing to Sovereign Wallet

We welcome contributions from anyone who cares about Bitcoin privacy. Here's how to get involved.

---

## Reporting bugs

Open a [GitHub Issue](https://github.com/nicacripto/sovereign-wallet/issues) with the following template:

```
**Description**: What happened?
**Expected behavior**: What should have happened?
**Steps to reproduce**:
1. ...
2. ...
3. ...
**Environment**: Browser version, OS, node type (own node / developer / Blockstream / etc.)
**Screenshots/logs**: If applicable.
```

Label it `bug`. Include as much detail as possible. If you can reproduce it consistently, say so.

---

## Proposing features

1. **Start a Discussion first.** Open a [GitHub Discussion](https://github.com/nicacripto/sovereign-wallet/discussions) under the "Ideas" category. Describe the problem you're solving, not just the feature you want.
2. **Get feedback.** Let the community and maintainers weigh in before you write code.
3. **Then open a PR.** Once there's rough consensus, implement it and submit a pull request.

We'd rather have a good discussion about a bad idea than a surprise PR that nobody asked for.

---

## Submitting a pull request

1. **Fork** the repository.
2. **Create a branch** from `main`: `git checkout -b feature/your-feature-name`
3. **Write your code.** Follow the rules below.
4. **Write tests.** Especially for anything touching crypto, key derivation, or transaction building.
5. **Run the test suite**: `npm test`
6. **Push** your branch and open a PR against `main`.
7. **Describe your changes** in the PR body. What does it do? Why? Any tradeoffs?

Keep PRs focused. One feature or fix per PR. If you're refactoring AND adding a feature, split them.

---

## Code rules

- **TypeScript strict mode.** No `any` types unless absolutely unavoidable (and justified in a comment).
- **Tests required for crypto code.** Key derivation, address generation, transaction building, signing — all of it needs tests. No exceptions.
- **No new dependencies without discussion.** Every dependency is an attack surface. Open a Discussion before adding one to `package.json`.
- **English only.** All code, comments, commit messages, and documentation must be in English.
- **Commit messages.** Use conventional format: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- **No secrets in code.** Ever. Not even in examples. Use `.env.example` with placeholder values.

---

## Security vulnerabilities

**Never open a public issue for security vulnerabilities.**

Email: **security@sovereign-wallet.dev**

See [SECURITY.md](SECURITY.md) for full details on responsible disclosure.

---

## Code of conduct

Be respectful. Be direct. Focus on the code, not the person. We're building privacy tools — paranoia is welcome, toxicity is not.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
