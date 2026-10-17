import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionMedia } from "./question-media";

describe("question media", () => {
  it("renders a saved upload as an eager question image", () => {
    const url = "/api/v1/uploads/11111111-1111-4111-8111-111111111111";
    const html = renderToStaticMarkup(createElement(QuestionMedia, { url }));
    expect(html).toContain(`<img src="${url}"`);
    expect(html).toContain('loading="eager"');
  });
});
