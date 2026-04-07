const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
const env = meta.env ?? {};

export const DONATION_CONFIG = {
  bitcoinAddress: env.VITE_DONATION_BTC_ADDRESS || 'bc1qlwgnpsxxr7smmu880g26hfdzyrcd8egrqm0j8c',
  lightningAddress: env.VITE_DONATION_LIGHTNING_ADDRESS || 'peppyfortune074@walletofsatoshi.com',
  message: 'If Sovereign Wallet saved you from a privacy mistake, consider sending a few sats. This project has no investors, no company, no plans to have either.',
};
