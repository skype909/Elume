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

test("recorded stage removal requires explicit historical-retention review", async () => {
  mockedApi.mockImplementation(async (path: string, options: any) => {
    if (path === "/api/classes/18/aac") return { enabled: true, project: draft };
    if (path.endsWith("/documents")) return [];
    if (path.endsWith("/revision")) {
      const body = JSON.parse(options.body);
      if (!body.reviewed_removed_stage_ids?.includes("stage-a")) throw Object.assign(new Error("Review removal"), { status: 409, response: { detail: { removed_stages: [{ id: "stage-a", name: "Research" }] } } });
      return { ...draft, revision: { ...draft.revision, plan: { stages: [] } } };
    }
    return {};
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByLabelText("Remove stage 1"));
  fireEvent.click(screen.getByRole("button", { name: "Save tracker" }));
  expect(await screen.findByRole("dialog", { name: "Review stage removal" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remove reviewed stages and retain history" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review stage removal" })).not.toBeInTheDocument());
  const saves = mockedApi.mock.calls.filter(([path]) => path.endsWith("/revision"));
  expect(JSON.parse(saves[1][1]?.body as string).reviewed_removed_stage_ids).toEqual(["stage-a"]);
});

test("Track this class opens only the connected server roster", async () => {
  mockedApi.mockImplementation(async (path: string) => {
    if (path === "/api/classes/18/aac") return { enabled: true, project: draft };
    if (path.endsWith("/documents")) return [];
    if (path.endsWith("/aac/students")) return { tracker_id:"stable", read_only:false, stages:[], retired_stages:[], students:[], trackers:[{id:"stable", title:"Fictional", current:true}] };
    return {};
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Track this class" }));
  await screen.findByLabelText("Tracker history");
  expect(mockedApi).toHaveBeenCalledWith("/classes/18/aac/students");
  expect(screen.queryByText(/Local demonstration/)).not.toBeInTheDocument();
});

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
  fireEvent.click(await screen.findByRole("button", { name: "Enable AAC Tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/enabled", expect.objectContaining({ method: "PUT" })));
  expect(screen.queryByText("CAT4 Insights")).not.toBeInTheDocument();
});

test("the class-scoped compatibility URL renders the same AAC workspace", async () => {
  mockedApi.mockImplementation((path: string) => path === "/api/classes/18/aac" ? Promise.resolve({ enabled: false, project: null }) as any : Promise.resolve([]) as any);
  render(<AacPlannerPage />);
  expect(await screen.findByText("Class Insights · optional")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable AAC Tracker" })).toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "Track this class" })).toBeEnabled();
  expect(screen.queryByText(/student progress is stored in this browser/)).not.toBeInTheDocument();
  fireEvent.change(stage, { target: { value: "Teacher-edited research" } });
  expect(screen.getByRole("button", { name: "Track this class" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/revision", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/approve") || String(path).includes("calendar"))).toBe(false);
});

test("shows scheduler stage time and makes a teacher edit stale without moving its date", async () => {
  const allocated = { ...scheduledDraft, revision: { ...scheduledDraft.revision, plan: { stages: [{ id: "stage-a", name: "Research", completion_date: "2027-03-01", checkpoints: [] }] }, schedule: { ...scheduledDraft.revision.schedule, stages: [{ id: "stage-a", name: "Research", completion_date: "2027-03-01", estimated_minutes: 75, provisional_estimate: true }] } } };
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: allocated }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  expect(await screen.findByText("Total teaching time for this stage (minutes)")).toBeInTheDocument();
  expect(screen.getByText("Suggested from your plan. You can increase or reduce this estimate.")).toBeInTheDocument();
  expect(screen.getByLabelText("Stage 1 minutes")).toHaveValue(75);
  fireEvent.change(screen.getByLabelText("Stage 1 minutes"), { target: { value: "90" } });
  expect(screen.getByLabelText("Stage 1 date")).toHaveValue("2027-03-01");
  expect(screen.getByText("Schedule suggestions are stale after your edits. Save tracker to refresh them.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save tracker" })).toBeEnabled();
});

