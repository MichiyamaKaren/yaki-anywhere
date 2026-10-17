import { byId as $ } from "../lib/dom.js";
import { createSidebar } from "./sidebar.js";

// Hash routes keep an open editor in memory while giving each page its own URL and history.
export function createPageNavigation({ onProjects = () => {} } = {}) {
  const sidebar = createSidebar();
  let page = null;
  const scroll = { workspace: 0, projects: 0 };
  function render() {
    sidebar.close();
    const next =
      window.location.hash === "#/projects" ? "projects" : "workspace";
    if (page === next) return;
    if (page) scroll[page] = window.scrollY;
    page = next;
    const projects = page === "projects";
    $("projectsPage").hidden = !projects;
    $("editorPage").hidden = projects;
    $("saveProject").hidden = $("saved").hidden = projects;
    $("workspace").classList.toggle("active", !projects);
    $("manageProjects").classList.toggle("active", projects);
    $(projects ? "manageProjects" : "workspace").setAttribute(
      "aria-current",
      "page",
    );
    $(projects ? "workspace" : "manageProjects").removeAttribute(
      "aria-current",
    );
    $("pageBreadcrumb").textContent = projects ? "项目管理" : "字幕工作台";
    document.title = `Yaki Anywhere · ${projects ? "项目管理" : "字幕工作台"}`;
    window.scrollTo({ top: scroll[page], behavior: "instant" });
    if (projects) onProjects();
  }
  function navigate(target) {
    const hash = target === "projects" ? "#/projects" : "#/workspace";
    if (window.location.hash !== hash) window.location.hash = hash;
    render();
  }
  const showWorkspace = () => navigate("workspace");
  $("backToWorkspace").onclick = showWorkspace;
  window.addEventListener("hashchange", render);
  render();
  return {
    showWorkspace,
    isProjects: () => page === "projects",
    isMenuOpen: sidebar.isOpen,
  };
}
