import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockApiFetch = jest.fn();

jest.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: "1" }),
}), { virtual: true });

jest.mock("./api", () => {
  class ApiError extends Error {
    status: number;
    response: unknown;

    constructor(status: number, message: string, response: unknown) {
      super(message);
      this.status = status;
      this.response = response;
    }
  }

  return {
    ApiError,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
    apiFetchBlob: jest.fn(),
  };
});

jest.mock("./i18n/UiLanguageContext", () => ({
  useUiLanguage: () => ({ language: "en", t: (key: string) => key }),
}));

import { ApiError } from "./api";
import NotesPage from "./NotesPage";

function renderNotesPage(uploadResult: () => unknown | Promise<unknown>) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/api/classes/1") return Promise.resolve({ id: 1, name: "6th Year", subject: "Science" });
    if (path === "/api/topics/1?kind=notes") return Promise.resolve([{ id: 10, class_id: 1, name: "Revision" }]);
    if (path === "/api/notes/1?kind=notes") return Promise.resolve([]);
    if (path === "/api/notes/upload") return uploadResult();
    return Promise.resolve({});
  });

  return render(<NotesPage />);
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

test("shows the slideshow limit helper and a friendly replacement-file path for a 31-slide upload", async () => {
  const replacementClick = jest.spyOn(HTMLInputElement.prototype, "click");
  const uploadError = new ApiError(422, "This slideshow is above Elume's supported slide limit.", {
    detail: {
      code: "slideshow_slide_limit_exceeded",
      maximum_slides: 30,
      actual_slides: 31,
      message: "This slideshow is above Elume's supported slide limit.",
    },
  });
  const { container } = renderNotesPage(() => Promise.reject(uploadError));

  await screen.findByText("Revision");
  fireEvent.click(screen.getAllByRole("button", { name: "notes.upload" })[0]);
  expect(screen.getByText("Slideshow presentations can contain up to 30 slides.")).toBeInTheDocument();

  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File(["slides"], "revision.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })] },
  });
  fireEvent.click(await screen.findByRole("button", { name: "notes.convertAndUpload" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("That slideshow is a little too large");
  expect(screen.getByText("Elume supports slideshow presentations with up to 30 slides. Try splitting this file into two smaller presentations and uploading them separately.")).toBeInTheDocument();
  expect(screen.getByText("This slideshow contains 31 slides.")).toBeInTheDocument();
  expect(screen.queryByText(/Microsoft|PowerPoint/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
  expect(replacementClick).toHaveBeenCalled();
  expect(screen.queryByText("That slideshow is a little too large")).not.toBeInTheDocument();
  replacementClick.mockRestore();
});

test("keeps other upload errors on the existing generic error path", async () => {
  const { container } = renderNotesPage(() => Promise.reject(new Error("network unavailable")));

  await screen.findByText("Revision");
  fireEvent.click(screen.getAllByRole("button", { name: "notes.upload" })[0]);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File(["pdf"], "revision.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getAllByRole("button", { name: "notes.upload" })[1]);

  expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t upload that file just now. Please try again.");
  expect(screen.queryByText("That slideshow is a little too large")).not.toBeInTheDocument();
});

test("keeps accepted PDF uploads on the existing successful path", async () => {
  const { container } = renderNotesPage(() => Promise.resolve({ id: 41, filename: "revision.pdf" }));

  await screen.findByText("Revision");
  fireEvent.click(screen.getAllByRole("button", { name: "notes.upload" })[0]);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fileInput, { target: { files: [new File(["pdf"], "revision.pdf", { type: "application/pdf" })] } });
  fireEvent.click(screen.getAllByRole("button", { name: "notes.upload" })[1]);

  await waitFor(() => expect(screen.queryByText("notes.uploadNotes")).not.toBeInTheDocument());
  expect(mockApiFetch).toHaveBeenCalledWith("/api/notes/upload", expect.objectContaining({ method: "POST" }));
  expect(screen.queryByText("That slideshow is a little too large")).not.toBeInTheDocument();
});
