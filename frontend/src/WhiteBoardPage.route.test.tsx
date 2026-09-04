import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import WhiteBoardPage from "./WhiteBoardPage";
import { apiFetch } from "./api";

type RouteLocation = { pathname: string; search: string };
let mockRouteLocation: RouteLocation = { pathname: "/whiteboard/1", search: "?whiteboardId=1" };
let mockRouteHistory: RouteLocation[] = [];
let mockRouteIndex = 0;
let mockRefreshRoute: (() => void) | null = null;

jest.mock("react-router-dom", () => ({
  useLocation: () => mockRouteLocation,
  useNavigate: () => (to: RouteLocation) => {
    mockRouteHistory = mockRouteHistory.slice(0, mockRouteIndex + 1);
    mockRouteHistory.push(to);
    mockRouteIndex += 1;
    mockRouteLocation = to;
    mockRefreshRoute?.();
  },
  useParams: () => ({ id: mockRouteLocation.pathname.split("/")[2] }),
}), { virtual: true });

jest.mock("./api", () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

function ProductionWhiteboardRouteHarness() {
  const [, setVersion] = useState(0);
  mockRefreshRoute = () => setVersion((version) => version + 1);
  // Exact route registered in App.tsx. An altered continuation pathname takes
  // the unmatched branch, reproducing the manual header/footer-only failure.
  if (!/^\/whiteboard\/[^/]+$/.test(mockRouteLocation.pathname)) {
    return <div data-testid="unmatched-route">Unmatched route</div>;
  }
  return <WhiteBoardPage />;
}

function goBack() {
  if (mockRouteIndex === 0) return;
  mockRouteIndex -= 1;
  mockRouteLocation = mockRouteHistory[mockRouteIndex];
  mockRefreshRoute?.();
}

describe("WhiteBoardPage continuation route integration", () => {
  const canvasContext = {
    clearRect: jest.fn(), drawImage: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), save: jest.fn(), restore: jest.fn(), scale: jest.fn(), setTransform: jest.fn(),
  } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    mockRouteLocation = { pathname: "/whiteboard/1", search: "?whiteboardId=1" };
    mockRouteHistory = [mockRouteLocation];
    mockRouteIndex = 0;
    let whiteboardWrites = 0;
    mockedApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/classes/1") return { name: "6th Year", subject: "Maths" };
      if (url === "/api/whiteboards/1") return {
        id: 1, class_id: 1, title: "Fractions",
        state: { boardTitle: "Fractions", canvasHeight: 2400, placedImages: [], bgDataUrl: null, inkDataUrl: null },
      };
      if (url === "/api/whiteboard/save") return { id: 91 };
      if (url === "/api/whiteboards") {
        whiteboardWrites += 1;
        if (whiteboardWrites === 1) return { id: 1 };
        return {
          id: 2, class_id: 1, title: "Fractions - Part 2",
          state: { boardTitle: "Fractions - Part 2", canvasHeight: 2400, placedImages: [], bgDataUrl: null, inkDataUrl: null, gridApplied: false, axesApplied: false },
        };
      }
      if (url === "/api/whiteboards/1/link-note") return { ok: true };
      return [];
    });
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,canvas");
    jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["canvas"], { type: "image/png" })));
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockRefreshRoute = null;
    jest.restoreAllMocks();
  });

  test("keeps App's real /whiteboard/:id route mounted through continuation navigation and browser Back", async () => {
    render(<ProductionWhiteboardRouteHarness />);

    await screen.findByRole("region", { name: "Whiteboard canvas workspace" });
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & continue" }));

    await waitFor(() => expect(mockRouteLocation).toEqual({ pathname: "/whiteboard/1", search: "?whiteboardId=2" }));
    expect(screen.getByRole("region", { name: "Whiteboard canvas workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New board" })).toBeInTheDocument();
    expect(screen.getAllByText("Fractions - Part 2").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("unmatched-route")).not.toBeInTheDocument();

    await act(async () => { goBack(); });
    await waitFor(() => expect(mockRouteLocation.search).toBe("?whiteboardId=1"));
    await waitFor(() => expect(screen.getAllByText("Fractions").length).toBeGreaterThan(0));
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/whiteboards/1");
  });
});
