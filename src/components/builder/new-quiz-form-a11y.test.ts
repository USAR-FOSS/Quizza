import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NewQuizForm } from "./new-quiz-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/actions/quiz", () => ({
  createQuiz: vi.fn(),
}));

describe("NewQuizForm Accessible Labels & Group Semantics (Issue #23)", () => {
  it("associates the visible title label directly with the input via htmlFor and id", () => {
    const html = renderToStaticMarkup(createElement(NewQuizForm));

    expect(html).toContain('for="quiz-title-input"');
    expect(html).toContain('id="quiz-title-input"');
  });

  it("groups cover icon choices into a fieldset with radiogroup semantics and aria-checked states", () => {
    const html = renderToStaticMarkup(createElement(NewQuizForm));

    expect(html).toContain('<fieldset');
    expect(html).toContain('id="cover-icon-legend"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-labelledby="cover-icon-legend"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Cover icon shapes"');
  });

  it("groups theme choices into a fieldset with radiogroup semantics and aria-checked states", () => {
    const html = renderToStaticMarkup(createElement(NewQuizForm));

    expect(html).toContain('id="theme-legend"');
    expect(html).toContain('aria-labelledby="theme-legend"');
    expect(html).toContain('aria-label="Theme After-school club"');
  });
});
