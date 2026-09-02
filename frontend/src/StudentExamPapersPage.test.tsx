import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudentExamPapersPage from "./StudentExamPapersPage";

const officialItem = {
  id: "lc-maths-hl-2025-paper-1",
  cycle: "Senior Cycle",
  subject: "Maths",
  level: "Higher Level",
  year: 2025,
  title: "Leaving Certificate Maths HL 2025 Paper 1",
  official_source_url: "https://www.examinations.ie/exammaterialarchive/",
  source: "State Examinations Commission",
};

function mockCatalogue(data: unknown, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, json: async () => data }) as jest.Mock;
}

describe("StudentExamPapersPage", () => {
  test("shows the preparation state for an empty catalogue without authentication", async () => {
    mockCatalogue([]);
    render(<StudentExamPapersPage />);

    expect(await screen.findByText(/being prepared for students/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/data/public_exam_library.json", { credentials: "omit" });
  });

  test("filters public SEC catalogue items and opens the official URL directly", async () => {
    mockCatalogue([officialItem, { ...officialItem, id: "jc-science-cl-2024", cycle: "Junior Cycle", subject: "Science", level: "Common Level", year: 2024, title: "Junior Cycle Science 2024" }]);
    render(<StudentExamPapersPage />);

    expect(await screen.findByText(officialItem.title)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Science" } });

    await waitFor(() => expect(screen.queryByText(officialItem.title)).not.toBeInTheDocument());
    expect(screen.getByText("Junior Cycle Science 2024")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Reset filters"));
    expect(await screen.findByText(officialItem.title)).toBeInTheDocument();

    const link = screen.getAllByRole("link", { name: /open official paper/i })[0];
    expect(link).toHaveAttribute("href", officialItem.official_source_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
