import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuestionEditor } from "./question-editor";
import type { QuestionWithOptions } from "@/lib/db/schema-types";

// Mock transitive DB actions and upload client
vi.mock("@/lib/actions/auth", () => ({
  logoutAction: vi.fn(),
}));

describe("QuestionEditor Accessible Names (Issue #22)", () => {
  const mockQuestion: QuestionWithOptions = {
    id: "q-1",
    quizId: "quiz-1",
    type: "multiple_choice",
    position: 0,
    prompt: "Sample Question Prompt",
    mediaUrl: null,
    timeLimitSec: 30,
    points: 1000,
    settings: { speedBonus: true },
    options: [
      {
        id: "opt-1",
        questionId: "q-1",
        position: 0,
        label: "First Option",
        isCorrect: true,
        color: "mint",
      },
      {
        id: "opt-2",
        questionId: "q-1",
        position: 1,
        label: "Second Option",
        isCorrect: false,
        color: "coral",
      },
      {
        id: "opt-3",
        questionId: "q-1",
        position: 2,
        label: "Third Option",
        isCorrect: false,
        color: "grape",
      },
    ],
  };

  it("renders prompt textarea with persistent aria-label even after typing", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionEditor, {
        question: mockQuestion,
        index: 2,
        speedBonus: false,
        onChange: vi.fn(),
        onAddOption: vi.fn(),
        onUpdateOption: vi.fn(),
        onSetCorrect: vi.fn(),
        onDeleteOption: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="Question 3 prompt"');
    expect(html).toContain('placeholder="Type your question…"');
  });

  it("renders distinct persistent accessible names for every option input and action", () => {
    const html = renderToStaticMarkup(
      createElement(QuestionEditor, {
        question: mockQuestion,
        index: 0,
        speedBonus: false,
        onChange: vi.fn(),
        onAddOption: vi.fn(),
        onUpdateOption: vi.fn(),
        onSetCorrect: vi.fn(),
        onDeleteOption: vi.fn(),
      }),
    );

    // Inputs have persistent numbered accessible names
    expect(html).toContain('aria-label="Option 1 answer text"');
    expect(html).toContain('aria-label="Option 2 answer text"');
    expect(html).toContain('aria-label="Option 3 answer text"');

    // Color buttons have numbered accessible names
    expect(html).toContain('aria-label="Change colour for option 1"');
    expect(html).toContain('aria-label="Change colour for option 2"');
    expect(html).toContain('aria-label="Change colour for option 3"');

    // Mark correct controls indicate state and option index
    expect(html).toContain('aria-label="Option 1 marked as correct"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Mark option 2 as correct"');

    // Delete buttons indicate which option is being removed
    expect(html).toContain('aria-label="Delete option 1"');
    expect(html).toContain('aria-label="Delete option 2"');
    expect(html).toContain('aria-label="Delete option 3"');
  });

  it("renders persistent accessible names for scale editor minimum and maximum labels", () => {
    const scaleQuestion: QuestionWithOptions = {
      ...mockQuestion,
      type: "scale",
      options: [],
      settings: { scaleMin: 1, scaleMax: 5, scaleMinLabel: "Low", scaleMaxLabel: "High" },
    };

    const html = renderToStaticMarkup(
      createElement(QuestionEditor, {
        question: scaleQuestion,
        index: 0,
        speedBonus: false,
        onChange: vi.fn(),
        onAddOption: vi.fn(),
        onUpdateOption: vi.fn(),
        onSetCorrect: vi.fn(),
        onDeleteOption: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="Scale minimum label"');
    expect(html).toContain('aria-label="Scale maximum label"');
  });
});
