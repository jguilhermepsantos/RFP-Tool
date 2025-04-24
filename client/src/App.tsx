import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, RequireAuth, RequireAdmin } from "./lib/auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Projects from "@/pages/projects";
import ProjectDetails from "@/pages/project-details";
import RfpDocument from "@/pages/rfp-document";
import SuggestDocument from "@/pages/suggest-document";
import AdminSettings from "@/pages/admin-settings";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/projects">
        <RequireAuth>
          <Projects />
        </RequireAuth>
      </Route>
      
      <Route path="/projects/:projectId">
        {(params) => (
          <RequireAuth>
            <ProjectDetails projectId={params.projectId} />
          </RequireAuth>
        )}
      </Route>
      
      <Route path="/projects/:projectId/rfp-documents/:documentId">
        {(params) => (
          <RequireAuth>
            <RfpDocument 
              projectId={params.projectId} 
              documentId={params.documentId} 
            />
          </RequireAuth>
        )}
      </Route>
      
      <Route path="/suggest-document">
        <RequireAuth>
          <SuggestDocument />
        </RequireAuth>
      </Route>
      
      <Route path="/admin-settings">
        <RequireAdmin>
          <AdminSettings />
        </RequireAdmin>
      </Route>
      
      {/* Redirect from root to projects */}
      <Route path="/">
        <RequireAuth>
          <Projects />
        </RequireAuth>
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
