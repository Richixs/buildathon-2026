import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAccount, useReadContracts } from "wagmi";
import InvestForm from "@/components/campaigns/InvestForm";
import { useEscrowWrite } from "@/hooks/use-escrow-write";
import { useCheckProfile } from "@/hooks/use-profile";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const FOUNDER = "0x2222222222222222222222222222222222222222";
const ESCROW = "0x9999999999999999999999999999999999999999";
const CAMPAIGN_ID = "campaign_1";
const TX_HASH = `0x${"ab".repeat(32)}`;
const HSK = BigInt("1000000000000000000");

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: jest.fn() }),
}));

jest.mock("@/hooks/use-escrow-write", () => ({ useEscrowWrite: jest.fn() }));
jest.mock("@/hooks/use-profile", () => ({ useCheckProfile: jest.fn() }));

function mockFetchOnce(body: unknown, ok = true) {
  jest.mocked(fetch).mockResolvedValueOnce({
    ok,
    json: async () => body,
  } as Response);
}

function connectAs(address: string | undefined) {
  jest.mocked(useAccount).mockReturnValue({
    address,
    isConnected: Boolean(address),
  } as unknown as ReturnType<typeof useAccount>);
}

// [status, goalAmount, totalRaised, fundingDeadline] — goal 100 HSK,
// 90 raised, so 10 HSK remain.
function mockEscrow({
  status = 0,
  raised = BigInt(90) * HSK,
  deadlineOffsetSeconds = 3600,
}: {
  status?: number;
  raised?: bigint;
  deadlineOffsetSeconds?: number;
} = {}) {
  const refetch = jest.fn();
  jest.mocked(useReadContracts).mockReturnValue({
    data: [
      status,
      BigInt(100) * HSK,
      raised,
      BigInt(Math.floor(Date.now() / 1000) + deadlineOffsetSeconds),
    ],
    refetch,
  } as unknown as ReturnType<typeof useReadContracts>);
  return refetch;
}

// Mirrors useEscrowWrite: runs the caller's submit() against a fake
// writeContract, then resolves with a mined receipt.
function mockSend(write = jest.fn().mockResolvedValue(TX_HASH)) {
  const send = jest.fn(
    async (
      submit: (w: typeof write) => Promise<string>,
      options?: { onSubmitted?: (hash: string) => void },
    ) => {
      const hash = await submit(write);
      options?.onSubmitted?.(hash);
      return { transactionHash: hash };
    },
  );
  jest
    .mocked(useEscrowWrite)
    .mockReturnValue(send as unknown as ReturnType<typeof useEscrowWrite>);
  return { send, write };
}

function renderForm() {
  return render(
    <InvestForm
      campaignId={CAMPAIGN_ID}
      contractAddress={ESCROW}
      founderAddress={FOUNDER}
    />,
  );
}

async function invest(amount: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText(/monto a invertir/i);
  await user.clear(input);
  await user.type(input, amount);
  await user.click(screen.getByRole("button", { name: /invertir_ahora/i }));
  return user;
}

describe("InvestForm", () => {
  beforeEach(() => {
    connectAs(ADDRESS);
    jest.mocked(useCheckProfile).mockReturnValue({
      data: { address: ADDRESS },
      isLoading: false,
    } as unknown as ReturnType<typeof useCheckProfile>);
    mockEscrow();
    mockSend();
  });

  it("shows the connect prompt when no wallet is connected", () => {
    connectAs(undefined);

    renderForm();

    expect(
      screen.getByText(/conecta tu wallet para invertir/i),
    ).toBeInTheDocument();
  });

  it("blocks the founder from investing in their own campaign", () => {
    connectAs(FOUNDER.toUpperCase().replace("0X", "0x"));

    renderForm();

    expect(screen.getByText(/no puedes invertir en ella/i)).toBeInTheDocument();
  });

  it("renders nothing while the profile check is loading", () => {
    jest.mocked(useCheckProfile).mockReturnValue({
      data: null,
      isLoading: true,
    } as unknown as ReturnType<typeof useCheckProfile>);

    const { container } = renderForm();

    expect(container).toBeEmptyDOMElement();
  });

  it("asks for a profile before sending HSK", () => {
    jest.mocked(useCheckProfile).mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as ReturnType<typeof useCheckProfile>);

    renderForm();

    expect(screen.getByText(/registra tu perfil/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crear_perfil/i })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("shows a loading state until the escrow is read", () => {
    jest.mocked(useReadContracts).mockReturnValue({
      data: undefined,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useReadContracts>);

    renderForm();

    expect(screen.getByText(/leyendo_escrow_onchain/i)).toBeInTheDocument();
  });

  it.each([
    ["the escrow is no longer Funding", { status: 1 }],
    ["the funding deadline passed", { deadlineOffsetSeconds: -60 }],
    ["the goal is already filled", { raised: BigInt(100) * HSK }],
  ])("closes the form when %s", (_label, escrow) => {
    mockEscrow(escrow);

    renderForm();

    expect(screen.getByText(/ya no acepta inversiones/i)).toBeInTheDocument();
  });

  it("calls escrow.invest() with the amount in wei and records the tx", async () => {
    const refetch = mockEscrow();
    const { write } = mockSend();
    mockFetchOnce({ id: "investment_1" });

    renderForm();
    await invest("5");

    expect(
      await screen.findByText(/inversión confirmada on-chain/i),
    ).toBeInTheDocument();
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ESCROW,
        functionName: "invest",
        value: BigInt(5) * HSK,
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/investments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          walletAddress: ADDRESS,
          campaignId: CAMPAIGN_ID,
          txHash: TX_HASH,
        }),
      }),
    );
    expect(refetch).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("rejects an amount above what's left to the goal without opening the wallet", async () => {
    const { send } = mockSend();

    renderForm();
    await invest("11");

    expect(
      await screen.findByText(/supera lo que falta para la meta \(10 HSK\)/i),
    ).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an amount that rounds down to 0 wei", async () => {
    const { send } = mockSend();

    renderForm();
    await invest("0.0000000000000000001");

    expect(await screen.findByText(/demasiado pequeño/i)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the wallet step while the tx waits for a signature", async () => {
    const write = jest.fn(() => new Promise<string>(() => {}));
    mockSend(write);

    renderForm();
    await invest("5");

    const button = await screen.findByRole("button", {
      name: /firma_en_wallet/i,
    });
    expect(button).toBeDisabled();
  });

  it("doesn't call the API when the wallet rejects the tx", async () => {
    mockSend(jest.fn().mockRejectedValue(new Error("User rejected.")));

    renderForm();
    await invest("5");

    expect(await screen.findByText(/user rejected/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets the investor retry the bookkeeping without re-sending HSK", async () => {
    const { send } = mockSend();
    mockFetchOnce({ error: "No se pudo leer HashKey Chain." }, false);

    renderForm();
    const user = await invest("5");

    expect(
      await screen.findByText(/no se pudo leer hashkey chain/i),
    ).toBeInTheDocument();

    mockFetchOnce({ id: "investment_1" });
    await user.click(
      screen.getByRole("button", { name: /reintentar_registro/i }),
    );

    expect(
      await screen.findByText(/inversión confirmada on-chain/i),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
