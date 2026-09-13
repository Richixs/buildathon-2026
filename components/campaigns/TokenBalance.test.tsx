import { render, screen } from "@testing-library/react";
import { useAccount, useReadContract } from "wagmi";
import TokenBalance from "@/components/campaigns/TokenBalance";

const ADDRESS = "0x1234567890123456789012345678901234567890";
const TOKEN = "0x4444444444444444444444444444444444444444";

describe("TokenBalance", () => {
  beforeEach(() => {
    jest.mocked(useAccount).mockReturnValue({
      address: ADDRESS,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
  });

  it("renders nothing until the balance is read", () => {
    const { container } = render(
      <TokenBalance tokenAddress={TOKEN} tokenSymbol="NXUS" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the connected wallet's balance with the ticker", () => {
    jest.mocked(useReadContract).mockReturnValue({
      data: BigInt("12500000000000000000"),
    } as unknown as ReturnType<typeof useReadContract>);

    render(<TokenBalance tokenAddress={TOKEN} tokenSymbol="NXUS" />);

    expect(screen.getByText("12.5 $NXUS en tu wallet")).toBeInTheDocument();
    expect(useReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: "balanceOf",
        args: [ADDRESS],
      }),
    );
  });
});
