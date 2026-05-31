import type { PositionedGraph } from "../../src/types.js";

export interface ApiUser {
  id: string;
  username: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
}

export interface ApiProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiImport {
  id: string;
  projectId: string;
  status: "processing" | "completed" | "failed";
  sourceFileName: string;
  rowCount: number;
  logicalCableCount: number;
  routeSegmentCount: number;
  errorMessage?: string;
  createdAt: string;
}

export interface ApiArtifact {
  id: string;
  kind: string;
  fileName: string;
  createdAt: string;
}

export interface ImportDetailResponse {
  import: ApiImport;
  artifacts: ApiArtifact[];
  positionedGraph?: PositionedGraph;
}

export interface ImportUploadFiles {
  interfaceTable: File;
  routesTable?: File | null;
  componentsTable?: File | null;
  rulesJson?: File | null;
}

export async function getCurrentUser(): Promise<ApiUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (response.status === 401) {
    return null;
  }
  const body = await readJson<{ user: ApiUser }>(response);
  return body.user;
}

export async function login(username: string, password: string): Promise<ApiUser> {
  const body = await apiRequest<{ user: ApiUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  return body.user;
}

export async function logout(): Promise<void> {
  await apiRequest("/api/auth/logout", { method: "POST" });
}

export async function listProjects(): Promise<ApiProject[]> {
  const body = await apiRequest<{ projects: ApiProject[] }>("/api/projects");
  return body.projects;
}

export async function createProject(name: string, description: string): Promise<ApiProject> {
  const body = await apiRequest<{ project: ApiProject }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, description })
  });
  return body.project;
}

export async function listImports(projectId: string): Promise<ApiImport[]> {
  const body = await apiRequest<{ imports: ApiImport[] }>(`/api/projects/${projectId}/imports`);
  return body.imports;
}

export async function getImportDetail(projectId: string, importId: string): Promise<ImportDetailResponse> {
  return apiRequest<ImportDetailResponse>(`/api/projects/${projectId}/imports/${importId}`);
}

export async function uploadProjectImport(projectId: string, files: ImportUploadFiles): Promise<ImportDetailResponse> {
  const formData = new FormData();
  formData.set("interfaceTable", files.interfaceTable);
  if (files.routesTable) {
    formData.set("routesTable", files.routesTable);
  }
  if (files.componentsTable) {
    formData.set("componentsTable", files.componentsTable);
  }
  if (files.rulesJson) {
    formData.set("rulesJson", files.rulesJson);
  }
  return apiRequest<ImportDetailResponse>(`/api/projects/${projectId}/imports`, {
    method: "POST",
    body: formData
  });
}

export function artifactDownloadUrl(projectId: string, importId: string, fileName: string): string {
  return `/api/projects/${projectId}/imports/${importId}/artifacts/${encodeURIComponent(fileName)}`;
}

async function apiRequest<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include"
  });
  return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed with ${response.status}`);
  }
  return body as T;
}
