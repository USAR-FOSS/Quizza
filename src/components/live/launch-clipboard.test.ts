import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Launch } from "./launch";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("launch clipboard and accessibility", () => {
  it("renders launch form with accessible controls", () => {
    const html = renderToStaticMarkup(
      createElement(Launch, {
        quizId: "quiz-123",
        title: "Test Quiz",
        questionCount: 5,
      }),
    );
    expect(html).toContain("Test Quiz");
    expect(html).toContain("Quiz mode");
    expect(html).toContain("Scheduled");
    expect(html).toContain("Open live lobby");
  });
});
