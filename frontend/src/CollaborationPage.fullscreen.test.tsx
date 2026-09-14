import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

let mockBoardMounts = 0;
const mockCollabBoard = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: "1" }),
}), { virtual: true });

jest.mock("./api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("./CollabBoard", () => ({
  __esModule: true,
  default: (props: { height?: number; roomKey: string }) => {
    const { useEffect } = require("react");
    useEffect(() => {
      mockBoardMounts += 1;
      return () => { mockBoardMounts -= 1; };
    }, []);
    mockCollabBoard(props);
    return <div data-testid="teacher-collab-board" data-height={props.height}>{props.roomKey}</div>;
  },
}));

import { apiFetch } from "./api";
import CollaborationPage from "./CollaborationPage";

const statusPayload = {
  session_code: "FOCUS1",
  title: "Collaboration Whiteboard",
  state: "lobby",
  room_count: 4,
  joined_count: 0,
  assigned_count: 0,
  board_round: 1,
};

async function createTeacherSession() {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(screen.getByTestId("teacher-collab-board")).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
}

describe("teacher collaboration full screen", () => {
  let fullscreenElement: Element | null = null;
  let requestFullscreen: jest.Mock;

  beforeEach(() => {
    mockBoardMounts = 0;
    mockCollabBoard.mockClear();
    requestFullscreen = jest.fn(function (this: Element) {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: jest.fn(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        return Promise.resolve();
      }),
    });
    (apiFetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/collab/create")) return Promise.resolve({ session_code: "FOCUS1" });
      if (url.endsWith("/participants")) return Promise.resolve({ participants: [] });
      return Promise.resolve({});
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => statusPayload }) as jest.Mock;
  });

  afterEach(() => {
    fullscreenElement = null;
  });

  test("keeps the single teacher board and complete toolbar in focus mode", async () => {
    render(<CollaborationPage />);
    await createTeacherSession();

    expect(screen.getByRole("button", { name: "Full Screen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Students 0" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Joined participants and room assignments")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pen" })).toBeVisible();
    expect(mockBoardMounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Students 0" }));
    expect(screen.getByText("Joined participants and room assignments")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close Students" }));
    expect(screen.queryByText("Joined participants and room assignments")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Exit Full Screen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Pen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Highlighter" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Eraser" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Students 0" })).toBeVisible();
    expect(screen.getByTestId("teacher-collab-board")).toHaveAttribute("data-height", expect.not.stringMatching(/^760$/));
    expect(mockBoardMounts).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Exit Full Screen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Full Screen" })).toBeVisible());
    expect(screen.getByTestId("teacher-collab-board")).toHaveAttribute("data-height", "760");
    expect(mockBoardMounts).toBe(1);
  });

  test("Esc and browser fullscreen exit return to the normal layout", async () => {
    render(<CollaborationPage />);
    await createTeacherSession();

    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    act(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Full Screen" })).toBeVisible());

    requestFullscreen.mockRejectedValueOnce(new Error("Fullscreen denied"));
    fireEvent.click(screen.getByRole("button", { name: "Full Screen" }));
    expect(screen.getByRole("button", { name: "Exit Full Screen" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Full Screen" })).toBeVisible());
    expect(mockBoardMounts).toBe(1);
  });
});
