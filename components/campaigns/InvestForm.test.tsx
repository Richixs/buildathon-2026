import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAccount, useSendTransaction } from "wagmi";
import InvestForm from "@/components/campaigns/InvestForm";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const TREASURY = "0x9999999999999999999999999999999999999999";
const CAMPAIGN_ID = "campaign_1";
const ORIGINAL_TREASURY_ENV = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: jest.fn() }),
}));

function mockFetchOnce(body: unknown, ok = true) {
  jest.mocked(fetch).mockResolvedValueOnce({
    ok,
    json: async () => body,
  } as Response);
}

describe("InvestForm", () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS = ORIGINAL_TREASURY_ENV;
  });

  it("shows a config-missing message when NEXT_PUBLIC_TREASURY_ADDRESS isn't set", () => {
    delete process.env.NEXT_PUBLIC_TREASURY_ADDRESS;
    jest.mocked(useAccount).mockReturnValue({
      address: ADDRESS,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);

    render(<InvestForm campaignId={CAMPAIGN_ID} />);

    expect(screen.getByText(/inversión no disponible/i)).toBeInTheDocument();
  });

  it("shows the connect prompt when no wallet is connected", () => {
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS = TREASURY;
    jest.mocked(useAccount).mockReturnValue({
      address: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);

    render(<InvestForm campaignId={CAMPAIGN_ID} />);

    expect(
      screen.getByText(/conecta tu wallet para invertir/i),
    ).toBeInTheDocument();
  });

  describe("when connected and configured", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_TREASURY_ADDRESS = TREASURY;
      jest.mocked(useAccount).mockReturnValue({
        address: ADDRESS,
        isConnected: true,
      } as unknown as ReturnType<typeof useAccount>);
    });

    it("sends a native transfer and records the investment on success", async () => {
      const sendTransactionAsync = jest.fn().mockResolvedValue("0xhash");
      jest.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync,
        isPending: false,
      } as unknown as ReturnType<typeof useSendTransaction>);
      mockFetchOnce({ id: "investment_1" });

      const user = userEvent.setup();
      render(<InvestForm campaignId={CAMPAIGN_ID} />);

      const input = screen.getByLabelText(/monto a invertir/i);
      await user.clear(input);
      await user.type(input, "5");
      await user.click(screen.getByRole("button", { name: /invertir_ahora/i }));

      expect(
        await screen.findByText(/inversión registrada/i),
      ).toBeInTheDocument();
      expect(sendTransactionAsync).toHaveBeenCalledWith({
        to: TREASURY,
        value: BigInt("5000000000000000000"),
      });
      expect(fetch).toHaveBeenCalledWith(
        "/api/investments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            walletAddress: ADDRESS,
            campaignId: CAMPAIGN_ID,
            amount: 5,
            txHash: "0xhash",
          }),
        }),
      );
      expect(mockRefresh).toHaveBeenCalled();
    });

    it("disables the button and shows ENVIANDO_TX while the transfer is in flight", async () => {
      let resolveSend: (hash: string) => void = () => {};
      const sendTransactionAsync = jest.fn(
        () => new Promise<string>((resolve) => (resolveSend = resolve)),
      );
      jest.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync,
        isPending: false,
      } as unknown as ReturnType<typeof useSendTransaction>);

      const user = userEvent.setup();
      render(<InvestForm campaignId={CAMPAIGN_ID} />);

      const input = screen.getByLabelText(/monto a invertir/i);
      await user.clear(input);
      await user.type(input, "5");
      await user.click(screen.getByRole("button", { name: /invertir_ahora/i }));

      const button = await screen.findByRole("button", {
        name: /enviando_tx/i,
      });
      expect(button).toBeDisabled();

      mockFetchOnce({ id: "investment_1" });
      resolveSend("0xhash");

      expect(
        await screen.findByText(/inversión registrada/i),
      ).toBeInTheDocument();
    });

    it("shows an error message when the API rejects the investment", async () => {
      const sendTransactionAsync = jest.fn().mockResolvedValue("0xhash");
      jest.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync,
        isPending: false,
      } as unknown as ReturnType<typeof useSendTransaction>);
      mockFetchOnce({ error: "Esta campaña ya no acepta inversiones." }, false);

      const user = userEvent.setup();
      render(<InvestForm campaignId={CAMPAIGN_ID} />);

      const input = screen.getByLabelText(/monto a invertir/i);
      await user.clear(input);
      await user.type(input, "5");
      await user.click(screen.getByRole("button", { name: /invertir_ahora/i }));

      expect(
        await screen.findByText(/ya no acepta inversiones/i),
      ).toBeInTheDocument();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("doesn't call the API when the wallet transfer is rejected", async () => {
      const sendTransactionAsync = jest
        .fn()
        .mockRejectedValue(new Error("User rejected the request."));
      jest.mocked(useSendTransaction).mockReturnValue({
        sendTransactionAsync,
        isPending: false,
      } as unknown as ReturnType<typeof useSendTransaction>);

      const user = userEvent.setup();
      render(<InvestForm campaignId={CAMPAIGN_ID} />);

      const input = screen.getByLabelText(/monto a invertir/i);
      await user.clear(input);
      await user.type(input, "5");
      await user.click(screen.getByRole("button", { name: /invertir_ahora/i }));

      expect(
        await screen.findByText(/user rejected the request/i),
      ).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
