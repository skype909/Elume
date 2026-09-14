import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ code: "ROOM1" }),
}), { virtual: true });

jest.mock("./CollabBoard", () => ({
  __esModule: true,
  default: () => <div data-testid="student-collab-board">board</div>,
}));

import StudentCollabRoomPage from "./StudentCollabRoomPage";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("elume:collab:participant:ROOM1", JSON.stringify({ anon_id: "anon-1", name: "Aoife", room_number: 1 }));
  global.fetch = jest.fn((url: string) => {
    if (url.includes("/status")) return Promise.resolve({ ok: true, json: async () => ({ state: "live", board_round: 1 }) });
    if (url.includes("/me/")) return Promise.resolve({ ok: true, json: async () => ({ anon_id: "anon-1", name: "Aoife", room_number: 1, session_state: "live" }) });
    if (url.includes("/participants")) return Promise.resolve({ ok: true, json: async () => ({ participants: [{ id: 1, name: "Aoife", room_number: 1 }] }) });
    return Promise.reject(new Error(`Unexpected ${url}`));
  }) as jest.Mock;
});

test("Room Members starts compact and opens over the student board", async () => {
  render(<StudentCollabRoomPage />);
  await waitFor(() => expect(screen.getByTestId("student-collab-board")).toBeVisible());

  const membersButton = screen.getByRole("button", { name: "Room members · 1" });
  expect(membersButton).toHaveAttribute("aria-expanded", "false");
  expect(document.querySelector("#student-room-members")).toBeNull();

  fireEvent.click(membersButton);
  expect(document.querySelector("#student-room-members")).toHaveTextContent("Aoife");
  expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
});
