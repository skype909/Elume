import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ClassAdminPage from "./ClassAdminPage";
import { apiFetch } from "./api";

let mockLocationPath = "/class/18/admin";
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useParams: () => ({ id: "18" }), useLocation: () => ({ pathname: mockLocationPath }) }), { virtual: true });
jest.mock("./api", () => ({ apiFetch: jest.fn() }));
jest.mock("./i18n/UiLanguageContext", () => ({ useUiLanguage: () => ({ language: "en", t: (key: string) => key }) }));
const mockedApi = apiFetch as jest.MockedFunction<typeof apiFetch>;

function basicResponses(initialAacEnabled = false) {
  let aacEnabled = initialAacEnabled;
  mockedApi.mockImplementation((path: string) => {
    if (path.endsWith("/students") || path.endsWith("/assessments")) return Promise.resolve([]) as any;
    if (path.includes("/student-access/")) return Promise.resolve({ token: null }) as any;
    if (path.endsWith("/insights")) return Promise.resolve({ class_average: null, assessment_count: 0, active_student_count: 0, student_rankings: [], at_risk: [] }) as any;
    if (path.endsWith("/cat4/meta")) return Promise.reject(new Error("No CAT4 access")) as any;
    if (path.endsWith("/aac")) return Promise.resolve({ enabled: aacEnabled, project: null }) as any;
    if (path.endsWith("/aac/enabled")) { aacEnabled = true; return Promise.resolve({ enabled: true }) as any; }
    return Promise.resolve({}) as any;
  });
}
beforeEach(() => { mockLocationPath = "/class/18/admin"; mockedApi.mockReset(); basicResponses(); });

test("AAC starts as a compact Insights entry and does not require CAT4", async () => {
  render(<ClassAdminPage />);
  expect(screen.queryByRole("button", { name: "AAC Tracker" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Insights" }));
  expect(await screen.findByRole("button", { name: "Enable AAC Tracker" })).toBeInTheDocument();
  expect(screen.getByText("At-risk students")).toBeInTheDocument();
  expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/cat4/meta");
  expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac");
});

test("discovers an enabled AAC project before mounting the planner tab", async () => {
  mockedApi.mockReset();
  basicResponses(true);
  render(<ClassAdminPage />);
  expect(await screen.findByRole("button", { name: "AAC Tracker" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Insights" })).toBeInTheDocument();
  expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac");
});

test("enabling AAC is class-scoped and opens the dedicated planner tab", async () => {
  render(<ClassAdminPage />);
  fireEvent.click(screen.getByRole("button", { name: "Insights" }));
  fireEvent.click(await screen.findByRole("button", { name: "Enable AAC Tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/enabled", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/classes/19/aac"))).toBe(false);
  const plannerTab = await screen.findByRole("button", { name: "AAC Tracker" });
  expect(plannerTab).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Create AAC tracker" })).toBeInTheDocument();
});

test("the AAC compatibility URL opens the same dedicated planner tab", async () => {
  mockLocationPath = "/class/18/admin/aac";
  mockedApi.mockReset();
  basicResponses(true);
  render(<ClassAdminPage />);
  expect(await screen.findByRole("button", { name: "AAC Tracker" })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Create AAC tracker" })).toBeInTheDocument();
});

test("Insights remains selected after AAC discovery refreshes", async () => {
  mockedApi.mockReset();
  basicResponses(true);
  render(<ClassAdminPage />);
  fireEvent.click(await screen.findByRole("button", { name: "AAC Tracker" }));
  expect(await screen.findByRole("heading", { name: "Create AAC tracker" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Insights" }));
  expect(await screen.findByText("At-risk students")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Create AAC tracker" })).not.toBeInTheDocument());
});
