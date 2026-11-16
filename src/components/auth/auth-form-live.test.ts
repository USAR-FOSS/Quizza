import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/actions/auth", () => ({
  loginAction: vi.fn(),
  registerAction: vi.fn(),
}));

import { AuthForm } from "./auth-form";

describe("auth form live region and error accessibility", () => {
  it("renders live region for error announcements", () => {
    const html = renderToStaticMarkup(createElement(AuthForm));
    expect(html).toContain('id="auth-error-region"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
  });

  it("renders with initial error and associates inputs", () => {
    const html = renderToStaticMarkup(
      createElement(AuthForm, { initialError: "oidc_unavailable" }),
    );
    expect(html).toContain("FOSSClub sign-in is not configured");
    expect(html).toContain('aria-describedby="auth-error-region"');
    expect(html).toContain('aria-invalid="true"');
  });
});
