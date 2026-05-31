import { useEffect, useState, type FormEvent } from "react";
import { demoPositionedGraph } from "./demoGraph.js";
import { NetDrawWorkbench, type ArtifactDownloadItem, type ImportHistoryItem } from "./NetDrawWorkbench.js";
import {
  artifactDownloadUrl,
  createProject,
  getCurrentUser,
  getImportDetail,
  listImports,
  listProjects,
  login,
  logout,
  uploadProjectImport,
  type ApiArtifact,
  type ApiImport,
  type ApiProject,
  type ApiUser,
  type ImportUploadFiles
} from "./apiClient.js";
import type { PositionedGraph } from "../../src/types.js";

export function NetDrawApp() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ApiProject | null>(null);
  const [imports, setImports] = useState<ApiImport[]>([]);
  const [activeImport, setActiveImport] = useState<ApiImport | null>(null);
  const [artifacts, setArtifacts] = useState<ApiArtifact[]>([]);
  const [graph, setGraph] = useState<PositionedGraph>(demoPositionedGraph);
  const [importError, setImportError] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const currentUser = await getCurrentUser();
        if (cancelled) {
          return;
        }
        setUser(currentUser);
        if (currentUser) {
          setProjects(await listProjects());
        }
      } catch (error) {
        setAppError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProjects = async () => {
    setProjects(await listProjects());
  };

  const enterProject = async (project: ApiProject) => {
    setSelectedProject(project);
    setAppError(null);
    setImportError(null);
    const projectImports = await listImports(project.id);
    setImports(projectImports);
    const latestCompleted = projectImports.find((item) => item.status === "completed");
    if (latestCompleted) {
      await loadImport(project, latestCompleted.id);
    } else {
      setActiveImport(null);
      setArtifacts([]);
      setGraph(demoPositionedGraph);
    }
  };

  const loadImport = async (project: ApiProject, importId: string) => {
    const detail = await getImportDetail(project.id, importId);
    setActiveImport(detail.import);
    setArtifacts(detail.artifacts);
    if (detail.positionedGraph) {
      setGraph(detail.positionedGraph);
    }
  };

  const handleLogin = async (username: string, password: string) => {
    setAppError(null);
    try {
      const loggedInUser = await login(username, password);
      setUser(loggedInUser);
      await refreshProjects();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCreateProject = async (name: string, description: string) => {
    setAppError(null);
    try {
      const project = await createProject(name, description);
      setProjects((current) => [project, ...current]);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleEnterProject = async (project: ApiProject) => {
    try {
      await enterProject(project);
    } catch (error) {
      setAppError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleImportData = async (files: ImportUploadFiles) => {
    if (!selectedProject) {
      throw new Error("Select a project before importing a table.");
    }
    setImportError(null);
    const detail = await uploadProjectImport(selectedProject.id, files);
    setActiveImport(detail.import);
    setArtifacts(detail.artifacts);
    if (detail.positionedGraph) {
      setGraph(detail.positionedGraph);
    }
    setImports(await listImports(selectedProject.id));
  };

  const handleSelectImport = async (importId: string) => {
    if (!selectedProject) {
      return;
    }
    setImportError(null);
    await loadImport(selectedProject, importId);
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setProjects([]);
    setSelectedProject(null);
    setImports([]);
    setActiveImport(null);
    setArtifacts([]);
    setGraph(demoPositionedGraph);
  };

  if (booting) {
    return <ShellMessage title="NetDraw" message="Loading workspace..." />;
  }

  if (!user) {
    return <LoginPage error={appError} onLogin={handleLogin} />;
  }

  if (!selectedProject) {
    return (
      <ProjectPicker
        user={user}
        projects={projects}
        error={appError}
        onCreateProject={handleCreateProject}
        onSelectProject={handleEnterProject}
        onLogout={handleLogout}
      />
    );
  }

  const downloadItems: ArtifactDownloadItem[] = activeImport
    ? artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      kind: artifact.kind,
      url: artifactDownloadUrl(selectedProject.id, activeImport.id, artifact.fileName)
    }))
    : [];

  return (
    <NetDrawWorkbench
      positionedGraph={graph}
      onImportData={handleImportData}
      importSummary={activeImport ? `Imported: ${activeImport.sourceFileName}` : "No import selected"}
      importDetails={activeImport ? `Rows: ${activeImport.rowCount} · Cables: ${activeImport.logicalCableCount}` : "Upload an interface table to generate a graph"}
      importError={importError}
      setImportError={setImportError}
      projectName={selectedProject.name}
      userName={user.username}
      onBackToProjects={() => setSelectedProject(null)}
      onLogout={handleLogout}
      importHistory={imports.map(toHistoryItem)}
      activeImportId={activeImport?.id}
      onSelectImport={handleSelectImport}
      artifactDownloads={downloadItems}
      templateDownloads={[
        { fileName: "interface-template.csv", url: "/api/templates/interface-template.csv" },
        { fileName: "routes-template.csv", url: "/api/templates/routes-template.csv" },
        { fileName: "components-template.csv", url: "/api/templates/components-template.csv" },
        { fileName: "rules-template.json", url: "/api/templates/rules-template.json" },
        { fileName: "basic-topology-interface-template.csv", url: "/api/templates/basic-topology-interface-template.csv" },
        { fileName: "basic-topology-components-template.csv", url: "/api/templates/basic-topology-components-template.csv" },
        { fileName: "basic-topology-rules-template.json", url: "/api/templates/basic-topology-rules-template.json" },
        { fileName: "README.md", url: "/api/templates/README.md" }
      ]}
    />
  );
}

function LoginPage({ error, onLogin }: { error: string | null; onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(username, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">NetDraw LAN</span>
        <h1>Login</h1>
        <p>Default first-run admin is admin / admin123.</p>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="import-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Logging in..." : "Login"}
        </button>
      </form>
    </main>
  );
}

function ProjectPicker({
  user,
  projects,
  error,
  onCreateProject,
  onSelectProject,
  onLogout
}: {
  user: ApiUser;
  projects: ApiProject[];
  error: string | null;
  onCreateProject: (name: string, description: string) => Promise<void>;
  onSelectProject: (project: ApiProject) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onCreateProject(name, description);
      setName("");
      setDescription("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="project-shell">
      <section className="project-card">
        <div className="project-header">
          <div>
            <span className="eyebrow">Signed in as {user.username}</span>
            <h1>Select project</h1>
          </div>
          <button type="button" className="tool-button" onClick={onLogout}>
            Logout
          </button>
        </div>
        {user.mustChangePassword ? <p className="warning-note">Default admin password is still active. Change it before wider LAN use.</p> : null}
        {error ? <p className="import-error">{error}</p> : null}
        <div className="project-list">
          {projects.map((project) => (
            <button key={project.id} type="button" className="project-tile" onClick={() => void onSelectProject(project)}>
              <strong>{project.name}</strong>
              <span>{project.description || "No description"}</span>
            </button>
          ))}
          {projects.length === 0 ? <p className="empty-state">No projects yet.</p> : null}
        </div>
        {user.role === "admin" ? (
          <form className="create-project-form" onSubmit={submit}>
            <h2>Create project</h2>
            <input placeholder="Project name" value={name} onChange={(event) => setName(event.target.value)} />
            <input placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <button type="submit" className="primary-button" disabled={busy || !name.trim()}>
              {busy ? "Creating..." : "Create project"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function ShellMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function toHistoryItem(item: ApiImport): ImportHistoryItem {
  return {
    id: item.id,
    fileName: item.sourceFileName,
    status: item.status,
    createdAt: item.createdAt,
    rowCount: item.rowCount,
    logicalCableCount: item.logicalCableCount
  };
}
