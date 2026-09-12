import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AacStudentProgress from "./AacStudentProgress";
import { apiFetch } from "./api";
jest.mock("./api", () => ({ apiFetch: jest.fn() }));
const api = apiFetch as jest.MockedFunction<typeof apiFetch>;
const empty = { version: 0, stages: {}, note: "", follow_up: null };
const workspace = () => ({ tracker_id: "tracker-stable", read_only: false, trackers: [{ id: "tracker-stable", title: "Fictional tracker", current: true }],
  stages: [{ id: "research", name: "Research", completion_date: "2027-03-20" }], retired_stages: [],
  students: [{ id: 7, first_name: "Fictional Alice", active: true, check_in: { ...empty } }, { id: 8, first_name: "Fictional Bob", active: true, check_in: { ...empty } }],
});
beforeEach(() => { api.mockReset(); window.localStorage.clear(); });

test("reuses grid and check-in, saves stable IDs to server then reloads without browser records", async () => {
  const data = workspace();
  api.mockImplementation(async (path, options) => {
    if (options?.method === "PUT") {
      expect(path).toBe("/classes/18/aac/students/7");
      const payload = options.body as any;
      expect(payload.tracker_id).toBe("tracker-stable"); expect(payload.expected_version).toBe(0);
      const check_in = { ...payload, version: 1 }; data.students[0].check_in = check_in;
      return { saved: true, check_in };
    }
    return structuredCloneForTest(data);
  });
  const view = render(<AacStudentProgress classId={18} onBack={jest.fn()} />);
  fireEvent.change(await screen.findByLabelText("Fictional Alice: Research progress"), { target: { value: "ready_for_review" } });
  fireEvent.click(screen.getByRole("button", { name: "Fictional Alice" }));
  fireEvent.change(screen.getByLabelText("Teacher note / next action"), { target: { value: "Review evidence" } });
  fireEvent.input(screen.getByLabelText("Follow-up date"), { target: { value: "2027-03-10" } });
  fireEvent.input(screen.getByLabelText("Fictional Alice: Research individual target"), { target: { value: "2027-03-12" } });
  fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
  await screen.findByText("Saved to server");
  expect(screen.getByLabelText("Fictional Bob: Research progress")).toHaveValue("not_started");
  expect(data.stages[0].completion_date).toBe("2027-03-20");
  view.unmount(); window.localStorage.clear();
  render(<AacStudentProgress classId={18} onBack={jest.fn()} />);
  expect(await screen.findByLabelText("Fictional Alice: Research progress")).toHaveValue("ready_for_review");
  fireEvent.click(screen.getByRole("button", { name: "Fictional Alice" }));
  expect(screen.getByLabelText("Teacher note / next action")).toHaveValue("Review evidence");
  expect(screen.getByLabelText("Follow-up date")).toHaveValue("2027-03-10");
  expect(screen.getByLabelText("Fictional Alice: Research individual target")).toHaveValue("2027-03-12");
  expect(window.localStorage.length).toBe(0);
});

test("pending and failed saves retain input for a successful retry", async () => {
  let rejectSave: (reason: Error) => void = () => {};
  api.mockImplementation(async (_path, options) => options?.method === "PUT" ? new Promise((_resolve, reject) => { rejectSave = reject; }) : workspace());
  render(<AacStudentProgress classId={18} onBack={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Fictional Alice" }));
  fireEvent.change(screen.getByLabelText("Teacher note / next action"), { target: { value: "Keep this input" } });
  fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
  expect(screen.getByLabelText("Teacher note / next action")).toBeDisabled();
  rejectSave(new Error("Fictional network failure"));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Teacher note / next action")).toHaveValue("Keep this input");
  expect(screen.getByLabelText("Teacher note / next action")).toBeEnabled();
  api.mockImplementation(async (_path, options) => ({ saved: true, check_in: { ...(options?.body as any), version: 1 } }));
  fireEvent.click(screen.getByRole("button", { name: "Save check-in" }));
  await screen.findByText("Saved to server");
});

test("archived roster members and removed stage history are read-only", async () => {
  const data: any = workspace(); data.students[0].active = false;
  data.retired_stages = [{ id: "old", name: "Old evidence" }];
  data.students[0].check_in = { ...empty, version: 1, stages: { old: { status: "teacher_reviewed", target: null } } };
  api.mockResolvedValue(data);
  render(<AacStudentProgress classId={18} onBack={jest.fn()} />);
  await screen.findByRole("button", { name: "Fictional Bob" });
  expect(screen.queryByRole("button", { name: "Fictional Alice" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Show archived students with history"));
  fireEvent.click(screen.getByRole("button", { name: "Fictional Alice" }));
  expect(screen.getByLabelText("Teacher note / next action")).toBeDisabled();
  expect(screen.getByText(/Old evidence: Teacher reviewed/)).toBeInTheDocument();
  expect(api.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

function structuredCloneForTest<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
