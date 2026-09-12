// Manual mock for the `wagmi` package. Placed at the repo root so Jest
// applies it automatically to every test that imports from "wagmi" — no
// per-file `jest.mock("wagmi")` needed. Individual tests override the
// return values with `(useAccount as jest.Mock).mockReturnValue(...)`.
export const useAccount = jest.fn(() => ({
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
}));

export const useDisconnect = jest.fn(() => ({
  disconnect: jest.fn(),
}));

export const useSendTransaction = jest.fn(() => ({
  sendTransactionAsync: jest.fn(),
  isPending: false,
}));
