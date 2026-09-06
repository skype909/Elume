import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError, apiFetch } from "./api";
import PlatformAdminEntitlementsPage, { accessReason } from "./PlatformAdminEntitlementsPage";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("./api", () => {
  class MockApiError extends Error {
    status: number; response: unknown;
    constructor(...args: [number, string, unknown]) { super(args[1]); this.status = args[0]; this.response = args[2]; }
  }
  return { apiFetch: jest.fn(), ApiError: MockApiError };
});
const mockedApi = apiFetch as jest.MockedFunction<typeof apiFetch>;

const user = { user_id: 14, email: "teacher@school.example", role: "teacher", is_active: true, email_verified: true, school_name: "Example School", school_active: true, subscription_status: "inactive", active_grants: [], allowed: false, reason: "subscription_inactive", access_until: null };
const report = { evaluated_at: "2026-09-06T12:00:00Z", total: 3, matched: 3, reason_counts: { subscription_inactive: 3 }, page: 1, page_size: 25, users: [user] };
const grant = { id: 3, grant_type: "pilot", reason: "Pilot review", starts_at: "2026-09-01T00:00:00Z", expires_at: "2027-01-01T00:00:00Z", granted_by_user_id: 1, created_at: "2026-09-01T00:00:00Z" };

function responses() {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ role: "platform_admin" }) as any;
    if (path.startsWith("/platform-admin/entitlements")) return Promise.resolve(report) as any;
    if (path === "/platform-admin/users/14/access-grants") return Promise.resolve({ user_id: 14, grants: [grant] }) as any;
    return Promise.resolve({ changed: true, grant }) as any;
  });
}
beforeEach(() => { mockedApi.mockReset(); responses(); });

test("renders local access decisions and uses the supported denied filter", async () => {
  render(<PlatformAdminEntitlementsPage />);
  expect((await screen.findAllByText("teacher@school.example")).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "No current access" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "No current access" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining("access=denied&page=1&page_size=25")));
});

test("uses server pagination and does not render unreturned Stripe identifiers", async () => {
  const paged = { ...report, matched: 50, page_size: 25, users: [{ ...user, stripe_customer_id: "cus_private", stripe_subscription_id: "sub_private" }] };
  mockedApi.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ role: "platform_admin" }) as any;
    if (path.startsWith("/platform-admin/entitlements")) return Promise.resolve(paged) as any;
    return Promise.resolve({}) as any;
  });
  render(<PlatformAdminEntitlementsPage />);
  expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
  expect(screen.queryByText("cus_private")).not.toBeInTheDocument();
  expect(screen.queryByText("sub_private")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith(expect.stringContaining("access=all&page=2&page_size=25")));
});

test("shows a loading state and a friendly empty state", async () => {
  let resolveReport: (value: unknown) => void = () => undefined;
  const pendingReport = new Promise((resolve) => { resolveReport = resolve; });
  mockedApi.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve({ role: "platform_admin" }) as any;
    if (path.startsWith("/platform-admin/entitlements")) return pendingReport as any;
    return Promise.resolve({}) as any;
  });
  render(<PlatformAdminEntitlementsPage />);
  expect(await screen.findByLabelText("Loading access accounts")).toBeInTheDocument();
  resolveReport({ ...report, matched: 0, users: [] });
  expect(await screen.findByText("No accounts match this view.")).toBeInTheDocument();
});

