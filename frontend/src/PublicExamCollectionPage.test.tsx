import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import PublicExamCollectionPage from "./PublicExamCollectionPage";

describe("PublicExamCollectionPage", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows published papers in manifest order with safe explicit download URLs", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "mr-fitz-maths-mini-papers",
        title: "Mr Fitz Maths Mini Papers",
        description: "Original Higher Level algebra practice",
        topics: [{ id: "algebra", title: "Algebra", published_paper_count: 2 }],
        items: [
          { id: "paper-1", title: "Mr Fitz Maths - Algebra Mini Paper 1", cycle: "Leaving Certificate", level: "Higher Level", topic: "Algebra", duration: "30 minutes", marks: "60 marks", download_filename: "Mr-Fitz-Maths-Algebra-Mini-Paper-1.pdf" },
          { id: "paper-4", title: "Mr Fitz Maths - Algebra Mini Paper 4", cycle: "Leaving Certificate", level: "Higher Level", topic: "Algebra", duration: "30 minutes", marks: "60 marks", badge: "Challenge", download_filename: "Mr-Fitz-Maths-Algebra-Mini-Paper-4.pdf" },
        ],
      }),
    } as Response);

    render(<PublicExamCollectionPage />);
    await waitFor(() => expect(screen.getByText("Algebra")).toBeInTheDocument());

    expect(screen.getByRole("link", { name: /Algebra/i })).toHaveAttribute("href", "/#/student/exam-papers/mr-fitz-maths-mini-papers/algebra");
  });
});
