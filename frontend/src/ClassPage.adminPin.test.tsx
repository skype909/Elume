import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "1" }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

import { ClassAdminPinGate, matchesClassAdminPin } from "./ClassPage";

function GateHarness({ onSubmit = jest.fn() }: { onSubmit?: jest.Mock }) {
  const [draft, setDraft] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <ClassAdminPinGate
      draft={draft}
      error={draft === "0000" ? "That PIN is not correct." : null}
      helpOpen={helpOpen}
      onDraftChange={setDraft}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      onToggleHelp={() => setHelpOpen((open) => !open)}
    />
  );
}

test("renders the Class Admin gate with a masked numeric Teacher Admin PIN and accessible help", () => {
  render(<GateHarness />);

  expect(screen.getByText("Enter Class Admin PIN")).toBeInTheDocument();
  const pin = screen.getByLabelText("Teacher Admin PIN");
  expect(pin).toHaveAttribute("type", "password");
  expect(pin).toHaveAttribute("inputmode", "numeric");

  const help = screen.getByRole("button", { name: "What is the Teacher Admin PIN?" });
  expect(help).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(help);
  expect(screen.getByText(/Dashboard → Teacher Admin/)).toBeInTheDocument();
  expect(screen.getByText(/different from the Class PIN used by students/)).toBeInTheDocument();
  expect(help).toHaveAttribute("aria-expanded", "true");
});

test("retains incorrect-PIN feedback and submits the entered Teacher Admin PIN", () => {
  const onSubmit = jest.fn();
  render(<GateHarness onSubmit={onSubmit} />);

  const pin = screen.getByLabelText("Teacher Admin PIN");
  fireEvent.change(pin, { target: { value: "0000" } });
  expect(screen.getByText("That PIN is not correct.")).toBeInTheDocument();

  fireEvent.change(pin, { target: { value: "2468" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("continues to accept only the configured Teacher Admin PIN before navigation", () => {
  const payload = btoa(JSON.stringify({ email: "teacher@example.com" }));
  localStorage.setItem("elume_token", `header.${payload}.signature`);
  localStorage.setItem(
    "elume_teacher_admin_v3__teacher@example.com",
    JSON.stringify({ adminPin: "2468" })
  );

  expect(matchesClassAdminPin("0000")).toBe(false);
  expect(matchesClassAdminPin(" 2468 ")).toBe(true);
});
