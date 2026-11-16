import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoundClock } from "./round-clock";

describe("round clock transitions and accessibility", () => {
  it("renders countdown with separate live region and aria-hidden visual numbers", () => {
    const startedAt = new Date().toISOString();
    const html = renderToStaticMarkup(
      createElement(RoundClock, {
        startedAt,
        seconds: 30,
        clockOffsetMs: 0,
      }),
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Keep your poker face.");
  });
});
