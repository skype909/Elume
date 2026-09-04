import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StudentClassPage from "./StudentClassPage";

jest.mock("react-router-dom", () => ({
  useNavigate: (() => {
    const navigate = jest.fn();
    return () => navigate;
  })(),
  useParams: () => ({ token: "student-access-token" }),
}), { virtual: true });

const notes = [
  { id: 1, filename: "Forces worksheet.pdf", topic_id: 10, topic_name: "Physics", uploaded_at: "2026-09-01T10:00:00Z", file_url: "/student/student-access-token/notes/1/download" },
  { id: 2, filename: "Newest chemistry slides.pptx", topic_id: 11, topic_name: "Chemistry", uploaded_at: "2026-09-03T10:00:00Z", file_url: "/student/student-access-token/notes/2/download" },
  { id: 3, filename: "Class handbook.pdf", uploaded_at: "2026-09-02T10:00:00Z", file_url: "/student/student-access-token/notes/3/download" },
];

function renderStudentPage(payload: unknown = { class_name: "5th Year Science", notes, tests: [], posts: [] }) {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload }) as jest.Mock;
  return render(<StudentClassPage />);
}

async function openNotes() {
  await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument());
  fireEvent.click(await screen.findByRole("button", { name: /resources/i }));
  return screen.findByRole("heading", { name: "Notes library" });
}

describe("StudentClassPage notes library", () => {
  test("groups notes by the teacher topic, keeps unassigned notes in General notes, and orders recent notes", async () => {
    const libraryNotes = [
      { id: 5, filename: "Newest chemistry slides.pptx", topic_id: 11, topic_name: "Chemistry", uploaded_at: "2026-09-05T10:00:00Z", file_url: "/student/student-access-token/notes/5/download" },
      { id: 4, filename: "Class handbook.pdf", uploaded_at: "2026-09-04T10:00:00Z", file_url: "/student/student-access-token/notes/4/download" },
      { id: 3, filename: "Forces worksheet.pdf", topic_id: 10, topic_name: "Physics", uploaded_at: "2026-09-03T10:00:00Z", file_url: "/student/student-access-token/notes/3/download" },
      { id: 2, filename: "Lab report.pdf", topic_id: 10, topic_name: "Physics", uploaded_at: "2026-09-02T10:00:00Z", file_url: "/student/student-access-token/notes/2/download" },
      { id: 1, filename: "Earliest revision.pdf", topic_id: 10, topic_name: "Physics", uploaded_at: "2026-09-01T10:00:00Z", file_url: "/student/student-access-token/notes/1/download" },
    ];
    renderStudentPage({ class_name: "5th Year Science", notes: libraryNotes, tests: [], posts: [] });
    await openNotes();

    expect(screen.getByRole("button", { name: /physics.*3 notes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chemistry.*1 note/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /general notes.*1 note/i })).toBeInTheDocument();
    const recentSection = screen.getByRole("heading", { name: "Recently added" }).closest("section") as HTMLElement;
    expect(within(recentSection).getAllByRole("link").map((link) => link.getAttribute("aria-label"))).toEqual([
      "Open Newest chemistry slides.pptx",
      "Open Class handbook.pdf",
      "Open Forces worksheet.pdf",
      "Open Lab report.pdf",
    ]);
    expect(within(recentSection).queryByRole("link", { name: "Open Earliest revision.pdf" })).not.toBeInTheDocument();

    const physics = screen.getByRole("button", { name: /physics.*3 notes/i });
    fireEvent.click(physics);
    const physicsPanel = document.getElementById(physics.getAttribute("aria-controls") || "") as HTMLElement;
    expect(within(physicsPanel).getByRole("link", { name: "Open Earliest revision.pdf" })).toBeInTheDocument();
  });

  test("expands topics and preserves the student note download URL", async () => {
    renderStudentPage();
    await openNotes();
    const physics = screen.getByRole("button", { name: /physics.*1 note/i });
    expect(physics).toHaveAttribute("aria-expanded", "false");
    await act(async () => { fireEvent.click(physics); });
    await waitFor(() => expect(screen.getByRole("button", { name: /physics.*1 note/i })).toHaveAttribute("aria-expanded", "true"));
    const panel = document.getElementById(physics.getAttribute("aria-controls") || "");
    const note = within(panel as HTMLElement).getByRole("link", { name: "Open Forces worksheet.pdf" });
    expect(note).toHaveAttribute("href", "/api/student/student-access-token/notes/1/download");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /physics.*1 note/i })); });
    await waitFor(() => expect(screen.getByRole("button", { name: /physics.*1 note/i })).toHaveAttribute("aria-expanded", "false"));
  });

  test("searches topic names and note titles without requiring horizontal layout", async () => {
    renderStudentPage();
    await openNotes();
    const search = screen.getByRole("textbox", { name: "Search notes and topics" });
    await act(async () => { fireEvent.change(search, { target: { value: "physics" } }); });
    await waitFor(() => expect(screen.getByRole("button", { name: /physics.*1 note/i })).toHaveAttribute("aria-expanded", "true"));
    await act(async () => { fireEvent.change(screen.getByRole("textbox", { name: "Search notes and topics" }), { target: { value: "handbook" } }); });
    await waitFor(() => expect(screen.getByRole("button", { name: /general notes.*1 note/i })).toBeInTheDocument());
    const general = screen.getByRole("button", { name: /general notes.*1 note/i });
    const generalPanel = document.getElementById(general.getAttribute("aria-controls") || "");
    expect(within(generalPanel as HTMLElement).getByRole("link", { name: "Open Class handbook.pdf" })).toBeInTheDocument();
    expect(screen.queryByText("No search results")).not.toBeInTheDocument();
  });

  test("shows the student-friendly empty state when no notes are shared", async () => {
    renderStudentPage({ class_name: "5th Year Science", notes: [], tests: [], posts: [] });
    await waitFor(() => expect(screen.queryByText(/Loading/)).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole("button", { name: /resources/i }));
    await waitFor(() => expect(screen.getByText("No notes shared yet. Your teacher’s resources will appear here.")).toBeInTheDocument());
  });
});
