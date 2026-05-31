/// <reference types="vite/client" />

declare module "cytoscape-elk" {
  import type cytoscape from "cytoscape";
  const elk: cytoscape.Ext;
  export default elk;
}
