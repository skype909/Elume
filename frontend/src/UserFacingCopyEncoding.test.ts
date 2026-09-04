jest.mock("react-router-dom", () => ({
  Link: () => null,
  Route: () => null,
  Routes: () => null,
  useLocation: () => ({ pathname: "/", state: null }),
  useNavigate: () => jest.fn(),
  useParams: () => ({ id: "1" }),
}), { virtual: true });
jest.mock("./api", () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn(), getToken: jest.fn(), clearToken: jest.fn() }));
jest.mock("jspdf", () => ({ jsPDF: jest.fn(), default: jest.fn() }));
jest.mock("html-to-image", () => ({ toPng: jest.fn() }));

import { CLASS_ORDER_SAVE_ERROR } from "./App";
import {
  QUIZ_QUESTION_REQUIRED_ERROR,
  QUIZ_TITLE_REQUIRED_ERROR,
} from "./QuizzesPage";

describe("user-facing copy encoding", () => {
  test("uses typographic apostrophes rather than mojibake in dashboard and quiz errors", () => {
    const messages = [
      CLASS_ORDER_SAVE_ERROR,
      QUIZ_TITLE_REQUIRED_ERROR,
      QUIZ_QUESTION_REQUIRED_ERROR,
    ];

    expect(messages).toEqual([
      "We couldn\u2019t save that class order just now. Please try again.",
      "Quiz title can\u2019t be empty.",
      "Question text can\u2019t be empty.",
    ]);
    messages.forEach((message) => expect(message).not.toContain("â€™"));
  });
});
