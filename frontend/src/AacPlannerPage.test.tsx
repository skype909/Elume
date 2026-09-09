import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AacPlannerPage from "./AacPlannerPage";
import { apiFetch } from "./api";

let mockRouteClassId = "18";
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useParams: () => ({ id: mockRouteClassId }) }), { virtual: true });
jest.mock("./api", () => ({ apiFetch: jest.fn() }));
const mockedApi = apiFetch as jest.MockedFunction<typeof apiFetch>;

const draft = { id: 1, title: "Fictional Physics AAC", subject: "Physics", weekly_minutes: 30, status: "draft", revision: { id: 2, state: "draft", source_requirements: [], assumptions: [], source_document_ids: [], planning_inputs: { weekly_minutes: 30 }, plan: { stages: [{ id: "stage-a", name: "Research", checkpoints: [] }], candidate_deadlines: [] } }, approved_revision: null };
const scheduledDraft = { ...draft, revision: { ...draft.revision, planning_inputs: { weekly_minutes: 30, controlling_deadline: "2027-04-20", internal_completion_target: "2027-04-06" }, plan: { stages: [{ id: "stage-b", name: "Fixed", completion_date: "2027-03-01", checkpoints: [] }, { id: "stage-a", name: "Research", checkpoints: [] }], candidate_deadlines: [] }, schedule: { capacity_minutes: 600, estimated_minutes: 90, completion_target: "2027-04-06", warnings: ["Fictional closure conflict"], stages: [{ id: "stage-a", name: "Research", proposed_completion_date: "2027-03-20" }, { id: "stage-b", name: "Fixed", completion_date: "2027-03-01", proposed_completion_date: "2027-03-02" }] } } };
const approvableDraft = { ...scheduledDraft, revision: { ...scheduledDraft.revision, review_token: "review-token-18", schedule: { ...scheduledDraft.revision.schedule, warnings: [] } } };
const approvedProject = { ...approvableDraft, status: "approved", revision: { ...approvableDraft.revision, state: "approved" }, approved_revision: { ...approvableDraft.revision, state: "approved" } };

beforeEach(() => { mockRouteClassId = "18"; mockedApi.mockReset(); });

test("hides the AAC workspace when the server denies reviewer-pilot access", async () => {
  mockedApi.mockRejectedValue(Object.assign(new Error("AAC draft pilot is not enabled"), { status: 403 }));
  const { container } = render(<AacPlannerPage embedded />);
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac"));
  expect(container).toBeEmptyDOMElement();
});

test("starts disabled and enables AAC only for this class", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: false, project: null }) as any;
    if (path === "/api/classes/18/aac/enabled") return Promise.resolve({ enabled: true }) as any;
    return Promise.resolve({ enabled: true, project: null }) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Enable AAC Planner" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/enabled", expect.objectContaining({ method: "PUT" })));
  expect(screen.queryByText("CAT4 Insights")).not.toBeInTheDocument();
});

test("the class-scoped compatibility URL renders the same AAC workspace", async () => {
  mockedApi.mockImplementation((path: string) => path === "/api/classes/18/aac" ? Promise.resolve({ enabled: false, project: null }) as any : Promise.resolve([]) as any);
  render(<AacPlannerPage />);
  expect(await screen.findByText("Class Insights · optional")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable AAC Planner" })).toBeInTheDocument();
});

test("supports manual teacher editing without an AI request or calendar action", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path === "/api/classes/18/aac/documents") return Promise.resolve([]) as any;
    if (path === "/api/classes/18/aac/revision") return Promise.resolve(draft) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  const stage = await screen.findByLabelText("Stage 1 name");
  fireEvent.change(stage, { target: { value: "Teacher-edited research" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/revision", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/approve") || String(path).includes("calendar"))).toBe(false);
});

test("shows provider failure while retaining manual editing", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path === "/api/classes/18/aac/documents") return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "fictional.docx", extraction_state: "extracted", sections: [] }]) as any;
    if (path === "/api/classes/18/aac/proposals") return Promise.reject(new Error("Suggestions aren’t available right now.")) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByLabelText("Use fictional.docx for suggestions"));
  fireEvent.click(screen.getByRole("button", { name: "Generate draft suggestions" }));
  fireEvent.click(await screen.findByRole("button", { name: "Update suggestions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Suggestions aren’t available/);
  expect(screen.getByLabelText("Stage 1 name")).toBeInTheDocument();
});

test("does not populate a newly selected class from a stale AAC load", async () => {
  let resolveFirst: ((value: unknown) => void) | undefined;
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return new Promise((resolve) => { resolveFirst = resolve; }) as any;
    if (path === "/api/classes/19/aac") return Promise.resolve({ enabled: false, project: null }) as any;
    return Promise.resolve([]) as any;
  });
  const view = render(<AacPlannerPage embedded />);
  mockRouteClassId = "19";
  view.rerender(<AacPlannerPage embedded />);
  expect(await screen.findByRole("button", { name: "Enable AAC Planner" })).toBeInTheDocument();
  resolveFirst?.({ enabled: true, project: draft });
  await Promise.resolve();
  expect(screen.queryByLabelText("Stage 1 name")).not.toBeInTheDocument();
});

