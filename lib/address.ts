export function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Canonical storage/lookup form for addresses — EIP-55 checksum casing is a
// client-side display nicety, not part of address identity, so we don't want
// two DB rows for the same address that differ only in casing.
export function normalizeAddress(address: string) {
  return address.toLowerCase();
}
