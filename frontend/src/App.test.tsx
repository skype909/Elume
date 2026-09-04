import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UiLanguageProvider } from "./i18n/UiLanguageContext";

const mockApiFetch = jest.fn();

jest.mock("react-router-dom", () => {
  const React = require("react");
  let location = { pathname: "/", state: null as unknown };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const useLocation = () => {
    const [, rerender] = React.useState(0);
    React.useEffect(() => {
      const listener = () => rerender((value: number) => value + 1);
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []);
    return location;
  };

  const useNavigate = () => (to: string, options: { state?: unknown } = {}) => {
    location = { pathname: to, state: options.state ?? null };
    notify();
  };

  return {
    useLocation,
    useNavigate,
    Route: () => null,
    Routes: ({ children }: { children: React.ReactNode }) => {
      useLocation();
      const match = React.Children.toArray(children).find(
        (child: any) => child?.props?.path === location.pathname
      ) as any;
      return match?.props?.element ?? null;
    },
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
    __setLocation: (next: { pathname: string; state?: unknown }) => {
      location = { pathname: next.pathname, state: next.state ?? null };
      notify();
    },
    __getLocation: () => location,
  };
}, { virtual: true });

jest.mock("./api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  apiFetchBlob: jest.fn(),
  getToken: () => globalThis.localStorage.getItem("elume_token"),
  clearToken: () => globalThis.localStorage.removeItem("elume_token"),
}));

jest.mock("jspdf", () => ({ jsPDF: jest.fn(), default: jest.fn() }));
jest.mock("html-to-image", () => ({ toPng: jest.fn() }));

import App from "./App";

const router = require("react-router-dom") as {
  __setLocation: (next: { pathname: string; state?: unknown }) => void;
  __getLocation: () => { pathname: string; state: unknown };
};

function renderApp() {
  return render(
    <UiLanguageProvider>
      <App />
    </UiLanguageProvider>
  );
}

function setAuthenticatedTeacher() {
  const payload = btoa(JSON.stringify({ email: "teacher@example.com" }));
  localStorage.setItem("elume_token", `header.${payload}.signature`);
}

function setAuthenticatedGaeilgeReviewer() {
  const payload = btoa(JSON.stringify({ email: "peter@elume.ie" }));
  localStorage.setItem("elume_token", `header.${payload}.signature`);
}

function setApiResponses(classes: unknown | Promise<unknown>, state: unknown = { state: null }) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/classes") return Promise.resolve(classes);
    if (path === "/teacher-admin/state") return Promise.resolve(state);
    if (path === "/auth/me") return Promise.resolve({ role: "teacher" });
    if (path === "/billing/me") return Promise.resolve({});
    return Promise.resolve({});
  });
}

beforeEach(() => {
  localStorage.clear();
  setAuthenticatedTeacher();
  mockApiFetch.mockReset();
  router.__setLocation({ pathname: "/" });
  globalThis.structuredClone = ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone;
  window.matchMedia = jest.fn().mockReturnValue({ matches: false, addListener: jest.fn(), removeListener: jest.fn() });
});

