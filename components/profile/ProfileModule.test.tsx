import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegistrationForm from "@/components/profile/RegistrationForm";
import ProfileDashboard from "@/components/profile/ProfileDashboard";

// ProfileDashboard reads the connected wallet via wagmi's useAccount(), which
// throws outside of a WagmiProvider. Mocking it keeps this a fast, isolated
// unit test instead of standing up the whole wagmi/AppKit provider tree.
jest.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1234567890123456789012345678901234567890",
  }),
}));

describe("RegistrationForm", () => {
  it("makes 'Nombre Legal' required when the role changes to Startup", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={jest.fn()} />);

    const legalNameInput = screen.getByLabelText(/nombre legal/i);
    expect(legalNameInput).not.toBeRequired();

    await user.click(screen.getByLabelText(/soy startup/i));

    expect(legalNameInput).toBeRequired();
  });
});

describe("ProfileDashboard", () => {
  const investorProfile = {
    address: "0x1234567890123456789012345678901234567890",
    username: "satoshi_dev",
    bio: "Builder on-chain.",
    link: null,
    role: "investor" as const,
    legalName: null,
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => investorProfile,
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the "LANZAR_MI_STARTUP" button when the role is investor', async () => {
    render(<ProfileDashboard />);

    expect(
      await screen.findByRole("button", { name: /lanzar_mi_startup/i }),
    ).toBeInTheDocument();
  });

  it("opens the upgrade modal when 'LANZAR_MI_STARTUP' is clicked", async () => {
    const user = userEvent.setup();
    render(<ProfileDashboard />);

    const launchButton = await screen.findByRole("button", {
      name: /lanzar_mi_startup/i,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(launchButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
