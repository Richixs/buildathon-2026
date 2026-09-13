// Every amount in the app is native HSK (see EquityEscrow.sol), never USD.
const AMOUNT_FORMAT = { maximumFractionDigits: 6 } as const;

export function formatHsk(amount: number): string {
  return `${amount.toLocaleString("en-US", AMOUNT_FORMAT)} HSK`;
}

// EquityToken is minted 1:1 per wei of HSK, so it shares HSK's 18 decimals.
export function formatTokens(amount: number, tokenSymbol: string): string {
  return `${amount.toLocaleString("en-US", AMOUNT_FORMAT)} $${tokenSymbol}`;
}
