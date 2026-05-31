import React from "react";
import { createRoot } from "react-dom/client";
import { NetDrawApp } from "./NetDrawApp.js";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <React.StrictMode>
    <NetDrawApp />
  </React.StrictMode>
);
