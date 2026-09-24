import type { ReactNode } from "react";
import { NavLink } from "react-router";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="wordmark">
          KisiEngine
        </NavLink>
        <nav aria-label="Primary">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
          >
            Workflows
          </NavLink>
        </nav>
      </header>
      {children}
    </div>
  );
}
