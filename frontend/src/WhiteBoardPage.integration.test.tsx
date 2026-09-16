import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WhiteBoardPage from "./WhiteBoardPage";
import { apiFetch } from "./api";

const mockLocation = { pathname: "/whiteboard/1", search: "" };
const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: "1" }),
}), { virtual: true });

jest.mock("./api", () => ({
  apiFetch: jest.fn(),
  apiFetchBlob: jest.fn(),
}));

jest.mock("./i18n/UiLanguageContext", () => ({
  useUiLanguage: () => ({
    t: (key: string) => ({
      "whiteboard.savedVideos": "Saved class videos",
      "whiteboard.savedVideosHelp": "Videos saved in this browser for the current class.",
      "whiteboard.videoPickerHelp": "Choose a video saved for this class or paste a YouTube link.",
      "whiteboard.noSavedVideos": "No videos have been saved for this class in this browser yet.",
      "whiteboard.noClassVideoContext": "Saved class videos are available when the Whiteboard is opened from a class. You can still paste a YouTube link below.",
      "whiteboard.checkingClassAccess": "Checking access to this class before showing saved videos…",
      "whiteboard.classVideoAccessRequired": "Saved class videos cannot be shown because this account does not have access to this class. You can still paste a YouTube link below.",
      "whiteboard.savedVideosLoadError": "We couldn’t load saved class videos from this browser. Try again.",
      "whiteboard.unsupportedSavedVideo": "This saved link is not a supported YouTube video. Update it in Videos before opening it here.",
      "whiteboard.selectVideo": "Select",
      "whiteboard.audioTooLarge": "The full audio upload request must stay below 100 MiB. Choose a file comfortably below this, and remember that your remaining Elume storage can also limit uploads.",
      "whiteboard.audioUploadLimit": "This audio upload was rejected before Elume could process it. The full upload request must stay below 100 MiB; other network limits may also apply.",
      "whiteboard.audioStorageLimit": "This audio file could not be uploaded because your Elume storage limit has been reached. Delete some files before trying again.",
      "whiteboard.audioUploadNetwork": "The audio upload did not complete. Check your connection and try again; larger files can take longer to upload.",
    }[key] || key),
  }),
}));

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function renderWhiteboard() {
  return render(<WhiteBoardPage />);
}

