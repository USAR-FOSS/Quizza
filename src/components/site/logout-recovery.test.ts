import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserMenu } from "./user-menu";
import { NavLogout } from "./nav-logout";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/actions/auth", () => ({
  logoutAction: vi.fn(),
}));

describe("logout recovery controls", () => {
  it("renders accessible logout button in UserMenu", () => {
    const html = renderToStaticMarkup(
      createElement(UserMenu, { name: "Host Player", color: "#7c5cff" }),
    );
    expect(html).toContain('aria-label="Log out"');
    expect(html).toContain("Dashboard");
  });

  it("renders accessible logout button in NavLogout", () => {
    const html = renderToStaticMarkup(createElement(NavLogout));
    expect(html).toContain('aria-label="Log out"');
    expect(html).toContain('title="Log out"');
  });
});
