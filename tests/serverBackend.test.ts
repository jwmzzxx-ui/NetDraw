import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { buildServer } from "../server/app.js";
import { createNetDrawDatabase } from "../server/database.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("NetDraw backend", () => {
  test("initializes the schema and creates the default admin only once", async () => {
    const root = await makeTempRoot();
    const dbPath = join(root, "netdraw.sqlite");

    const first = createNetDrawDatabase({ dbPath });
    first.close();
    const second = createNetDrawDatabase({ dbPath });

    expect(second.listUsers()).toEqual([
      expect.objectContaining({
        username: "admin",
        role: "admin",
        mustChangePassword: true
      })
    ]);
    second.close();
  });

  test("requires login for projects and blocks normal users from deleting projects", async () => {
    const root = await makeTempRoot();
    const app = await buildServer({ dbPath: join(root, "netdraw.sqlite"), dataRoot: join(root, "data") });

    const unauthenticated = await app.inject({ method: "GET", url: "/api/projects" });
    expect(unauthenticated.statusCode).toBe(401);

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "admin123" }
    });
    const adminCookie = readSessionCookie(adminLogin);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      cookies: adminCookie,
      payload: { name: "Line A", description: "Main control cabinet" }
    });
    expect(created.statusCode).toBe(200);
    const projectId = created.json().project.id;

    const createdUser = await app.inject({
      method: "POST",
      url: "/api/users",
      cookies: adminCookie,
      payload: { username: "operator", password: "operator123", role: "user" }
    });
    expect(createdUser.statusCode).toBe(200);
    const operatorId = createdUser.json().user.id;

    const addedMember = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/members`,
      cookies: adminCookie,
      payload: { userId: operatorId, role: "viewer" }
    });
    expect(addedMember.statusCode).toBe(200);

    const userLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "operator", password: "operator123" }
    });
    const userCookie = readSessionCookie(userLogin);
    const visibleProjects = await app.inject({
      method: "GET",
      url: "/api/projects",
      cookies: userCookie
    });
    expect(visibleProjects.statusCode).toBe(200);
    expect(visibleProjects.json().projects).toEqual([expect.objectContaining({ id: projectId })]);

    const denied = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}`,
      cookies: userCookie
    });
    expect(denied.statusCode).toBe(403);

    await app.close();
  });

  test("uploads an interface table, stores artifacts, and returns the positioned graph", async () => {
    const root = await makeTempRoot();
    const app = await buildServer({ dbPath: join(root, "netdraw.sqlite"), dataRoot: join(root, "data") });
    const cookies = await loginAsAdmin(app);
    const projectId = await createProject(app, cookies);
    const csv = await readFile("samples/interfaces.csv");

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/imports`,
      cookies,
      headers: multipartHeaders("boundary-success"),
      payload: singleMultipartBody("boundary-success", "interfaceTable", "interfaces.csv", "text/csv", csv)
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.import.status).toBe("completed");
    expect(body.import.rowCount).toBe(5);
    expect(body.positionedGraph.nodes.length).toBeGreaterThan(0);
    expect(body.artifacts.map((artifact: { kind: string }) => artifact.kind)).toEqual(
      expect.arrayContaining(["source", "positioned_graph", "cable_list_csv", "cable_list_xlsx", "graph_svg"])
    );

    const downloads = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/imports/${body.import.id}/artifacts/cable-list.csv`,
      cookies
    });
    expect(downloads.statusCode).toBe(200);
    expect(downloads.body).toContain("cable_id");

    await app.close();
  });

  test("records failed imports when pipeline validation rejects the table", async () => {
    const root = await makeTempRoot();
    const app = await buildServer({ dbPath: join(root, "netdraw.sqlite"), dataRoot: join(root, "data") });
    const cookies = await loginAsAdmin(app);
    const projectId = await createProject(app, cookies);
    const csv = await readFile("samples/interfaces-duplicate-row.csv");

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/imports`,
      cookies,
      headers: multipartHeaders("boundary-fail"),
      payload: singleMultipartBody("boundary-fail", "interfaceTable", "interfaces-duplicate-row.csv", "text/csv", csv)
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("Duplicate row id");

    const imports = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/imports`,
      cookies
    });
    expect(imports.json().imports).toEqual([
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining("Duplicate row id")
      })
    ]);

    await app.close();
  });

  test("uploads the generated 1200 row sample bundle with routes, components, and rules", async () => {
    const root = await makeTempRoot();
    const app = await buildServer({ dbPath: join(root, "netdraw.sqlite"), dataRoot: join(root, "data") });
    const cookies = await loginAsAdmin(app);
    const projectId = await createProject(app, cookies);
    const interfaceCsv = await readFile("samples/generated/main/interfaces-1200.csv");
    const routesCsv = await readFile("samples/generated/main/routes-1200.csv");
    const componentsCsv = await readFile("samples/generated/main/components-1200.csv");
    const rulesJson = await readFile("samples/generated/main/rules-1200.json");

    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/imports`,
      cookies,
      headers: multipartHeaders("boundary-generated"),
      payload: multipartBody("boundary-generated", [
        { fieldName: "interfaceTable", fileName: "interfaces-1200.csv", contentType: "text/csv", content: interfaceCsv },
        { fieldName: "routesTable", fileName: "routes-1200.csv", contentType: "text/csv", content: routesCsv },
        { fieldName: "componentsTable", fileName: "components-1200.csv", contentType: "text/csv", content: componentsCsv },
        { fieldName: "rulesJson", fileName: "rules-1200.json", contentType: "application/json", content: rulesJson }
      ])
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.import.status).toBe("completed");
    expect(body.import.rowCount).toBe(1200);
    expect(body.import.logicalCableCount).toBe(1200);
    expect(body.import.routeSegmentCount).toBeGreaterThan(1200);
    expect(body.positionedGraph.nodes.length).toBeGreaterThan(0);
    expect(body.positionedGraph.edges.filter((edge: { type: string }) => edge.type === "route-segment").length).toBeGreaterThan(0);

    await app.close();
  });
});

async function makeTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "netdraw-server-"));
  tempDirs.push(dir);
  return dir;
}

async function loginAsAdmin(app: Awaited<ReturnType<typeof buildServer>>) {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "admin123" }
  });
  expect(login.statusCode).toBe(200);
  return readSessionCookie(login);
}

async function createProject(app: Awaited<ReturnType<typeof buildServer>>, cookies: Record<string, string>): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/projects",
    cookies,
    payload: { name: "Line A", description: "Main control cabinet" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().project.id;
}

function readSessionCookie(response: { cookies: Array<{ name: string; value: string }> }): Record<string, string> {
  const cookie = response.cookies.find((candidate) => candidate.name === "netdraw_session");
  expect(cookie).toBeTruthy();
  return { netdraw_session: cookie?.value ?? "" };
}

function multipartHeaders(boundary: string): Record<string, string> {
  return { "content-type": `multipart/form-data; boundary=${boundary}` };
}

function singleMultipartBody(boundary: string, fieldName: string, fileName: string, contentType: string, content: Buffer): Buffer {
  return multipartBody(boundary, [{ fieldName, fileName, contentType, content }]);
}

function multipartBody(
  boundary: string,
  files: Array<{ fieldName: string; fileName: string; contentType: string; content: Buffer }>
): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(
      Buffer.from(
        [
          `--${boundary}`,
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"`,
          `Content-Type: ${file.contentType}`,
          "",
          ""
        ].join("\r\n")
      )
    );
    chunks.push(file.content);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}
