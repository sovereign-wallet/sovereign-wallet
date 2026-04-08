const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
const env = meta.env ?? {};

export const DONATION_CONFIG = {
  bitcoinAddress: env.VITE_DONATION_BTC_ADDRESS || '',
  lightningAddress: env.VITE_DONATION_LIGHTNING_ADDRESS || '',
  message: 'If Sovereign Wallet saved you from a privacy mistake, consider sending a few sats. This project has no investors, no company, no plans to have either.',
};
