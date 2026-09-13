import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: "1" }),
}), { virtual: true });

jest.mock("./api", () => ({
  apiFetch: jest.fn(),
}));

import CollaborationPage from "./CollaborationPage";

test("draft collaboration keeps Start, Elume Templates, and My Saved Boards as separate actions", () => {
  render(<CollaborationPage />);

  expect(screen.getByRole("button", { name: "Start" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Load Elume Template" })).toBeVisible();
  expect(screen.getByRole("button", { name: "My Saved Boards" })).toBeVisible();
  expect(screen.queryByText("Start by creating session")).not.toBeInTheDocument();
});

test("a template chosen before session creation is retained as a pending draft template", () => {
  render(<CollaborationPage />);

  fireEvent.click(screen.getByRole("button", { name: "Load Elume Template" }));
  expect(screen.getByRole("heading", { name: "Elume Collaboration Templates" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Gaeilge" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Science" })).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: "English" }));
  fireEvent.click(screen.getByRole("button", { name: "Character Profile" }));
  expect(screen.getByRole("button", { name: "Use Template" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Use Template" }));

  expect(screen.getByText("Template ready")).toBeVisible();
  expect(screen.getByText("Character Profile")).toBeVisible();
});
