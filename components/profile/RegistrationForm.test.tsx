import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegistrationForm from "@/components/profile/RegistrationForm";

describe("RegistrationForm", () => {
  it("makes 'Nombre Legal' required when the role changes to Startup", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={jest.fn()} />);

    const legalNameInput = screen.getByLabelText(/nombre legal/i);
    expect(legalNameInput).not.toBeRequired();

    await user.click(screen.getByLabelText(/soy startup/i));

    expect(legalNameInput).toBeRequired();
  });

  it("makes 'Nombre Legal' optional again when switching back to Investor", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={jest.fn()} />);

    await user.click(screen.getByLabelText(/soy startup/i));
    await user.click(screen.getByLabelText(/soy inversor/i));

    expect(screen.getByLabelText(/nombre legal/i)).not.toBeRequired();
  });

  it("submits with the investor role and trimmed values", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    render(<RegistrationForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Alias"), "  satoshi_dev  ");
    await user.type(screen.getByLabelText("Biografía"), "  building  ");
    await user.click(screen.getByRole("button", { name: /crear perfil/i }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith({
      role: "investor",
      alias: "satoshi_dev",
      bio: "building",
      legalName: undefined,
    });
  });

  it("blocks submission and shows an error when alias is empty", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    render(<RegistrationForm onSubmit={handleSubmit} />);

    await user.click(screen.getByRole("button", { name: /crear perfil/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /alias es obligatorio/i,
    );
  });

  it("blocks submission for a Startup profile without a legal name", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    render(<RegistrationForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Alias"), "acme");
    await user.click(screen.getByLabelText(/soy startup/i));
    await user.click(screen.getByRole("button", { name: /crear perfil/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /nombre legal es obligatorio/i,
    );
  });

  it("submits with role startup and legalName once both are filled", async () => {
    const user = userEvent.setup();
    const handleSubmit = jest.fn();
    render(<RegistrationForm onSubmit={handleSubmit} />);

    await user.type(screen.getByLabelText("Alias"), "acme");
    await user.click(screen.getByLabelText(/soy startup/i));
    await user.type(screen.getByLabelText(/nombre legal/i), "Acme Inc.");
    await user.click(screen.getByRole("button", { name: /crear perfil/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      role: "startup",
      alias: "acme",
      bio: "",
      legalName: "Acme Inc.",
    });
  });
});
