import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

export type UserRole = "admin" | "user";
export type ProjectRole = "admin" | "viewer";
export type ImportStatus = "processing" | "completed" | "failed";

export interface UserRecord {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  projectId: string;
  uploadedBy: string;
  status: ImportStatus;
  sourceFileName: string;
  rowCount: number;
  logicalCableCount: number;
  routeSegmentCount: number;
  errorMessage?: string;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  importId: string;
  kind: string;
  fileName: string;
  filePath: string;
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: UserRole;
  mustChangePassword?: boolean;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  createdBy: string;
}

export interface CreateImportInput {
  id?: string;
  projectId: string;
  uploadedBy: string;
  sourceFileName: string;
}

export interface CompleteImportInput {
  id: string;
  rowCount: number;
  logicalCableCount: number;
  routeSegmentCount: number;
}

export interface CreateArtifactInput {
  importId: string;
  kind: string;
  fileName: string;
  filePath: string;
}

export interface NetDrawDatabase {
  readonly raw: Database.Database;
  close(): void;
  listUsers(): UserRecord[];
  createUser(input: CreateUserInput): UserRecord;
  verifyPassword(username: string, password: string): UserRecord | undefined;
  createSession(userId: string): string;
  deleteSession(token: string): void;
  getSessionUser(token: string | undefined): UserRecord | undefined;
  createProject(input: CreateProjectInput): ProjectRecord;
  listProjectsForUser(user: UserRecord): ProjectRecord[];
  getProject(projectId: string): ProjectRecord | undefined;
  updateProject(projectId: string, input: { name?: string; description?: string }): ProjectRecord | undefined;
  deleteProject(projectId: string): void;
  addProjectMember(projectId: string, userId: string, role: ProjectRole): void;
  userCanAccessProject(user: UserRecord, projectId: string): boolean;
  createImport(input: CreateImportInput): ImportRecord;
  completeImport(input: CompleteImportInput): ImportRecord;
  failImport(importId: string, message: string): ImportRecord;
  listImports(projectId: string): ImportRecord[];
  getImport(importId: string): ImportRecord | undefined;
  createArtifact(input: CreateArtifactInput): ArtifactRecord;
  listArtifacts(importId: string): ArtifactRecord[];
  findArtifact(importId: string, fileName: string): ArtifactRecord | undefined;
}

export interface CreateNetDrawDatabaseOptions {
  dbPath: string;
}

export function createNetDrawDatabase(options: CreateNetDrawDatabaseOptions): NetDrawDatabase {
  mkdirSync(dirname(options.dbPath), { recursive: true });
  const raw = new Database(options.dbPath);
  raw.pragma("foreign_keys = ON");
  initializeSchema(raw);
  ensureDefaultAdmin(raw);

  return {
    raw,
    close: () => raw.close(),
    listUsers: () => raw.prepare("SELECT * FROM users ORDER BY created_at ASC").all().map(mapUser),
    createUser: (input) => createUser(raw, input),
    verifyPassword: (username, password) => verifyPassword(raw, username, password),
    createSession: (userId) => createSession(raw, userId),
    deleteSession: (token) => {
      raw.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },
    getSessionUser: (token) => getSessionUser(raw, token),
    createProject: (input) => createProject(raw, input),
    listProjectsForUser: (user) => listProjectsForUser(raw, user),
    getProject: (projectId) => selectProject(raw, projectId),
    updateProject: (projectId, input) => updateProject(raw, projectId, input),
    deleteProject: (projectId) => {
      raw.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    },
    addProjectMember: (projectId, userId, role) => addProjectMember(raw, projectId, userId, role),
    userCanAccessProject: (user, projectId) => user.role === "admin" || hasProjectMembership(raw, user.id, projectId),
    createImport: (input) => createImport(raw, input),
    completeImport: (input) => completeImport(raw, input),
    failImport: (importId, message) => failImport(raw, importId, message),
    listImports: (projectId) => raw.prepare("SELECT * FROM imports WHERE project_id = ? ORDER BY created_at DESC").all(projectId).map(mapImport),
    getImport: (importId) => selectImport(raw, importId),
    createArtifact: (input) => createArtifact(raw, input),
    listArtifacts: (importId) => raw.prepare("SELECT * FROM artifacts WHERE import_id = ? ORDER BY created_at ASC").all(importId).map(mapArtifact),
    findArtifact: (importId, fileName) => {
      const row = raw.prepare("SELECT * FROM artifacts WHERE import_id = ? AND file_name = ?").get(importId, fileName);
      return row ? mapArtifact(row) : undefined;
    }
  };
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
      source_file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      logical_cable_count INTEGER NOT NULL DEFAULT 0,
      route_segment_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function ensureDefaultAdmin(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (count.count > 0) {
    return;
  }
  createUser(db, { username: "admin", password: "admin123", role: "admin", mustChangePassword: true });
}

function createUser(db: Database.Database, input: CreateUserInput): UserRecord {
  const now = timestamp();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role, must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.username, bcrypt.hashSync(input.password, 10), input.role, input.mustChangePassword ? 1 : 0, now, now);
  return selectUserById(db, id)!;
}

