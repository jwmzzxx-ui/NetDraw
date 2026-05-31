import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, join, resolve } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { runPipeline } from "../src/pipeline.js";
import { createNetDrawDatabase, type ArtifactRecord, type NetDrawDatabase, type UserRecord } from "./database.js";

export interface BuildServerOptions {
  dbPath?: string;
  dataRoot?: string;
  host?: string;
}

export type NetDrawServer = FastifyInstance & { db: NetDrawDatabase };

interface UploadFiles {
  interfaceTable?: SavedUpload;
  routesTable?: SavedUpload;
  componentsTable?: SavedUpload;
  rulesJson?: SavedUpload;
}

interface SavedUpload {
  originalName: string;
  path: string;
}

const artifactKinds: Record<string, string> = {
  "canonical-graph.json": "canonical_graph",
  "positioned-graph.json": "positioned_graph",
  "validation-report.json": "validation_report",
  "analysis-report.json": "analysis_report",
  "model-diagnostics.json": "model_diagnostics",
  "cable-list.csv": "cable_list_csv",
  "cable-list.xlsx": "cable_list_xlsx",
  "graph.svg": "graph_svg"
};

export async function buildServer(options: BuildServerOptions = {}): Promise<NetDrawServer> {
  const dataRoot = resolve(options.dataRoot ?? "data");
  const db = createNetDrawDatabase({ dbPath: resolve(options.dbPath ?? join(dataRoot, "netdraw.sqlite")) });
  const app = Fastify({ logger: false }) as unknown as NetDrawServer;
  app.decorate("db", db);

  await app.register(cookie);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.addHook("onClose", async () => db.close());

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/templates/:fileName", async (request, reply) => {
    const { fileName } = request.params as { fileName: string };
    const filePath = resolve("samples", "templates", sanitizeFileName(fileName));
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: { message: "Template not found" } });
    }
    reply.type(contentTypeFor(fileName));
    return reply.send(await readFile(filePath));
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const user = db.verifyPassword(String(body.username ?? ""), String(body.password ?? ""));
    if (!user) {
      return reply.code(401).send({ error: { message: "Invalid username or password" } });
    }
    const token = db.createSession(user.id);
    reply.setCookie("netdraw_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax"
    });
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies.netdraw_session;
    if (token) {
      db.deleteSession(token);
    }
    reply.clearCookie("netdraw_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    return user ? { user } : undefined;
  });

  app.get("/api/users", async (request, reply) => {
    const user = await requireAdmin(request, reply, db);
    if (!user) {
      return undefined;
    }
    return { users: db.listUsers() };
  });

  app.post("/api/users", async (request, reply) => {
    const user = await requireAdmin(request, reply, db);
    if (!user) {
      return undefined;
    }
    const body = request.body as { username?: string; password?: string; role?: "admin" | "user" };
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || !password) {
      return reply.code(400).send({ error: { message: "Username and password are required" } });
    }
    try {
      return {
        user: db.createUser({
          username,
          password,
          role: body.role === "admin" ? "admin" : "user",
          mustChangePassword: true
        })
      };
    } catch {
      return reply.code(400).send({ error: { message: `User already exists: ${username}` } });
    }
  });

  app.get("/api/projects", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return undefined;
    }
    return { projects: db.listProjectsForUser(user) };
  });

  app.post("/api/projects", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return undefined;
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ error: { message: "Only admins can create projects" } });
    }
    const body = request.body as { name?: string; description?: string };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return reply.code(400).send({ error: { message: "Project name is required" } });
    }
    return { project: db.createProject({ name, description: String(body.description ?? ""), createdBy: user.id }) };
  });

  app.patch("/api/projects/:projectId", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return undefined;
    }
    const { projectId } = request.params as { projectId: string };
    if (user.role !== "admin") {
      return reply.code(403).send({ error: { message: "Only admins can update projects" } });
    }
    const body = request.body as { name?: string; description?: string };
    const project = db.updateProject(projectId, body);
    return project ? { project } : reply.code(404).send({ error: { message: "Project not found" } });
  });

  app.delete("/api/projects/:projectId", async (request, reply) => {
    const user = await requireUser(request, reply, db);
    if (!user) {
      return undefined;
    }
    if (user.role !== "admin") {
      return reply.code(403).send({ error: { message: "Only admins can delete projects" } });
    }
    const { projectId } = request.params as { projectId: string };
    db.deleteProject(projectId);
    return { ok: true };
  });

  app.post("/api/projects/:projectId/members", async (request, reply) => {
    const user = await requireAdmin(request, reply, db);
    if (!user) {
      return undefined;
    }
    const { projectId } = request.params as { projectId: string };
    if (!db.getProject(projectId)) {
      return reply.code(404).send({ error: { message: "Project not found" } });
    }
    const body = request.body as { userId?: string; role?: "admin" | "viewer" };
    const userId = String(body.userId ?? "");
    const targetUser = db.listUsers().find((candidate) => candidate.id === userId);
    if (!targetUser) {
      return reply.code(404).send({ error: { message: "User not found" } });
    }
    db.addProjectMember(projectId, targetUser.id, body.role === "admin" ? "admin" : "viewer");
    return { ok: true };
  });

  app.get("/api/projects/:projectId/imports", async (request, reply) => {
    const context = await requireProjectAccess(request, reply, db);
    if (!context) {
      return undefined;
    }
    return { imports: db.listImports(context.projectId) };
  });

  app.get("/api/projects/:projectId/imports/:importId", async (request, reply) => {
    const context = await requireProjectAccess(request, reply, db);
    if (!context) {
      return undefined;
    }
    const { importId } = request.params as { importId: string };
    const importRecord = db.getImport(importId);
    if (!importRecord || importRecord.projectId !== context.projectId) {
      return reply.code(404).send({ error: { message: "Import not found" } });
    }
    const artifacts = db.listArtifacts(importId);
    const positionedGraphArtifact = artifacts.find((artifact) => artifact.kind === "positioned_graph");
    const positionedGraph = positionedGraphArtifact && existsSync(positionedGraphArtifact.filePath)
      ? JSON.parse(await readFile(positionedGraphArtifact.filePath, "utf8"))
      : undefined;
    return { import: importRecord, artifacts, positionedGraph };
  });

  app.post("/api/projects/:projectId/imports", async (request, reply) => {
    const context = await requireProjectAccess(request, reply, db);
    if (!context) {
      return undefined;
    }
    const importId = randomUUID();
    const importDir = join(dataRoot, "projects", context.projectId, "imports", importId);
    await mkdir(importDir, { recursive: true });
    const files = await saveUploadParts(request, importDir);
    if (!files.interfaceTable) {
      return reply.code(400).send({ error: { message: "interfaceTable is required" } });
    }
    let importRecord = db.createImport({
      id: importId,
      projectId: context.projectId,
      uploadedBy: context.user.id,
      sourceFileName: files.interfaceTable.originalName
    });
    try {
      const summary = await runPipeline({
        inputPath: files.interfaceTable.path,
        routesPath: files.routesTable?.path,
        componentsPath: files.componentsTable?.path,
        rulesPath: files.rulesJson?.path,
        outDir: importDir
      });
      importRecord = db.completeImport({
        id: importRecord.id,
        rowCount: summary.rowCount,
        logicalCableCount: summary.logicalCableCount,
        routeSegmentCount: summary.routeSegmentCount
      });
      const artifacts = await recordArtifacts(db, importRecord.id, importDir, files);
      const positionedGraph = JSON.parse(await readFile(join(importDir, "positioned-graph.json"), "utf8"));
      return { import: importRecord, artifacts, positionedGraph };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      importRecord = db.failImport(importRecord.id, message);
      return reply.code(400).send({ import: importRecord, error: { message } });
    }
  });

  app.get("/api/projects/:projectId/imports/:importId/artifacts/:artifactName", async (request, reply) => {
    const context = await requireProjectAccess(request, reply, db);
    if (!context) {
      return undefined;
    }
    const { importId, artifactName } = request.params as { importId: string; artifactName: string };
    const importRecord = db.getImport(importId);
    if (!importRecord || importRecord.projectId !== context.projectId) {
      return reply.code(404).send({ error: { message: "Import not found" } });
    }
    const artifact = db.findArtifact(importId, artifactName);
    if (!artifact || !existsSync(artifact.filePath)) {
      return reply.code(404).send({ error: { message: "Artifact not found" } });
    }
    reply.header("content-disposition", `attachment; filename="${artifact.fileName}"`);
    reply.type(contentTypeFor(artifact.fileName));
    return reply.send(await readFile(artifact.filePath));
  });

  return app;
}