describe("WhiteBoardPage production workspace integration", () => {
  const canvasContext = {
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    setTransform: jest.fn(),
  } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    mockLocation.search = "";
    mockNavigate.mockReset();
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboards/1" || url === "/api/whiteboards/2") {
        return {
          id: url.endsWith("/1") ? 1 : 2,
          title: "Saved board",
          state: { boardTitle: "Saved board", canvasHeight: 2400, bgDataUrl: null, inkDataUrl: null },
        };
      }
      return [];
    });
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,canvas");
    jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["canvas"], { type: "image/png" })));
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps the measured canvas workspace full-width while wiring the real toolbar and extension lifecycle", async () => {
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    const workspace = screen.getByRole("region", { name: "Whiteboard canvas workspace" });
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1200 });
    const boardSurface = workspace.firstElementChild as HTMLElement;

    const workspaceShell = workspace.parentElement?.parentElement?.parentElement;
    expect(workspaceShell?.className).toContain("p-2");
    expect(workspaceShell?.className).not.toContain("grid-cols-[72px");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eraser" }));
    expect(screen.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "true");

    (canvasContext.drawImage as jest.Mock).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Extend board" }));

    await waitFor(() => expect(boardSurface.style.height).toBe("3600px"));
    expect(boardSurface.style.width).toBe("1200px");
    await waitFor(() => expect(canvasContext.drawImage).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Extend board" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Back to Class" }));
    expect(screen.getByText("Leave whiteboard?")).toBeInTheDocument();
  });

  test("opens a saved class video in the existing player without changing the board", async () => {
    localStorage.setItem("elume:videos:class:1", JSON.stringify([
      { id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Wave demonstration", category: "Waves", addedAt: 1 },
      { id: "broken", url: "https://example.test/video", title: "Old link", category: "Archive", addedAt: 2 },
    ]));
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    const workspace = screen.getByRole("region", { name: "Whiteboard canvas workspace" });

    fireEvent.click(screen.getByRole("button", { name: "Video" }));
    expect(await screen.findByText("Saved class videos")).toBeInTheDocument();
    expect(screen.getByText("Wave demonstration")).toBeInTheDocument();
    expect(screen.getByText(/not a supported YouTube video/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Wave demonstration").closest("li")!.querySelector("button")!);

    await waitFor(() => expect(screen.getByTitle("YouTube video for class")).toHaveAttribute(
      "src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1"
    ));
    expect(workspace).toBeInTheDocument();
  });

  test("does not read browser-local saved videos when class access is denied", async () => {
    localStorage.setItem("elume:videos:class:1", JSON.stringify([
      { id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Another account's cached video", addedAt: 1 },
    ]));
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") throw new Error("not found");
      return [];
    });
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Video" }));

    expect(await screen.findByText(/does not have access to this class/i)).toBeInTheDocument();
    expect(screen.queryByText("Another account's cached video")).not.toBeInTheDocument();
  });

  test("explains the verified audio request limit before starting an upload", async () => {
    renderWhiteboard();
    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Audio" }));

    const input = document.querySelector<HTMLInputElement>('input[accept*="audio/mpeg"]')!;
    const file = new File(["audio"], "lesson.mp3", { type: "audio/mpeg" });
    Object.defineProperty(file, "size", { configurable: true, value: 100 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText(/full audio upload request must stay below 100 MiB/i)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith("/api/notes/upload", expect.anything());
  });

  test("resets the real extension guard when another normal-height board is opened", async () => {
    mockLocation.search = "?whiteboardId=1";
    const { rerender } = renderWhiteboard();

    await waitFor(() => expect(screen.queryByText("Open whiteboard")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Extend board" }));
    expect(screen.getByRole("button", { name: "Extend board" })).toBeDisabled();

    mockLocation.search = "?whiteboardId=2";
    rerender(<WhiteBoardPage />);

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith("/api/whiteboards/2"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Extend board" })).toBeEnabled());
  });

  test("saves the current board, seeds its distinct continuation, and skips a redundant GET", async () => {
    let whiteboardCreates = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboard/save") return { id: 91 };
      if (url === "/api/whiteboards") {
        whiteboardCreates += 1;
        if (whiteboardCreates === 1) return { id: 101 };
        return {
          id: 102,
          class_id: 1,
          title: "Class Whiteboard - Part 2",
          state: {
            boardTitle: "Class Whiteboard - Part 2",
            canvasHeight: 2400,
            placedImages: [],
            bgDataUrl: null,
            inkDataUrl: null,
            gridApplied: false,
            axesApplied: false,
          },
        };
      }
      if (url === "/api/whiteboards/101/link-note") return { ok: true };
      return [];
    });
    const { rerender } = renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));

    expect(screen.getByRole("heading", { name: "Continue on a new board?" })).toBeInTheDocument();
    expect(screen.getByText("Class Whiteboard - Part 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/whiteboard/1", search: "?whiteboardId=102" }));
    const calls = mockedApiFetch.mock.calls.map(([url]) => url);
    expect(calls.indexOf("/api/whiteboard/save")).toBeLessThan(calls.lastIndexOf("/api/whiteboards"));
    const whiteboardBodies = mockedApiFetch.mock.calls
      .filter(([url]) => url === "/api/whiteboards")
      .map(([, options]) => JSON.parse(String((options as { body: string }).body)));
    expect(whiteboardBodies).toHaveLength(2);
    expect(whiteboardBodies[1]).toMatchObject({
      class_id: 1,
      title: "Class Whiteboard - Part 2",
      state: {
        canvasHeight: 2400,
        placedImages: [],
        bgDataUrl: null,
        inkDataUrl: null,
        gridApplied: false,
        axesApplied: false,
      },
    });
    expect(screen.getByText("Class Whiteboard - Part 2")).toBeInTheDocument();
    mockLocation.search = "?whiteboardId=102";
    rerender(<WhiteBoardPage />);
    expect(mockedApiFetch).not.toHaveBeenCalledWith("/api/whiteboards/102");
  });

  test("synchronously ignores a rapid second Save & continue activation", async () => {
    const saveControl: { resolve?: (value: { id: number }) => void } = {};
    const savePromise = new Promise<{ id: number }>((resolve) => { saveControl.resolve = resolve; });
    let whiteboardCreates = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboard/save") return savePromise;
      if (url === "/api/whiteboards") {
        whiteboardCreates += 1;
        if (whiteboardCreates === 1) return { id: 101 };
        return {
          id: 102,
          class_id: 1,
          title: "Class Whiteboard - Part 2",
          state: { boardTitle: "Class Whiteboard - Part 2", canvasHeight: 2400, placedImages: [], bgDataUrl: null, inkDataUrl: null },
        };
      }
      if (url === "/api/whiteboards/101/link-note") return { ok: true };
      return [];
    });
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    const continueButton = screen.getByRole("button", { name: "Save & continue" });
    fireEvent.click(continueButton);
    fireEvent.click(continueButton);
    await waitFor(() => expect(mockedApiFetch.mock.calls.filter(([url]) => url === "/api/whiteboard/save")).toHaveLength(1));

    saveControl.resolve?.({ id: 91 });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockedApiFetch.mock.calls.filter(([url]) => url === "/api/whiteboards")).toHaveLength(2);
  });

  test("clears a saved board geometry lock before seeding its blank continuation", async () => {
    mockLocation.search = "?whiteboardId=1";
    let whiteboardRequests = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboards/1") {
        return {
          id: 1,
          class_id: 1,
          title: "Wide board",
          state: { boardTitle: "Wide board", canvasHeight: 2400, boardWidth: 1600, boardDpr: 2, placedImages: [], bgDataUrl: null, inkDataUrl: null },
        };
      }
      if (url === "/api/whiteboard/save") return { id: 91 };
      if (url === "/api/whiteboards") {
        whiteboardRequests += 1;
        if (whiteboardRequests === 1) return { id: 1 };
        return {
          id: 2,
          class_id: 1,
          title: "Wide board - Part 2",
          state: { boardTitle: "Wide board - Part 2", canvasHeight: 2400, boardWidth: null, boardDpr: null, placedImages: [], bgDataUrl: null, inkDataUrl: null },
        };
      }
      if (url === "/api/whiteboards/1/link-note") return { ok: true };
      return [];
    });
    renderWhiteboard();

    const workspace = await screen.findByRole("region", { name: "Whiteboard canvas workspace" });
    Object.defineProperty(workspace, "clientWidth", { configurable: true, value: 1200 });
    const boardSurface = workspace.firstElementChild as HTMLElement;
    await waitFor(() => expect(boardSurface.style.width).toBe("1600px"));

    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ pathname: "/whiteboard/1", search: "?whiteboardId=2" }));
    await waitFor(() => expect(boardSurface.style.width).toBe("1200px"));
  });

  test("does not create or navigate when saving the current board fails", async () => {
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboard/save") throw new Error("save failed");
      return [];
    });
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText("That didn’t quite work")).toBeInTheDocument());
    expect(mockedApiFetch.mock.calls.map(([url]) => url)).not.toContain("/api/whiteboards");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("retains the saved current board when creating its continuation fails", async () => {
    let whiteboardRequests = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboard/save") return { id: 91 };
      if (url === "/api/whiteboards") {
        whiteboardRequests += 1;
        if (whiteboardRequests === 1) return { id: 101 };
        throw new Error("create failed");
      }
      if (url === "/api/whiteboards/101/link-note") return { ok: true };
      return [];
    });
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText(/current board is still available/i)).toBeInTheDocument());
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/whiteboards/101/link-note", expect.any(Object));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test("does not navigate when the create response is invalid", async () => {
    let whiteboardRequests = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboard/save") return { id: 91 };
      if (url === "/api/whiteboards") {
        whiteboardRequests += 1;
        return whiteboardRequests === 1 ? { id: 101 } : { id: 102, class_id: 1, title: "Class Whiteboard - Part 2" };
      }
      if (url === "/api/whiteboards/101/link-note") return { ok: true };
      return [];
    });
    renderWhiteboard();

    fireEvent.click(await screen.findByRole("button", { name: /start new whiteboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(screen.getByText(/current board is still available/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

});