function verifyPassword(db: Database.Database, username: string, password: string): UserRecord | undefined {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as ({ password_hash: string } & Record<string, unknown>) | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return undefined;
  }
  return mapUser(row);
}

function createSession(db: Database.Database, userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = timestamp();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(token, userId, expiresAt, now);
  return token;
}

function getSessionUser(db: Database.Database, token: string | undefined): UserRecord | undefined {
  if (!token) {
    return undefined;
  }
  const row = db.prepare(
    `SELECT users.* FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`
  ).get(token, timestamp());
  return row ? mapUser(row) : undefined;
}

function createProject(db: Database.Database, input: CreateProjectInput): ProjectRecord {
  const now = timestamp();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO projects (id, name, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.name, input.description ?? "", input.createdBy, now, now);
  addProjectMember(db, id, input.createdBy, "admin");
  return selectProject(db, id)!;
}

function listProjectsForUser(db: Database.Database, user: UserRecord): ProjectRecord[] {
  if (user.role === "admin") {
    return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all().map(mapProject);
  }
  return db.prepare(
    `SELECT projects.* FROM projects
     JOIN project_members ON project_members.project_id = projects.id
     WHERE project_members.user_id = ?
     ORDER BY projects.created_at DESC`
  ).all(user.id).map(mapProject);
}

function updateProject(db: Database.Database, projectId: string, input: { name?: string; description?: string }): ProjectRecord | undefined {
  const current = selectProject(db, projectId);
  if (!current) {
    return undefined;
  }
  db.prepare("UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?").run(
    input.name ?? current.name,
    input.description ?? current.description,
    timestamp(),
    projectId
  );
  return selectProject(db, projectId);
}

function addProjectMember(db: Database.Database, projectId: string, userId: string, role: ProjectRole): void {
  db.prepare(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(projectId, userId, role);
}

function hasProjectMembership(db: Database.Database, userId: string, projectId: string): boolean {
  const row = db.prepare("SELECT 1 FROM project_members WHERE user_id = ? AND project_id = ?").get(userId, projectId);
  return Boolean(row);
}

function createImport(db: Database.Database, input: CreateImportInput): ImportRecord {
  const id = input.id ?? crypto.randomUUID();
  db.prepare(
    `INSERT INTO imports (id, project_id, uploaded_by, status, source_file_name, created_at)
     VALUES (?, ?, ?, 'processing', ?, ?)`
  ).run(id, input.projectId, input.uploadedBy, input.sourceFileName, timestamp());
  return selectImport(db, id)!;
}

function completeImport(db: Database.Database, input: CompleteImportInput): ImportRecord {
  db.prepare(
    `UPDATE imports
     SET status = 'completed', row_count = ?, logical_cable_count = ?, route_segment_count = ?, error_message = NULL
     WHERE id = ?`
  ).run(input.rowCount, input.logicalCableCount, input.routeSegmentCount, input.id);
  return selectImport(db, input.id)!;
}

function failImport(db: Database.Database, importId: string, message: string): ImportRecord {
  db.prepare("UPDATE imports SET status = 'failed', error_message = ? WHERE id = ?").run(message, importId);
  return selectImport(db, importId)!;
}

function createArtifact(db: Database.Database, input: CreateArtifactInput): ArtifactRecord {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO artifacts (id, import_id, kind, file_name, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, input.importId, input.kind, input.fileName, input.filePath, timestamp());
  return mapArtifact(db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id));
}

function selectUserById(db: Database.Database, id: string): UserRecord | undefined {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return row ? mapUser(row) : undefined;
}

function selectProject(db: Database.Database, id: string): ProjectRecord | undefined {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row ? mapProject(row) : undefined;
}

function selectImport(db: Database.Database, id: string): ImportRecord | undefined {
  const row = db.prepare("SELECT * FROM imports WHERE id = ?").get(id);
  return row ? mapImport(row) : undefined;
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProject(row: any): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapImport(row: any): ImportRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    uploadedBy: row.uploaded_by,
    status: row.status,
    sourceFileName: row.source_file_name,
    rowCount: row.row_count,
    logicalCableCount: row.logical_cable_count,
    routeSegmentCount: row.route_segment_count,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at
  };
}

function mapArtifact(row: any): ArtifactRecord {
  return {
    id: row.id,
    importId: row.import_id,
    kind: row.kind,
    fileName: row.file_name,
    filePath: row.file_path,
    createdAt: row.created_at
  };
}

function timestamp(): string {
  return new Date().toISOString();
}
