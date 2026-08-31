import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installLocalAuditNetworkGuard } from "./local-audit";
import "./styles.css";

installLocalAuditNetworkGuard();

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