test.each([
  ["2027-04-25", "This deadline is 5 calendar days after the SEC deadline."],
  ["2027-04-12", "This leaves 8 days before the SEC deadline. Allow at least 14 days."],
])("makes an invalid classroom buffer explicit (%s)", async (finalDate, expected) => {
  const invalid = { ...scheduledDraft, revision: { ...scheduledDraft.revision, planning_inputs: { ...scheduledDraft.revision.planning_inputs, controlling_deadline: "2027-04-20", final_classroom_deadline: finalDate, internal_completion_target: finalDate } } };
  mockedApi.mockImplementation((path: string) => path === "/api/classes/18/aac" ? Promise.resolve({ enabled: true, project: invalid }) as any : Promise.resolve([]) as any);
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "3. Teaching time" }));
  expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  const date = screen.getByLabelText("Final classroom deadline");
  expect(date).toHaveAttribute("aria-invalid", "true");
  fireEvent.click(screen.getAllByRole("button", { name: "Change date" })[0]);
  await waitFor(() => expect(date).toHaveFocus());
});

test("does not show a buffer error at exactly fourteen calendar days", async () => {
  mockedApi.mockImplementation((path: string) => path === "/api/classes/18/aac" ? Promise.resolve({ enabled: true, project: scheduledDraft }) as any : Promise.resolve([]) as any);
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "3. Teaching time" }));
  expect(screen.queryByText("Change your final classroom deadline")).not.toBeInTheDocument();
});

test("uses the active specification automatically while keeping manual editing available", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path === "/api/classes/18/aac/documents") return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "fictional.docx", extraction_state: "extracted", sections: [] }]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "1. Get started" }));
  expect(screen.getByText("fictional.docx")).toBeInTheDocument();
  expect(screen.queryByLabelText("Use fictional.docx for suggestions")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Stage 1 name")).toBeInTheDocument();
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals"))).toBe(false);
});

test("an extracted brief offers a focused Continue action without making the tracker dirty", async () => {
  const source = { id: 31, purpose: "specification", display_filename: "fictional-brief.docx", extraction_state: "extracted", sections: [] };
  let documents: any[] = [];
  mockedApi.mockImplementation((path: string, options?: any) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path === "/api/classes/18/aac/documents" && options?.method === "POST") { documents = [source]; return Promise.resolve(source) as any; }
    if (path === "/api/classes/18/aac/documents") return Promise.resolve(documents) as any;
    if (path.endsWith("/deadline-candidates")) return Promise.resolve({ status: "no_candidate", candidates: [], stage_structure: [] }) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "1. Get started" }));
  fireEvent.change(screen.getByLabelText("AAC source file"), { target: { files: [new File(["fictional"], "fictional-brief.docx")] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload fictional-brief.docx" }));
  expect(await screen.findByText("Brief uploaded ✓")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue → Review what we found" }));
  const review = await screen.findByRole("heading", { name: "Here’s what we found" });
  await waitFor(() => expect(review).toHaveFocus());
  expect(screen.getByRole("button", { name: "Save tracker" })).toBeDisabled();
});

test("confirms source removal inside the selected document card and cancels without a request", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "remove-me.docx", extraction_state: "extracted", sections: [] }]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "1. Get started" }));
  const remove = screen.getByRole("button", { name: "Remove source" });
  fireEvent.click(remove);
  const dialog = screen.getByRole("dialog", { name: "Remove this source?" });
  expect(dialog).toHaveTextContent("remove-me.docx");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Remove this source?" })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove source" })).toHaveFocus());
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/documents/9"))).toBe(false);
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
  expect(await screen.findByRole("button", { name: "Enable AAC Tracker" })).toBeInTheDocument();
  resolveFirst?.({ enabled: true, project: draft });
  await Promise.resolve();
  expect(screen.queryByLabelText("Stage 1 name")).not.toBeInTheDocument();
});

test("shows schedule details and applies only stable-ID suggestions to the editable draft", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac?recalculate_dates=true") return Promise.resolve({ enabled: true, project: scheduledDraft }) as any;
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: scheduledDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/revision")) return Promise.resolve(scheduledDraft) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  expect(await screen.findByText("Total allocated teaching time")).toBeInTheDocument();
  expect(screen.getByText("90 minutes")).toBeInTheDocument();
  expect(screen.getByText(/Fictional closure conflict/)).toBeInTheDocument();
  expect(screen.queryByText("Schedule preview")).not.toBeInTheDocument();
  expect(screen.queryByText("Reviewed source requirements and dates")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit dates" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Key dates" })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "4. Suggested plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit teaching time" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "When will your class work on this?" })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "4. Suggested plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Recalculate suggested dates" }));
  expect(await screen.findByRole("heading", { name: "Review replacement dates" })).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("checkbox")[1]);
  fireEvent.click(screen.getByRole("button", { name: "Apply selected dates" }));
  expect(screen.getByLabelText("Stage 1 date")).toHaveValue("2027-03-01");
  expect(screen.getByLabelText("Stage 2 date")).toHaveValue("2027-03-20");
  fireEvent.click(screen.getByRole("button", { name: "Save tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/revision", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("approve") || String(path).includes("calendar"))).toBe(false);
});

