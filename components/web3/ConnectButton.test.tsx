import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAccount, useDisconnect } from "wagmi";
import ConnectButton from "@/components/web3/ConnectButton";

const ADDRESS = "0x1234567890123456789012345678901234567890";

const mockOpen = jest.fn();

jest.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: mockOpen }),
}));

describe("ConnectButton", () => {
  const mockDisconnect = jest.fn();

  beforeEach(() => {
    jest.mocked(useAccount).mockReturnValue({
      address: ADDRESS,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
    jest
      .mocked(useDisconnect)
      .mockReturnValue({ disconnect: mockDisconnect } as unknown as ReturnType<
        typeof useDisconnect
      >);
  });

  it("shows the CONECTAR_WALLET trigger when disconnected and opens the modal on click", async () => {
    jest.mocked(useAccount).mockReturnValue({
      address: undefined,
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);

    const user = userEvent.setup();
    render(<ConnectButton />);

    const trigger = screen.getByRole("button", { name: /conectar_wallet/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the custom dropdown with the wallet actions when connected", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /0x1234/i }));

    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /ver mi perfil/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /copiar dirección/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /desconectar/i }),
    ).toBeInTheDocument();
  });

  it("calls disconnect() when 'Desconectar' is clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    await user.click(screen.getByRole("menuitem", { name: /desconectar/i }));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside of it", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("copies the address to the clipboard when 'Copiar Dirección' is clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /copiar dirección/i }),
    );

    // user-event's clipboard emulation replaces navigator.clipboard for its
    // own copy/paste simulation, so we assert the observable UI feedback
    // instead of spying on navigator.clipboard.writeText directly.
    expect(await screen.findByText(/¡copiado!/i)).toBeInTheDocument();
  });

  it("closes the dropdown when a placeholder menu item is clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /mis inversiones/i }),
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    await user.click(screen.getByRole("menuitem", { name: /mis startups/i }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens and closes the wallet QR modal", async () => {
    const user = userEvent.setup();
    render(<ConnectButton />);

    await user.click(screen.getByRole("button", { name: /0x1234/i }));
    await user.click(screen.getByRole("menuitem", { name: /ver código qr/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cerrar/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
