import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockApiFetch = jest.fn();
const mockGetToken = jest.fn(() => "test-token");

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("./api", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args), getToken: () => mockGetToken() }));

import AdminUsersPage from "./AdminUsersPage";

function response(status: number, detail: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify({ detail })),
  } as Response;
}

beforeEach(() => {
  const payload = btoa(JSON.stringify({ email: "admin@elume.ie" }));
  localStorage.setItem("elume_token", `header.${payload}.signature`);
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue([{ id: 9, email: "pilot@example.test", subscription_status: "inactive" }]);
  global.fetch = jest.fn()
    .mockResolvedValueOnce(response(409, {
      code: "USER_OWNS_CLASSES", class_count: 1, classes: [{ id: 8, name: "Owned class", subject: "Maths" }],
    }))
    .mockResolvedValueOnce(response(409, { code: "USER_RETAINED_HISTORY" })) as jest.Mock;
});

test("shows the safe retained-history blocker after hard-delete confirmation", async () => {
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  expect(await screen.findByText("This user still owns classes")).toBeInTheDocument();
  expect(screen.getByText("Any access grants belonging to this account will also be permanently removed.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Hard Delete" }));
  expect(await screen.findByText("This account has retained administrative history and cannot be permanently deleted.")).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
});