test("keeps the pilot draft-only: saving and schedule actions never approve or publish", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: approvableDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/revision")) return Promise.resolve(approvableDraft) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.change(await screen.findByLabelText("Stage 1 name"), { target: { value: "Private draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Save tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/revision", expect.objectContaining({ method: "PUT" })));
  expect(screen.queryByRole("button", { name: /Approve plan/i })).not.toBeInTheDocument();
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/approve") || String(path).includes("calendar"))).toBe(false);
});

test("keeps schedule warnings and unsaved edits in the draft without a publication action", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: approvableDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  await screen.findByLabelText("Stage 1 name");
  fireEvent.change(screen.getByLabelText("Stage 1 name"), { target: { value: "Unsaved stage" } });
  expect(screen.getByRole("button", { name: "Recalculate suggested dates" })).toBeDisabled();
  expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith("/approve"))).toBe(false);
});

test("shows source findings in Step 2 without calling an AI proposal endpoint", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "fictional brief.pdf", extraction_state: "extracted", sections: [{ reference: "page 2", text: "Fictional source evidence" }] }]) as any;
    if (path.endsWith("/deadline-candidates")) return Promise.resolve({ status: "candidate", candidates: [{ source_document_id: 9, source_reference: "page 2", date: "2027-04-20", meaning: "student completion / hand-in deadline", supporting_excerpt: "Fictional source evidence" }], specifications: [] }) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "2. What we found" }));
  expect(screen.getAllByText("Fictional source evidence").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/SEC completion/).length).toBeGreaterThan(0);
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals"))).toBe(false);
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
  expect(screen.getByRole("button", { name: "Save tracker" })).toBeDisabled();
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("/proposals") || String(path).endsWith("/revision"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Confirm date" }));
  expect(screen.getByRole("button", { name: "Save tracker" })).toBeEnabled();
  expect(screen.getByLabelText("Stage 1 name")).toHaveValue("Research");
});

test("week adjustments only edit the draft stage and never publish a calendar event", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: scheduledDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve(scheduledDraft) as any;
  });
  render(<AacPlannerPage embedded />);
  await screen.findByLabelText("Stage 1 date");
  fireEvent.click(screen.getByRole("button", { name: "Stage 1: 1 week later" }));
  expect(screen.getByLabelText("Stage 1 date")).toHaveValue("2027-03-08");
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("calendar") || String(path).includes("approve"))).toBe(false);
});

test("lists the actual missing scheduling inputs before it saves or suggests dates", async () => {
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "3. Teaching time" }));
  expect(screen.getAllByText("SEC completion / hand-in deadline").length).toBeGreaterThan(1);
  expect(screen.getByText("final classroom deadline")).toBeInTheDocument();
  expect(screen.getByText("Fifth Year teaching end date")).toBeInTheDocument();
  expect(screen.getByText("Sixth Year restart date")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue and save tracker" }));
  expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith("/revision"))).toBe(false);
});