async function requireUser(request: FastifyRequest, reply: FastifyReply, db: NetDrawDatabase): Promise<UserRecord | undefined> {
  const user = db.getSessionUser(request.cookies.netdraw_session);
  if (!user) {
    reply.code(401).send({ error: { message: "Authentication required" } });
    return undefined;
  }
  return user;
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply, db: NetDrawDatabase): Promise<UserRecord | undefined> {
  const user = await requireUser(request, reply, db);
  if (!user) {
    return undefined;
  }
  if (user.role !== "admin") {
    reply.code(403).send({ error: { message: "Admin role required" } });
    return undefined;
  }
  return user;
}

async function requireProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  db: NetDrawDatabase
): Promise<{ user: UserRecord; projectId: string } | undefined> {
  const user = await requireUser(request, reply, db);
  if (!user) {
    return undefined;
  }
  const { projectId } = request.params as { projectId: string };
  if (!db.getProject(projectId)) {
    reply.code(404).send({ error: { message: "Project not found" } });
    return undefined;
  }
  if (!db.userCanAccessProject(user, projectId)) {
    reply.code(403).send({ error: { message: "Project access denied" } });
    return undefined;
  }
  return { user, projectId };
}

async function saveUploadParts(request: FastifyRequest, importDir: string): Promise<UploadFiles> {
  const files: UploadFiles = {};
  for await (const part of request.parts()) {
    if (part.type !== "file") {
      continue;
    }
    const fieldName = part.fieldname as keyof UploadFiles;
    if (!["interfaceTable", "routesTable", "componentsTable", "rulesJson"].includes(fieldName)) {
      continue;
    }
    const fileName = sanitizeFileName(part.filename || `${fieldName}.dat`);
    const filePath = join(importDir, `${fieldName}-${fileName}`);
    await writeFile(filePath, await part.toBuffer());
    files[fieldName] = {
      originalName: fileName,
      path: filePath
    };
  }
  return files;
}

async function recordArtifacts(db: NetDrawDatabase, importId: string, outDir: string, files: UploadFiles): Promise<ArtifactRecord[]> {
  const artifacts: ArtifactRecord[] = [];
  if (files.interfaceTable) {
    artifacts.push(db.createArtifact({ importId, kind: "source", fileName: files.interfaceTable.originalName, filePath: files.interfaceTable.path }));
  }
  for (const [fileName, kind] of Object.entries(artifactKinds)) {
    const filePath = join(outDir, fileName);
    if (existsSync(filePath)) {
      artifacts.push(db.createArtifact({ importId, kind, fileName, filePath }));
    }
  }
  return artifacts;
}

function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".json")) {
    return "application/json";
  }
  if (fileName.endsWith(".csv")) {
    return "text/csv; charset=utf-8";
  }
  if (fileName.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (fileName.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}
