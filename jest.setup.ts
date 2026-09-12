import "@testing-library/jest-dom";

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
