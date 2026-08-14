import React from "react";
import { createRoot } from "react-dom/client";
import ProjectDashboard from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ProjectDashboard />
  </React.StrictMode>
);
