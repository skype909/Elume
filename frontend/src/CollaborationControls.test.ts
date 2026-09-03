import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { selectStudentDrawingTool, studentBoardTool, STUDENT_DRAWING_TOOLS, TEACHER_TOOL_ACTIONS } from "./collaborationToolControls";
import { TeacherHighlighterSettings } from "./TeacherHighlighterSettings";
import { TeacherToolPalette } from "./TeacherToolPalette";

test("teacher toolbar sends established tool identifiers from the rendered production controls", () => {
  const onToolChange = jest.fn();
  render(React.createElement(TeacherToolPalette, { selectedTool: "pen", onToolChange }));

  TEACHER_TOOL_ACTIONS.forEach(({ key, label }) => {
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onToolChange).toHaveBeenLastCalledWith(key);
  });

  expect(screen.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
});

test("teacher highlighter settings expose the existing stroke widths", () => {
  const onPenSizeChange = jest.fn();
  const onColorChange = jest.fn();
  render(React.createElement(TeacherHighlighterSettings, {
    color: "yellow",
    penSize: 1,
    onColorChange,
    onPenSizeChange,
  }));

  expect(screen.getByRole("button", { name: "Fine stroke" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Medium stroke" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Blue" }));
  expect(onColorChange).toHaveBeenCalledWith("blue");
  fireEvent.click(screen.getByRole("button", { name: "Bold stroke" }));
  expect(onPenSizeChange).toHaveBeenCalledWith(3);
});

test("choosing any student drawing tool turns Move board off", () => {
  STUDENT_DRAWING_TOOLS.forEach((drawingTool) => {
    const setTool = jest.fn();
    const setViewportMode = jest.fn();

    selectStudentDrawingTool(drawingTool, setTool, setViewportMode);

    expect(setTool).toHaveBeenCalledWith(drawingTool);
    expect(setViewportMode).toHaveBeenCalledWith("fixed");
  });
});

test("active Move board retains the existing select-based movement contract", () => {
  expect(studentBoardTool("fixed", "pen")).toBe("pen");
  expect(studentBoardTool("pan", "pen")).toBe("select");
});
