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
        items: [
          { id: "paper-1", title: "Mr Fitz Maths - Algebra Mini Paper 1", cycle: "Leaving Certificate", level: "Higher Level", topic: "Algebra", duration: "30 minutes", marks: "60 marks", download_filename: "Mr-Fitz-Maths-Algebra-Mini-Paper-1.pdf" },
          { id: "paper-4", title: "Mr Fitz Maths - Algebra Mini Paper 4", cycle: "Leaving Certificate", level: "Higher Level", topic: "Algebra", duration: "30 minutes", marks: "60 marks", badge: "Challenge", download_filename: "Mr-Fitz-Maths-Algebra-Mini-Paper-4.pdf" },
        ],
      }),
    } as Response);

    render(<PublicExamCollectionPage />);
    await waitFor(() => expect(screen.getByText("Mr Fitz Maths - Algebra Mini Paper 1")).toBeInTheDocument());

    const titles = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(titles).toEqual([
      "Mr Fitz Maths - Algebra Mini Paper 1",
      "Mr Fitz Maths - Algebra Mini Paper 4",
    ]);
    expect(screen.getByText("Challenge")).toBeInTheDocument();
    expect(screen.getAllByText(/Leaving Certificate/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Open \/ download/i })[0]).toHaveAttribute(
      "href",
      "/api/public-exam-collections/mr-fitz-maths-mini-papers/items/paper-1/download",
    );
  });
});