describe("class-first onboarding integration", () => {
  test("Dashboard passes Gaeilge language state through to the date-card locale", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
    setAuthenticatedGaeilgeReviewer();
    setApiResponses([]);

    const fixedDate = new Date();
    const englishDay = new Intl.DateTimeFormat("en-IE", { weekday: "long" }).format(fixedDate);
    const englishDate = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric" }).format(fixedDate);
    const irishDay = new Intl.DateTimeFormat("ga-IE", { weekday: "long" }).format(fixedDate);
    const irishDate = new Intl.DateTimeFormat("ga-IE", { day: "numeric", month: "long", year: "numeric" }).format(fixedDate);

    try {
      renderApp();

      expect(await screen.findByText(englishDay)).toBeInTheDocument();
      expect(screen.getByText(englishDate)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Gaeilge" }));

      expect(await screen.findByText(irishDay)).toBeInTheDocument();
      expect(screen.getByText(irishDate)).toBeInTheDocument();
      expect(screen.queryByText(englishDay)).not.toBeInTheDocument();
      expect(screen.queryByText(englishDate)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("renders the real Dashboard welcome card only for a successful empty class list", async () => {
    setApiResponses(Promise.resolve([]));
    renderApp();

    expect(await screen.findByText("Welcome to Elume")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create my first class" })).toBeInTheDocument();
    expect(screen.getByText("No classes yet — click Create Class to start.")).toBeInTheDocument();
  });

  test("loading and failed class requests do not render either Dashboard empty-account state", async () => {
    let rejectClasses: (error: Error) => void = () => {};
    const pendingClasses = new Promise<unknown[]>((_, reject) => { rejectClasses = reject; });
    setApiResponses(pendingClasses);
    const { unmount } = renderApp();

    expect(screen.queryByText("Welcome to Elume")).not.toBeInTheDocument();
    expect(screen.queryByText("No classes yet — click Create Class to start.")).not.toBeInTheDocument();

    rejectClasses(new Error("offline"));
    expect(await screen.findByText("That didn’t quite work")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Elume")).not.toBeInTheDocument();
    expect(screen.queryByText("No classes yet — click Create Class to start.")).not.toBeInTheDocument();
    unmount();
  });

  test("a malformed class response does not render either Dashboard empty-account state", async () => {
    setApiResponses({ classes: [] });
    renderApp();

    expect(await screen.findByText("That didn’t quite work")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Elume")).not.toBeInTheDocument();
    expect(screen.queryByText("No classes yet — click Create Class to start.")).not.toBeInTheDocument();
  });

  test("the real create dialog opens and successful creation refreshes the exact server class list", async () => {
    let classGetCount = 0;
    mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === "/classes" && init?.method === "POST") {
        return Promise.resolve({ id: 2, name: "1st Year", subject: "Maths", color: "emerald" });
      }
      if (path === "/classes") {
        classGetCount += 1;
        return Promise.resolve(classGetCount === 1 ? [] : [
          { id: 1, name: "2nd Year", subject: "Science", color: "violet" },
          { id: 2, name: "1st Year", subject: "Maths", color: "emerald" },
        ]);
      }
      if (path === "/auth/me") return Promise.resolve({ role: "teacher" });
      if (path === "/billing/me") return Promise.resolve({});
      return Promise.resolve({});
    });
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Create my first class" }));
    expect(screen.getAllByText("Create Class").length).toBeGreaterThan(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Create Class" }).at(-1)!);
    await waitFor(() => expect(screen.queryByText("Welcome to Elume")).not.toBeInTheDocument());
    expect(await screen.findByText("2nd Year")).toBeInTheDocument();
    expect(screen.getByText("1st Year")).toBeInTheDocument();
  });

  test("Teacher Admin zero-class handoff opens the real Dashboard dialog once", async () => {
    router.__setLocation({ pathname: "/admin", state: { source: "keep-me" } });
    setApiResponses(Promise.resolve([]));
    const firstRender = renderApp();

    expect(await screen.findByText("Create classes before setting up your timetable")).toBeInTheDocument();
    expect(screen.queryByText("Weekly Timetable")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print Timetable" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create classes" }));
    await waitFor(() => expect(screen.getAllByText("Create Class").length).toBeGreaterThan(1));
    expect(router.__getLocation()).toEqual({ pathname: "/", state: null });

    firstRender.unmount();
    renderApp();
    await screen.findByText("Welcome to Elume");
    expect(screen.queryByText("Choose stream/year/level and a tile colour.")).not.toBeInTheDocument();
  });

  test("Dashboard consumes only openCreateClass and preserves unrelated route state", async () => {
    router.__setLocation({ pathname: "/", state: { openCreateClass: true, source: "keep-me" } });
    setApiResponses(Promise.resolve([]));
    renderApp();

    await waitFor(() => expect(screen.getAllByText("Create Class").length).toBeGreaterThan(1));
    expect(router.__getLocation()).toEqual({ pathname: "/", state: { source: "keep-me" } });
  });

  test("existing classes show explicit setup without automatically opening the real timetable wizard", async () => {
    router.__setLocation({ pathname: "/admin" });
    setApiResponses(Promise.resolve([{ id: 1, name: "1st Year", subject: "Maths", color: "violet" }]));
    renderApp();

    expect(await screen.findByRole("button", { name: "Set up timetable" })).toBeInTheDocument();
    expect(screen.queryByText("Timetable settings")).not.toBeInTheDocument();
    expect(screen.getByText("Weekly Timetable")).toBeInTheDocument();
  });
});
