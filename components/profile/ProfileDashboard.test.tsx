import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAccount } from "wagmi";
import ProfileDashboard from "@/components/profile/ProfileDashboard";

const ADDRESS = "0x1234567890123456789012345678901234567890";

const investorProfile = {
  address: ADDRESS,
  username: "satoshi_dev",
  bio: "Builder on-chain.",
  link: null,
  role: "investor" as const,
  legalName: null,
};

const startupProfile = {
  ...investorProfile,
  username: "acme_founder",
  role: "startup" as const,
  legalName: "Acme Inc.",
};

function mockFetchOnce(body: unknown, ok = true) {
  jest.mocked(fetch).mockResolvedValueOnce({
    ok,
    json: async () => body,
  } as Response);
}

describe("ProfileDashboard", () => {
  beforeEach(() => {
    jest.mocked(useAccount).mockReturnValue({
      address: ADDRESS,
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);
  });

  it("renders nothing when no wallet is connected", () => {
    jest
      .mocked(useAccount)
      .mockReturnValue({ address: undefined } as unknown as ReturnType<
        typeof useAccount
      >);

    const { container } = render(<ProfileDashboard />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the terminal loading state while the fetch is pending", () => {
    jest.mocked(fetch).mockReturnValue(new Promise(() => {}));

    render(<ProfileDashboard />);

    expect(
      screen.getByText(/obteniendo_datos_onchain/i),
    ).toBeInTheDocument();
  });

  it("shows a fallback message when the API returns no profile", async () => {
    mockFetchOnce(null, false);

    render(<ProfileDashboard />);

    expect(
      await screen.findByText(/no se encontró un perfil/i),
    ).toBeInTheDocument();
  });

  it("renders the investor view with the LANZAR_MI_STARTUP CTA", async () => {
    mockFetchOnce(investorProfile);

    render(<ProfileDashboard />);

    expect(
      await screen.findByRole("button", { name: /lanzar_mi_startup/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("[ 0 CAMPAÑAS ACTIVAS ]"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/verified_founder/i)).not.toBeInTheDocument();
  });

  it("opens the upgrade modal when LANZAR_MI_STARTUP is clicked", async () => {
    const user = userEvent.setup();
    mockFetchOnce(investorProfile);

    render(<ProfileDashboard />);

    await user.click(
      await screen.findByRole("button", { name: /lanzar_mi_startup/i }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the upgrade modal when Cancelar is clicked", async () => {
    const user = userEvent.setup();
    mockFetchOnce(investorProfile);

    render(<ProfileDashboard />);

    await user.click(
      await screen.findByRole("button", { name: /lanzar_mi_startup/i }),
    );
    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("persists the upgrade via PATCH and reflects it immediately", async () => {
    const user = userEvent.setup();
    mockFetchOnce(investorProfile); // GET on mount

    render(<ProfileDashboard />);

    await user.click(
      await screen.findByRole("button", { name: /lanzar_mi_startup/i }),
    );
    await user.type(screen.getByLabelText(/nombre legal/i), "Acme Inc.");

    mockFetchOnce(startupProfile); // PATCH response
    await user.click(screen.getByRole("button", { name: /actualizar perfil/i }));

    expect(await screen.findByText(/verified_founder/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          address: ADDRESS,
          role: "startup",
          legalName: "Acme Inc.",
        }),
      }),
    );
  });

  it("renders the minimalist empty state for a startup with no campaigns", async () => {
    mockFetchOnce(startupProfile);

    render(<ProfileDashboard />);

    expect(
      await screen.findByText("[ 0 CAMPAÑAS ACTIVAS ]"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /crear_nueva_campaña/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /lanzar_mi_startup/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the VERIFIED_FOUNDER badge for startup profiles", async () => {
    mockFetchOnce(startupProfile);

    render(<ProfileDashboard />);

    expect(await screen.findByText(/verified_founder/i)).toBeInTheDocument();
  });
});
