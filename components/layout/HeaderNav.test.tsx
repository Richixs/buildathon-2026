import { render, screen } from "@testing-library/react";
import { useAccount } from "wagmi";
import HeaderNav from "@/components/layout/HeaderNav";

describe("HeaderNav", () => {
  it("shows the landing nav (marketing anchors) when disconnected", () => {
    jest.mocked(useAccount).mockReturnValue({
      isConnected: false,
    } as unknown as ReturnType<typeof useAccount>);

    render(<HeaderNav />);

    expect(screen.getByRole("link", { name: "STARTUPS" })).toHaveAttribute(
      "href",
      "/#startups",
    );
    expect(screen.getByRole("link", { name: "CÓMO_FUNCIONA" })).toHaveAttribute(
      "href",
      "/#como-funciona",
    );
    expect(
      screen.getByRole("link", { name: /para_quién_es_esto/i }),
    ).toHaveAttribute("href", "/#para-quien-es-esto");
    expect(
      screen.queryByRole("link", { name: /mi_panel/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the app nav (browse + dashboard) when a wallet is connected", () => {
    jest.mocked(useAccount).mockReturnValue({
      isConnected: true,
    } as unknown as ReturnType<typeof useAccount>);

    render(<HeaderNav />);

    expect(
      screen.getByRole("link", { name: /explorar_startups/i }),
    ).toHaveAttribute("href", "/startups");
    expect(screen.getByRole("link", { name: /mi_panel/i })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(
      screen.queryByRole("link", { name: /cómo_funciona/i }),
    ).not.toBeInTheDocument();
  });
});
