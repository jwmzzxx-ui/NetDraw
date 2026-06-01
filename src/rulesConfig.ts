import { readFile } from "node:fs/promises";
import { mergeDisplayRules } from "./displayRules.js";
import { DEFAULT_LAYOUT_RULES } from "./layout.js";
import { DEFAULT_STYLE_RULES, type StyleRules } from "./styleRules.js";
import type { DisplayRules, ExportConfig, LayoutRules } from "./types.js";
import type { NormalizationAliases } from "./normalizer.js";
import type { ResolveCableRouteOptions } from "./routing.js";

export interface ProjectRulesInput {
  layout?: Partial<LayoutRules>;
  display?: Partial<DisplayRules>;
  style?: PartialStyleRules;
  export?: ExportConfig;
  normalization?: {
    aliases?: NormalizationAliases;
  };
  routing?: ResolveCableRouteOptions;
}

export interface ProjectRules {
  layout: LayoutRules;
  display: DisplayRules;
  style: StyleRules;
  export: ExportConfig;
  normalization: {
    aliases: NormalizationAliases;
  };
  routing: ResolveCableRouteOptions;
}

type PartialStyleRules = {
  nodes?: Partial<StyleRules["nodes"]>;
  netTypes?: {
    [K in keyof StyleRules["netTypes"]]?: Partial<StyleRules["netTypes"][K]>;
  };
  routeSegment?: Partial<StyleRules["routeSegment"]>;
  label?: Partial<StyleRules["label"]>;
};

export async function loadProjectRules(filePath: string): Promise<ProjectRulesInput> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as ProjectRulesInput;
}

export function mergeProjectRules(input: ProjectRulesInput = {}): ProjectRules {
  return {
    layout: {
      ...DEFAULT_LAYOUT_RULES,
      ...input.layout,
      overridePositions: {
        ...DEFAULT_LAYOUT_RULES.overridePositions,
        ...input.layout?.overridePositions
      },
      edgeBendPoints: {
        ...DEFAULT_LAYOUT_RULES.edgeBendPoints,
        ...input.layout?.edgeBendPoints
      },
      nodeLayers: {
        ...DEFAULT_LAYOUT_RULES.nodeLayers,
        ...input.layout?.nodeLayers
      }
    },
    display: mergeDisplayRules(input.display),
    style: mergeStyleRules(input.style),
    export: {
      ...input.export
    },
    normalization: {
      aliases: {
        global: {
          ...input.normalization?.aliases?.global
        },
        components: {
          ...input.normalization?.aliases?.components
        },
        devices: {
          ...input.normalization?.aliases?.devices
        },
        boards: {
          ...input.normalization?.aliases?.boards
        },
        ports: {
          ...input.normalization?.aliases?.ports
        }
      }
    },
    routing: {
      ...input.routing
    }
  };
}

function mergeStyleRules(input: PartialStyleRules = {}): StyleRules {
  return {
    nodes: {
      base: { ...DEFAULT_STYLE_RULES.nodes.base, ...input.nodes?.base },
      component: { ...DEFAULT_STYLE_RULES.nodes.component, ...input.nodes?.component },
      device: { ...DEFAULT_STYLE_RULES.nodes.device!, ...input.nodes?.device },
      board: { ...DEFAULT_STYLE_RULES.nodes.board!, ...input.nodes?.board },
      port: { ...DEFAULT_STYLE_RULES.nodes.port!, ...input.nodes?.port },
      "route-node": { ...DEFAULT_STYLE_RULES.nodes["route-node"], ...input.nodes?.["route-node"] }
    },
    netTypes: {
      AC: { ...DEFAULT_STYLE_RULES.netTypes.AC, ...input.netTypes?.AC },
      DC: { ...DEFAULT_STYLE_RULES.netTypes.DC, ...input.netTypes?.DC },
      COMM: { ...DEFAULT_STYLE_RULES.netTypes.COMM, ...input.netTypes?.COMM },
      SIGNAL: { ...DEFAULT_STYLE_RULES.netTypes.SIGNAL, ...input.netTypes?.SIGNAL },
      SAFETY: { ...DEFAULT_STYLE_RULES.netTypes.SAFETY, ...input.netTypes?.SAFETY }
    },
    routeSegment: {
      ...DEFAULT_STYLE_RULES.routeSegment,
      ...input.routeSegment
    },
    label: {
      ...DEFAULT_STYLE_RULES.label,
      ...input.label
    }
  };
}
