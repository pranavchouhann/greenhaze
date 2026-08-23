import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GreenHazeShell } from "./components/GreenHazeShell";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Scan = lazy(() => import("./pages/Scan"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Admin = lazy(() => import("./pages/Admin"));
const Auth = lazy(() => import("./pages/Auth"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoader() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div className="gh-typing"><span /><span /><span /></div>
    </div>
  );
}

function Router() {
  return (
    <GreenHazeShell>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/scan"} component={Scan} />
          <Route path={"/schedule"} component={Schedule} />
          <Route path={"/admin"} component={Admin} />
          <Route path={"/auth"} component={Auth} />
          <Route path={"/privacy"} component={Privacy} />
          <Route path={"/terms"} component={Terms} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </GreenHazeShell>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