test("saves guided inputs, adds only undated stage suggestions, and preserves teacher dates", async () => {
  const readyDraft = {
    ...scheduledDraft,
    revision: {
      ...scheduledDraft.revision,
      planning_inputs: {
        weekly_minutes: 30,
        controlling_deadline: "2027-04-20",
        official_deadline_confirmed: true,
        final_classroom_deadline: "2027-04-06",
        internal_completion_target: "2027-04-06",
        fifth_year_end: "2026-05-29",
        sixth_year_restart: "2026-09-14",
        planned_start: "2026-09-14",
      },
    },
  };
  const savedWithSuggestion = {
    ...readyDraft,
    revision: {
      ...readyDraft.revision,
      schedule: {
        capacity_minutes: 600,
        estimated_minutes: 90,
        completion_target: "2027-04-06",
        warnings: [],
        stages: [
          { id: "stage-b", name: "Fixed", completion_date: "2027-03-01" },
          { id: "stage-a", name: "Research", estimated_minutes: 90, provisional_estimate: true, proposed_completion_date: "2027-03-20" },
        ],
      },
    },
  };
  const persistedDates = {
    ...savedWithSuggestion,
    revision: {
      ...savedWithSuggestion.revision,
      plan: {
        ...savedWithSuggestion.revision.plan,
        stages: [
          { id: "stage-b", name: "Fixed", completion_date: "2027-03-01", checkpoints: [] },
          { id: "stage-a", name: "Research", estimated_minutes: 90, provisional_estimate: true, completion_date: "2027-03-20", checkpoints: [] },
        ],
      },
      schedule: {
        ...savedWithSuggestion.revision.schedule,
        stages: [
          { id: "stage-b", name: "Fixed", completion_date: "2027-03-01" },
          { id: "stage-a", name: "Research", completion_date: "2027-03-20" },
        ],
      },
    },
  };
  let revisionSaves = 0;
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: readyDraft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([]) as any;
    if (path.endsWith("/revision")) return Promise.resolve(++revisionSaves === 1 ? savedWithSuggestion : persistedDates) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "3. Teaching time" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue and save tracker" }));
  await waitFor(() => expect(mockedApi.mock.calls.filter(([path]) => String(path).endsWith("/revision"))).toHaveLength(2));
  expect(screen.getByLabelText("Stage 1 date")).toHaveValue("2027-03-01");
  expect(screen.getByLabelText("Stage 2 date")).toHaveValue("2027-03-20");
  const secondSave = mockedApi.mock.calls.filter(([path]) => String(path).endsWith("/revision"))[1][1] as any;
  expect(JSON.parse(secondSave.body).plan.stages).toEqual(expect.arrayContaining([expect.objectContaining({ id: "stage-b", completion_date: "2027-03-01" }), expect.objectContaining({ id: "stage-a", completion_date: "2027-03-20" })]));
  expect(JSON.parse(secondSave.body).plan.stages).toEqual(expect.arrayContaining([expect.objectContaining({ id: "stage-a", estimated_minutes: 90, provisional_estimate: true })]));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("approve") || String(path).includes("calendar"))).toBe(false);
});

test("new tracker confirmation persists a clean workspace before details and never restores historical sources", async () => {
  const freshDraft = { ...draft, revision: { ...draft.revision, id: 3, version: 2, source_document_ids: [], planning_inputs: { weekly_minutes: 30 }, plan: { stages: [], tracker_setup_pending: true } } };
  const configured = { ...freshDraft, title: "Fresh fictional AAC", subject: "Art", revision: { ...freshDraft.revision, plan: { stages: [], tracker_setup_pending: false } } };
  mockedApi.mockImplementation((path: string) => {
    if (path === "/api/classes/18/aac") return Promise.resolve({ enabled: true, project: draft }) as any;
    if (path.endsWith("/documents")) return Promise.resolve([{ id: 9, purpose: "specification", display_filename: "retained.pdf", extraction_state: "extracted", sections: [] }]) as any;
    if (path.endsWith("/new-draft")) return Promise.resolve(freshDraft) as any;
    if (path.endsWith("/tracker-details")) return Promise.resolve(configured) as any;
    return Promise.resolve({}) as any;
  });
  render(<AacPlannerPage embedded />);
  fireEvent.click(await screen.findByRole("button", { name: "Start a new AAC tracker" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mockedApi.mock.calls.some(([path]) => String(path).endsWith("/new-draft"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Start a new AAC tracker" }));
  fireEvent.click(screen.getByRole("button", { name: "Start new AAC tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/new-draft", expect.objectContaining({ method: "POST" })));
  expect(screen.getByLabelText("New project title")).toHaveValue("");
  expect(screen.getByText("Ready for your new brief.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "New AAC tracker" })).toBeInTheDocument();
  expect(screen.queryByText("Fictional Physics AAC")).not.toBeInTheDocument();
  expect(screen.queryByText("retained.pdf")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("New project title"), { target: { value: "Fresh fictional AAC" } });
  fireEvent.change(screen.getByLabelText("New project subject"), { target: { value: "Art" } });
  fireEvent.click(screen.getByRole("button", { name: "Create AAC tracker" }));
  await waitFor(() => expect(mockedApi).toHaveBeenCalledWith("/api/classes/18/aac/tracker-details", expect.objectContaining({ method: "PUT" })));
  expect(mockedApi.mock.calls.some(([path]) => String(path).includes("approve") || String(path).includes("calendar"))).toBe(false);
});
