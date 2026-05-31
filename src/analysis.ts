import type {
  AnalysisIssue,
  AnalysisReport,
  CanonicalGraph,
  GraphEdge,
  ParallelEdgeGroup,
  RedundancyGroupReport
} from "./types.js";

export function analyzeGraph(graph: CanonicalGraph): AnalysisReport {
  const logicalEdges = graph.edges.filter((edge) => edge.type === "logical-cable");
  const issues: AnalysisIssue[] = [];
  const stronglyConnectedComponents = findStronglyConnectedComponents(logicalEdges);
  const parallelEdgeGroups = findParallelEdgeGroups(logicalEdges);
  const redundancyGroups = analyzeRedundancyGroups(logicalEdges);

  for (const component of stronglyConnectedComponents) {
    issues.push({
      code: "DIRECTED_CYCLE",
      severity: "warning",
      message: `Directed cycle detected across ${component.length} port nodes.`,
      edgeIds: logicalEdges
        .filter((edge) => component.includes(edge.source) && component.includes(edge.target))
        .map((edge) => edge.id)
    });
  }

  for (const group of parallelEdgeGroups) {
    issues.push({
      code: "PARALLEL_EDGES",
      severity: "info",
      message: `Parallel logical cables share ${group.source} -> ${group.target}.`,
      edgeIds: group.edgeIds
    });
  }

  for (const group of redundancyGroups) {
    if (group.edgeIds.length < 2) {
      issues.push({
        code: "REDUNDANCY_GROUP_SINGLE_MEMBER",
        severity: "warning",
        message: `Redundancy group ${group.groupId} has only one logical cable.`,
        groupId: group.groupId,
        edgeIds: group.edgeIds
      });
    }

    if (group.netTypes.length > 1) {
      issues.push({
        code: "REDUNDANCY_GROUP_MIXED_NET_TYPES",
        severity: "warning",
        message: `Redundancy group ${group.groupId} mixes network types: ${group.netTypes.join(", ")}.`,
        groupId: group.groupId,
        edgeIds: group.edgeIds
      });
    }
  }

  issues.push(...findIsolatedPortIssues(graph));
  issues.push(...findUndefinedRouteNodeIssues(graph));

  return {
    issues,
    stronglyConnectedComponents,
    parallelEdgeGroups,
    redundancyGroups,
    visualSuggestions: {
      summaryEdgeIds: parallelEdgeGroups.map((group) => `summary:${group.source}->${group.target}`),
      detailEdgeIds: logicalEdges.map((edge) => edge.id)
    }
  };
}

export function renderAnalysisMarkdown(report: AnalysisReport): string {
  const lines = [
    "# NetDraw Analysis Report",
    "",
    "## Summary",
    "",
    `- Issues: ${report.issues.length}`,
    `- Strongly connected components: ${report.stronglyConnectedComponents.length}`,
    `- Parallel edge groups: ${report.parallelEdgeGroups.length}`,
    `- Redundancy groups: ${report.redundancyGroups.length}`,
    "",
    "## Issues",
    ""
  ];

  if (report.issues.length === 0) {
    lines.push("- No issues found.");
  } else {
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }

  lines.push("", "## Visual Suggestions", "");
  lines.push(`- Summary edges: ${report.visualSuggestions.summaryEdgeIds.length}`);
  for (const edgeId of report.visualSuggestions.summaryEdgeIds) {
    lines.push(`  - ${edgeId}`);
  }
  lines.push(`- Detail edges: ${report.visualSuggestions.detailEdgeIds.length}`);

  return `${lines.join("\n")}\n`;
}

function findStronglyConnectedComponents(logicalEdges: GraphEdge[]): string[][] {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const edge of logicalEdges) {
    nodes.add(edge.source);
    nodes.add(edge.target);
    const neighbors = adjacency.get(edge.source) ?? [];
    neighbors.push(edge.target);
    adjacency.set(edge.source, neighbors);
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!indices.has(neighbor)) {
        visit(neighbor);
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, lowLinks.get(neighbor) ?? 0));
      } else if (onStack.has(neighbor)) {
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, indices.get(neighbor) ?? 0));
      }
    }

    if (lowLinks.get(node) === indices.get(node)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (!current) {
          break;
        }
        onStack.delete(current);
        component.push(current);
      } while (current !== node);

      const hasSelfLoop = component.length === 1 && logicalEdges.some((edge) => edge.source === node && edge.target === node);
      if (component.length > 1 || hasSelfLoop) {
        components.push(component.sort());
      }
    }
  };

  for (const node of Array.from(nodes).sort()) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return components;
}

function findParallelEdgeGroups(logicalEdges: GraphEdge[]): ParallelEdgeGroup[] {
  const groups = new Map<string, ParallelEdgeGroup>();

  for (const edge of logicalEdges) {
    const key = `${edge.source}\u0000${edge.target}`;
    const group = groups.get(key) ?? { source: edge.source, target: edge.target, edgeIds: [] };
    group.edgeIds.push(edge.id);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .filter((group) => group.edgeIds.length > 1)
    .map((group) => ({ ...group, edgeIds: group.edgeIds.sort() }))
    .sort((a, b) => `${a.source}->${a.target}`.localeCompare(`${b.source}->${b.target}`));
}

function analyzeRedundancyGroups(logicalEdges: GraphEdge[]): RedundancyGroupReport[] {
  const groups = new Map<string, RedundancyGroupReport>();

  for (const edge of logicalEdges) {
    const groupId = edge.sourceRow.redundancyGroup?.trim();
    if (!groupId) {
      continue;
    }

    const group = groups.get(groupId) ?? { groupId, edgeIds: [], netTypes: [] };
    group.edgeIds.push(edge.id);
    if (!group.netTypes.includes(edge.netType)) {
      group.netTypes.push(edge.netType);
    }
    groups.set(groupId, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      groupId: group.groupId,
      edgeIds: group.edgeIds.sort(),
      netTypes: group.netTypes.sort()
    }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId));
}

function findIsolatedPortIssues(graph: CanonicalGraph): AnalysisIssue[] {
  const connectedNodeIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  return graph.nodes
    .filter((node) => node.type === "port" && !connectedNodeIds.has(node.id))
    .map((node) => ({
      code: "ISOLATED_PORT" as const,
      severity: "info" as const,
      nodeId: node.id,
      message: `Port node ${node.id} is not connected to any edge.`
    }));
}

function findUndefinedRouteNodeIssues(graph: CanonicalGraph): AnalysisIssue[] {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const missing = new Map<string, string[]>();

  for (const edge of graph.edges.filter((candidate) => candidate.type === "route-segment")) {
    for (const nodeId of [edge.source, edge.target]) {
      if (nodeId.startsWith("route:") && !nodeIds.has(nodeId)) {
        const edgeIds = missing.get(nodeId) ?? [];
        edgeIds.push(edge.id);
        missing.set(nodeId, edgeIds);
      }
    }
  }

  return Array.from(missing.entries()).map(([nodeId, edgeIds]) => ({
    code: "UNDEFINED_ROUTE_NODE" as const,
    severity: "error" as const,
    nodeId,
    edgeIds: edgeIds.sort(),
    message: `Route node ${nodeId} is referenced by route segments but is not defined.`
  }));
}
