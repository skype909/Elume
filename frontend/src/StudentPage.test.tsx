import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StudentPage from "./StudentPage";

const originalFetch = global.fetch;

function renderStudentHub() {
    return render(<StudentPage />);
}

beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/student");
    (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
});

afterEach(() => {
    global.fetch = originalFetch;
});

test("opens Student Hub without focusing a join or name input", () => {
    renderStudentHub();

    expect(screen.getByLabelText("CLASS CODE")).toBeInTheDocument();
    expect(screen.getByLabelText("CLASS PIN")).toBeInTheDocument();
    expect(screen.getByLabelText("Student name")).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByLabelText("CLASS CODE"));
    expect(document.activeElement).not.toBe(screen.getByLabelText("CLASS PIN"));
    expect(document.activeElement).not.toBe(screen.getByLabelText("Student name"));
    expect(screen.getByRole("button", { name: "Browse Exam Papers" })).toBeInTheDocument();
});

test("keeps each join code editable only after the student selects and taps its card", () => {
    renderStudentHub();

    const classCode = screen.getByLabelText("CLASS CODE");
    fireEvent.click(classCode);
    fireEvent.change(classCode, { target: { value: "ab-12!" } });
    expect(classCode).toHaveValue("AB12");

    fireEvent.click(screen.getByText("JOIN A LIVE QUIZ").closest("button")!);
    const quizCode = screen.getByLabelText("QUIZ CODE");
    expect(document.activeElement).not.toBe(quizCode);
    fireEvent.click(quizCode);
    fireEvent.change(quizCode, { target: { value: "quiz-8" } });
    expect(quizCode).toHaveValue("QUIZ8");

    fireEvent.click(screen.getByText("JOIN A COLLAB BOARD").closest("button")!);
    const collabCode = screen.getByLabelText("COLLAB CODE");
    expect(document.activeElement).not.toBe(collabCode);
    fireEvent.click(collabCode);
    fireEvent.change(collabCode, { target: { value: "board-9" } });
    expect(collabCode).toHaveValue("BOARD9");
});

test("keeps the student Class PIN visible, numeric, sanitised, and submitted with the class join request", async () => {
    localStorage.setItem("elume_student_name_v1", "Aoife");
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: false, message: "Class not found" }),
    });
    renderStudentHub();

    const classCode = screen.getByLabelText("CLASS CODE");
    const pin = screen.getByLabelText("CLASS PIN");
    expect(pin).toHaveAttribute("type", "text");
    expect(pin).toHaveAttribute("inputmode", "numeric");
    expect(pin).toHaveAttribute("placeholder", "Enter class PIN");
    expect(screen.queryByRole("button", { name: "What is the Teacher Admin PIN?" })).not.toBeInTheDocument();

    fireEvent.change(classCode, { target: { value: "class1" } });
    fireEvent.change(pin, { target: { value: "12ab345678" } });
    expect(pin).toHaveValue("123456");

    fireEvent.click(screen.getByRole("button", { name: "Join Your Class" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
        "/api/student/join/class",
        expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ code: "CLASS1", name: "Aoife", pin: "123456" }),
        })
    );
});
