jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useParams: () => ({ id: "12" }) }), { virtual: true });
jest.mock("html-to-image", () => ({ toPng: jest.fn() }));
jest.mock("jspdf", () => jest.fn());
jest.mock("./api", () => ({ apiFetch: jest.fn() }));
jest.mock("./i18n/UiLanguageContext", () => ({ useUiLanguage: () => ({ t: (key: string) => key === "seatingPlan.title" ? "Seating Plan" : key }) }));

import React from "react";
import { render, screen } from "@testing-library/react";
import { SeatingPlanHeading } from "./SeatingPlanPage";

test("renders the seating-plan heading with an em dash rather than mojibake", () => {
  render(React.createElement(SeatingPlanHeading, {
    className: "6th Year",
    classId: "12",
    pageTitle: "Seating Plan",
  }));

  expect(screen.getByText("6th Year — Seating Plan")).toBeInTheDocument();
  expect(screen.queryByText("â€”")).not.toBeInTheDocument();
});
