import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockApiFetch = jest.fn();
const mockNavigate = jest.fn();
let mockPathname = "/billing";

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
}), { virtual: true });

jest.mock("./api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import BillingOnboardingPage from "./BillingOnboardingPage";

const baseStatus = {
  subscription_status: "past_due",
  billing_interval: "annual",
  current_period_end: "2027-09-12T21:08:23Z",
  has_stripe_customer: true,
  personal_subscription_status: "past_due",
  portal_management_available: true,
  cancellation_available: true,
  cancellation_scheduled: false,
  billing_onboarding_required: false,
  trial_started_at: null,
  trial_ends_at: null,
  trial_active: false,
  prompt_usage_today: 0,
  prompt_limit_today: 0,
  access_allowed: false,
};

beforeEach(() => {
  mockPathname = "/billing";
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
});

test("a past-due individual can reach cancellation from the account billing page", async () => {
  mockApiFetch.mockResolvedValueOnce(baseStatus);
  render(<BillingOnboardingPage />);

  expect(await screen.findByRole("heading", { name: "Subscription & billing" })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Cancel subscription" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Manage billing" })).toBeEnabled();
  expect(screen.getByText(/Stripe will show the available options/i)).toBeInTheDocument();
});

test("scheduled and completed cancellations are not offered another cancellation action", async () => {
  mockApiFetch.mockResolvedValueOnce({
    ...baseStatus,
    subscription_status: "active",
    cancellation_available: false,
    cancellation_scheduled: true,
    cancellation_effective_at: "2027-09-12T21:08:23Z",
  });
  const view = render(<BillingOnboardingPage />);
  expect(await screen.findByText("Cancellation scheduled")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Manage billing" }).length).toBeGreaterThan(0);

  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValueOnce({
    ...baseStatus,
    subscription_status: "canceled",
    portal_management_available: false,
    cancellation_available: false,
    cancellation_scheduled: false,
  });
  view.unmount();
  render(<BillingOnboardingPage />);
  await waitFor(() => expect(screen.getByText("Subscription cancelled")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
});

test("school-only access explains the ownership and does not expose personal cancellation", async () => {
  mockApiFetch.mockResolvedValueOnce({
    ...baseStatus,
    subscription_status: "school_funded",
    school_funded: true,
    has_stripe_customer: false,
    portal_management_available: false,
    cancellation_available: false,
  });
  render(<BillingOnboardingPage />);

  expect(await screen.findByText("Access managed by your school")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
  expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
});

test("a portal failure gives a retryable explanation without claiming cancellation", async () => {
  mockApiFetch
    .mockResolvedValueOnce(baseStatus)
    .mockRejectedValueOnce(new Error("Could not open secure billing management. Please try again."));
  render(<BillingOnboardingPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Cancel subscription" }));
  expect(await screen.findByText("Could not open secure billing management. Please try again.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
