import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { WorkbenchPage } from "./pages/WorkbenchPage";
import { InspectorPage } from "./pages/InspectorPage";
import { HistoryPage } from "./pages/HistoryPage";
import {
  WalletCallbackPage,
  WalletLoginReturn,
} from "./pages/WalletCallbackPage";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          basename={
            location.pathname.startsWith("/playground") ? "/playground" : "/"
          }
        >
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<WorkbenchPage />} />
              <Route path="wallet-callback" element={<WalletCallbackPage />} />
              <Route path="login-return" element={<WalletLoginReturn />} />
              <Route path="inspector" element={<InspectorPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route
                path="*"
                element={
                  <p>Page not found. Choose a page from the navigation.</p>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
