import { fireEvent, render, screen } from "@testing-library/react";
const mockApiFetch = jest.fn();

jest.mock("react-router-dom", () => {
  const React = require("react");
  let location = { pathname: "/register" };
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
  return {
    useLocation,
    useNavigate: () => (to: string) => { location = { pathname: to }; notify(); },
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
    __setLocation: (pathname: string) => { location = { pathname }; notify(); },
  };
}, { virtual: true });

jest.mock("./api", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

import { useLocation } from "react-router-dom";
import RegisterPage from "./RegisterPage";
import { UiLanguageProvider } from "./i18n/UiLanguageContext";

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderRegister() {
  return render(
    <UiLanguageProvider>
      <RegisterPage />
      <Location />
    </UiLanguageProvider>
  );
}

beforeEach(() => mockApiFetch.mockReset());

test("requires a role choice before showing teacher registration", () => {
  renderRegister();

  expect(screen.getByRole("heading", { name: "Welcome to Elume" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /I am a teacher/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /I am a student/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
});

test("teacher choice reveals registration and can be changed", () => {
  renderRegister();

  fireEvent.click(screen.getByRole("button", { name: /I am a teacher/ }));
  expect(screen.getByText("Create teacher account")).toBeInTheDocument();
  expect(screen.getByLabelText("First name")).toHaveFocus();

  fireEvent.click(screen.getByRole("button", { name: "Change role" }));
  expect(screen.getByRole("heading", { name: "Welcome to Elume" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /I am a teacher/ })).toHaveFocus();
});

test("student choice goes straight to Student Hub without calling registration", () => {
  renderRegister();

  fireEvent.click(screen.getByRole("button", { name: /I am a student/ }));
  expect(screen.getByTestId("location")).toHaveTextContent("/student");
  expect(mockApiFetch).not.toHaveBeenCalledWith("/auth/register", expect.anything());
});
