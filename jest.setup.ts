import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "node:util";

// jsdom doesn't provide these globals, but viem (imported by InvestForm)
// needs them at module load time.
global.TextEncoder = TextEncoder;
// @ts-expect-error -- node's TextDecoder is structurally compatible with the
// DOM lib type jsdom expects here; only the generic input typing differs.
global.TextDecoder = TextDecoder;

// Baseline global fetch mock. Individual tests provide the response they
// need via `jest.mocked(fetch).mockResolvedValueOnce(...)`.
global.fetch = jest.fn();

// jsdom doesn't implement the Clipboard API — ConnectButton/WalletQrModal
// call navigator.clipboard.writeText(). `navigator.clipboard` is a
// non-configurable getter in jsdom, so Object.assign silently no-ops;
// defineProperty forces the override.
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true,
});

afterEach(() => {
  jest.clearAllMocks();
});