test("shows platform-admin access required on a 403 and supports retry", async () => {
  mockedApi.mockImplementationOnce(() => Promise.reject(new ApiError(403, "Forbidden", {})) as never);
  render(<PlatformAdminEntitlementsPage />);
  expect(await screen.findByText(/Platform-admin access is required/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(mockedApi.mock.calls.length).toBeGreaterThanOrEqual(2));
});

test("explains an expired session without exposing API details", async () => {
  mockedApi.mockImplementationOnce(() => Promise.reject(new ApiError(401, "private token detail", {})) as never);
  render(<PlatformAdminEntitlementsPage />);
  expect(await screen.findByText(/Your session has ended/)).toBeInTheDocument();
  expect(screen.queryByText(/private token detail/)).not.toBeInTheDocument();
});

test("loads grant history and submits an ordinary grant with an expiry", async () => {
  render(<PlatformAdminEntitlementsPage />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Manage access" }))[0]);
  expect(await screen.findByText("Pilot review")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Helpful pilot access" } });
  fireEvent.change(screen.getByLabelText("Expiry"), { target: { value: "2027-10-01T12:00" } });
  const reportCallsBefore = mockedApi.mock.calls.filter(([path]) => String(path).startsWith("/platform-admin/entitlements")).length;
  fireEvent.click(screen.getByRole("button", { name: "Record access grant" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/platform-admin/users/14/access-grants", expect.objectContaining({ method: "POST", body: expect.objectContaining({ grant_type: "pilot", reason: "Helpful pilot access" }) })));
  await waitFor(() => expect(mockedApi.mock.calls.filter(([path]) => String(path).startsWith("/platform-admin/entitlements")).length).toBeGreaterThan(reportCallsBefore));
});

test("requires a reason and future expiry for ordinary access", async () => {
  render(<PlatformAdminEntitlementsPage />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Manage access" }))[0]);
  fireEvent.click(screen.getByRole("button", { name: "Record access grant" }));
  expect(await screen.findByText(/meaningful reason/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Pilot support" } });
  fireEvent.click(screen.getByRole("button", { name: "Record access grant" }));
  expect(await screen.findByText(/future expiry date/)).toBeInTheDocument();
});

test("keeps promotional annual expiry fixed and validates ordinary grant requirements", async () => {
  render(<PlatformAdminEntitlementsPage />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Manage access" }))[0]);
  fireEvent.change(screen.getByLabelText("Access type"), { target: { value: "promotional_annual" } });
  expect(screen.getAllByText(/30 September 2027/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Confirmed annual offer" } });
  fireEvent.click(screen.getByRole("button", { name: "Record access grant" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/platform-admin/users/14/access-grants", expect.objectContaining({ body: { grant_type: "promotional_annual", reason: "Confirmed annual offer" } })));
});

test("explains an overlapping grant conflict without submitting a duplicate", async () => {
  mockedApi.mockImplementation((path: string, options?: { method?: string }) => {
    if (path === "/auth/me") return Promise.resolve({ role: "platform_admin" }) as any;
    if (path.startsWith("/platform-admin/entitlements")) return Promise.resolve(report) as any;
    if (path === "/platform-admin/users/14/access-grants" && options?.method === "POST") return Promise.reject(new ApiError(409, "Conflict", { detail: { code: "overlapping_grant_requires_resolution" } })) as any;
    if (path === "/platform-admin/users/14/access-grants") return Promise.resolve({ user_id: 14, grants: [grant] }) as any;
    return Promise.resolve({}) as any;
  });
  render(<PlatformAdminEntitlementsPage />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Manage access" }))[0]);
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Duplicate pilot" } });
  fireEvent.change(screen.getByLabelText("Expiry"), { target: { value: "2027-10-01T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Record access grant" }));
  expect(await screen.findByText(/overlaps an existing grant/)).toBeInTheDocument();
});

test("requires revocation confirmation reason and sends the exact revoke request", async () => {
  render(<PlatformAdminEntitlementsPage />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Manage access" }))[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Revoke grant" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  expect(await screen.findByText(/Please explain why/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Revocation reason"), { target: { value: "Pilot complete" } });
  const reportCallsBefore = mockedApi.mock.calls.filter(([path]) => String(path).startsWith("/platform-admin/entitlements")).length;
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/platform-admin/access-grants/3/revoke", { method: "POST", body: { reason: "Pilot complete" } }));
  await waitFor(() => expect(mockedApi.mock.calls.filter(([path]) => String(path).startsWith("/platform-admin/entitlements")).length).toBeGreaterThan(reportCallsBefore));
});

test("maps policy language to teacher-friendly labels", () => {
  expect(accessReason("active_school")).toBe("School access");
  expect(accessReason("payment_recovery_active")).toBe("Payment recovery period");
  expect(accessReason("subscription_canceled")).toBe("No current access");
});
