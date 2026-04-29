import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const CLEAN_PUBLIC_HASH_ROUTES = ["/demo/cat4-analysis"];

if (typeof window !== "undefined") {
  const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const rawHash = window.location.hash || "";
  const matchingPublicPath = CLEAN_PUBLIC_HASH_ROUTES.find(
    (path) => rawPath === path || rawPath.startsWith(`${path}/`)
  );

  if (matchingPublicPath && !rawHash.startsWith("#/")) {
    const nextHashPath = `${rawPath}${window.location.search || ""}`;
    window.history.replaceState(null, "", `/#${nextHashPath}`);
  }
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
<HashRouter>
  <App />
</HashRouter>
);
