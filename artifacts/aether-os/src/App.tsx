import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout/Layout";
import { LoginGate } from "@/components/LoginGate";
import Dashboard from "@/pages/dashboard";
import DevOps from "@/pages/devops";
import Focus from "@/pages/focus";
import Storage from "@/pages/storage";
import Environment from "@/pages/environment";
import Workflow from "@/pages/workflow";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devops" component={DevOps} />
        <Route path="/focus" component={Focus} />
        <Route path="/storage" component={Storage} />
        <Route path="/environment" component={Environment} />
        <Route path="/workflow" component={Workflow} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LoginGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </LoginGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