test("shows schedule details and applies only stable-ID suggestions to the editable draft", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: scheduledDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/revision")) return Promise.resolve(scheduledDraft) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  expect(await screen.findByText(/Estimated workload: 90 minutes/)).toBeInTheDocument();
  expect(screen.getByText(/Fictional closure conflict/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply suggested dates to draft" }));
  expect(screen.getByLabelText("Stage 1 date")).toHaveValue("2027-03-01");
  expect(screen.getByLabelText("Stage 2 date")).toHaveValue("2027-03-20");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/revision", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("approve") || String(path).includes("calendar"))).toBe(false);
});

test("explicitly approves the exact saved revision and review token, then refreshes authority", async () => {
  let loads = 0;
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") { loads += 1; return Promise.resolve({ enabled: true, project: loads > 1 ? approvedProject : approvableDraft }) as any; }
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/approve")) return Promise.resolve(approvedProject) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve plan and update my calendars" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/approve", expect.objectContaining({ method: "POST", body: JSON.stringify({ revision_id: 2, review_token: "review-token-18" }) })));
  expect(await screen.findByText(/Plan approved. Milestones are now/)).toBeInTheDocument();
  expect(loads).toBeGreaterThan(1);
});

test("unsaved, stale, and blocking review states prevent approval submission", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: approvableDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  const approve = await screen.findByRole("button", { name: "Approve plan and update my calendars" });
  fireEvent.change(screen.getByLabelText("Stage 1 name"), { target: { value: "Unsaved stage" } });
  expect(approve).toBeDisabled();
  expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith("/approve"))).toBe(false);
  mockedApi.mockReset();
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: scheduledDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve({}) as any;
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Approve plan and update my calendars" })).toBeDisabled());
});

test("a stale review requires refresh, and a server failure leaves the saved draft editable", async () => {
  let stale = true;
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: approvableDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/approve")) return stale ? Promise.reject(Object.assign(new Error("changed"), { status: 409 })) as any : Promise.reject(Object.assign(new Error("fictional server failure"), { status: 503 })) as any;
    return Promise.resolve(approvableDraft) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve plan and update my calendars" }));
  expect(await screen.findByText(/review is no longer current/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve plan and update my calendars" })).toBeDisabled();
  stale = false;
  fireEvent.click(screen.getByRole("button", { name: "Refresh review" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Approve plan and update my calendars" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Approve plan and update my calendars" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("fictional server failure");
  expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Fixed");
});

test("reviews an extracted specification deadline without generating suggestions or replacing teacher stages", async () => {
  const teacherValue = {
    ...draft,
    revision: {
      ...draft.revision,
      planning_inputs: { weekly_minutes: 30, controlling_deadline: "2027-01-15", official_deadline_confirmed: true },
      plan: { stages: [{ id: "teacher-stage", name: "Keep this teacher stage", checkpoints: [] }], candidate_deadlines: [] },
    },
  };
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: teacherValue }) as any;
    if (path === "/api/classes/18/aac/documents") return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "fictional brief.pdf", extraction_state: "extracted", sections: [{ reference: "page 2", text: "coursework" }] }]) as any;
    if (path === "/api/classes/18/aac/deadline-candidates") return Promise.resolve({ status: "candidate", specifications: [{ id: 9, display_filename: "fictional brief.pdf", extraction_state: "extracted" }], candidates: [{ source_document_id: 9, source_reference: "page 2", date: "2026-12-11", meaning: "student completion / hand-in deadline", supporting_excerpt: "Students must submit coursework by Friday, 11 December 2026." }] }) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  expect(await screen.findByText(/Suggested SEC completion/)).toHaveTextContent("2026-12-11");
  expect(screen.getByText(/Your confirmed date \(2027-01-15\) stays unchanged/)).toBeInTheDocument();
  expect(screen.getByLabelText("SEC completion / hand-in deadline")).toHaveValue("2027-01-15");
  expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Keep this teacher stage");
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Use suggested date" }));
  expect(screen.getByLabelText("SEC completion / hand-in deadline")).toHaveValue("2026-12-11");
  expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Keep this teacher stage");
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals"))).toBe(false);
});

test("shows a source-backed suggestion in a blank SEC date input without treating it as confirmed", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path === "/api/classes/18/aac/documents") return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "fictional brief.pdf", extraction_state: "extracted", sections: [{ reference: "page 2", text: "coursework" }] }]) as any;
    if (path === "/api/classes/18/aac/deadline-candidates") return Promise.resolve({ status: "candidate", specifications: [{ id: 9, display_filename: "fictional brief.pdf", extraction_state: "extracted" }], candidates: [{ source_document_id: 9, source_reference: "page 2", date: "2026-12-11", meaning: "student completion / hand-in deadline", supporting_excerpt: "Students must submit coursework by Friday, 11 December 2026." }] }) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  expect(await screen.findByText("Suggested from your specification — please confirm.")).toBeInTheDocument();
  expect(screen.getByLabelText("SEC completion / hand-in deadline")).toHaveValue("2026-12-11");
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals") || String(path).endsWith("/revision"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirm date" }));
  expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Research");
});

test("an approval response for a previous class cannot update the newly selected class", async () => {
  let resolveApproval: ((value: unknown) => void) | undefined;
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: approvableDraft }) as any;
    if (path === "/api/classes/19/aac") return Promise.resolve({ enabled: false, project: null }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/approve")) return new Promise((resolve) => { resolveApproval = resolve; }) as any;
    return Promise.resolve({}) as any;
  });
  const view = render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve plan and update my calendars" }));
  mockRouteClassId = "19";
  view.rerender(<AacPlannerPage embedded />);
  expect(await screen.findByRole("button", { name: "Enable AAC Planner" })).toBeInTheDocument();
  resolveApproval?.(approvedProject);
  await waitFor(() => expect(screen.getByRole("button", { name: "Enable AAC Planner" })).toBeInTheDocument());
  expect(screen.queryByText(/Plan approved. Milestones are now/)).not.toBeInTheDocument();
});
