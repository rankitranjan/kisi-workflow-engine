import { BrowserRouter, Route, Routes } from "react-router";

import { MISSING_DEMO_ACCESS_KEY_MESSAGE, readDemoAccessKey } from "./api/client";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/toast";
import { WorkflowEditor } from "./pages/WorkflowEditor";
import { WorkflowList } from "./pages/WorkflowList";

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell>
        {readDemoAccessKey() === undefined ? (
          <main className="page">
            <h1>Workflows</h1>
            <p role="alert">{MISSING_DEMO_ACCESS_KEY_MESSAGE}</p>
          </main>
        ) : (
          <Routes>
            <Route path="/" element={<WorkflowList />} />
            <Route path="/workflows/new" element={<WorkflowEditor />} />
            <Route path="/workflows/:id" element={<WorkflowEditor />} />
          </Routes>
        )}
        </AppShell>
      </ToastProvider>
    </BrowserRouter>
  );
}
