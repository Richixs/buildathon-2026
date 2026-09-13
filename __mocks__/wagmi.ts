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

export const useChainId = jest.fn(() => 133);

export const useSwitchChain = jest.fn(() => ({ mutateAsync: jest.fn() }));

export const useWriteContract = jest.fn(() => ({ mutateAsync: jest.fn() }));

export const usePublicClient = jest.fn(() => undefined);

export const useReadContract = jest.fn(() => ({
  data: undefined as unknown,
  refetch: jest.fn(),
}));

export const useReadContracts = jest.fn(() => ({
  data: undefined as unknown,
  refetch: jest.fn(),
}));
