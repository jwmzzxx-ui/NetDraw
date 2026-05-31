import { describe, expect, test } from "vitest";
import { parseRoutesCsv, resolveCableRoutes } from "../src/routing.js";
import type { InterfaceRow } from "../src/types.js";

const rows: InterfaceRow[] = [
  {
    rowId: "R001",
    srcDevice: "Device A",
    srcBoard: "Board A",
    srcPort: "P1",
    dstDevice: "Device B",
    dstBoard: "Board B",
    dstPort: "P2",
    netType: "COMM",
    medium: "ethernet",
    cableId: "C-001",
    routeHint: "SPL_A>CAB_3"
  }
];

describe("routing", () => {
  test("parses route resource CSV edges", () => {
    const routes = parseRoutesCsv("from_route_node,to_route_node,cost,zone,from_x,from_y,to_x,to_y\nSPL_A,PDU_1,2,CAB_A,0,0,10,0\n");

    expect(routes).toEqual([
      {
        fromRouteNode: "SPL_A",
        toRouteNode: "PDU_1",
        cost: 2,
        zone: "CAB_A",
        fromPosition: { x: 0, y: 0 },
        toPosition: { x: 10, y: 0 }
      }
    ]);
  });

  test("fills missing routeHint hops with the shortest route resource path", () => {
    const routeResources = parseRoutesCsv(
      [
        "from_route_node,to_route_node,cost",
        "SPL_A,PDU_1,1",
        "PDU_1,CAB_3,1",
        "SPL_A,CAB_3,5"
      ].join("\n")
    );

    const [route] = resolveCableRoutes(rows, routeResources);

    expect(route).toEqual({
      cableId: "C-001",
      algorithm: "dijkstra",
      routeNodes: ["SPL_A", "PDU_1", "CAB_3"],
      routeSegments: [
        { source: "SPL_A", target: "PDU_1", cost: 1 },
        { source: "PDU_1", target: "CAB_3", cost: 1 }
      ],
      routeString: "SPL_A>PDU_1>CAB_3"
    });
  });

  test("uses A* when route resources include coordinates and preferAStar is enabled", () => {
    const routeResources = parseRoutesCsv(
      [
        "from_route_node,to_route_node,cost,from_x,from_y,to_x,to_y",
        "SPL_A,PDU_1,5,0,0,5,0",
        "PDU_1,CAB_3,5,5,0,10,0",
        "SPL_A,CAB_3,30,0,0,10,0"
      ].join("\n")
    );

    const [route] = resolveCableRoutes(rows, routeResources, { preferAStar: true });

    expect(route.algorithm).toBe("astar");
    expect(route.routeNodes).toEqual(["SPL_A", "PDU_1", "CAB_3"]);
  });

  test("falls back to Dijkstra when A* is requested without complete route coordinates", () => {
    const routeResources = parseRoutesCsv(
      [
        "from_route_node,to_route_node,cost",
        "SPL_A,PDU_1,1",
        "PDU_1,CAB_3,1"
      ].join("\n")
    );

    const [route] = resolveCableRoutes(rows, routeResources, { preferAStar: true });

    expect(route.algorithm).toBe("dijkstra");
    expect(route.routeNodes).toEqual(["SPL_A", "PDU_1", "CAB_3"]);
  });

  test("throws a blocking error when route resources cannot connect hint anchors", () => {
    const routeResources = parseRoutesCsv("from_route_node,to_route_node,cost\nSPL_A,PDU_1,1\n");

    expect(() => resolveCableRoutes(rows, routeResources)).toThrow(/No route path from SPL_A to CAB_3/);
  });
});
