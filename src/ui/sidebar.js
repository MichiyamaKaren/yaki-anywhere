import { byId as $ } from "../lib/dom.js";

export function createSidebar() {
  const sidebar = $("appSidebar"),
    content = $("workspaceContent");
  const trigger = $("openSidebar"),
    backdrop = $("sidebarBackdrop");
  const mobile = window.matchMedia("(max-width: 820px)");
  let open = false,
    wasInert = false;

  function close({ restoreFocus = true } = {}) {
    if (!open) return;
    open = false;
    content.inert = wasInert;
    if (restoreFocus && mobile.matches) trigger.focus({ preventScroll: true });
    sidebar.classList.remove("is-open");
    sidebar.inert = mobile.matches;
    if (mobile.matches) sidebar.setAttribute("aria-hidden", "true");
    sidebar.removeAttribute("role");
    sidebar.removeAttribute("aria-modal");
    trigger.setAttribute("aria-expanded", "false");
    backdrop.hidden = true;
    document.documentElement.classList.remove("navigation-open");
  }
  function syncLayout() {
    close({ restoreFocus: false });
    sidebar.inert = mobile.matches;
    if (mobile.matches) sidebar.setAttribute("aria-hidden", "true");
    else sidebar.removeAttribute("aria-hidden");
  }
  trigger.onclick = () => {
    if (!mobile.matches || open) return;
    open = true;
    wasInert = content.inert;
    content.inert = true;
    sidebar.inert = false;
    sidebar.removeAttribute("aria-hidden");
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.classList.add("is-open");
    backdrop.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("navigation-open");
    $("closeSidebar").focus({ preventScroll: true });
  };
  $("closeSidebar").onclick = backdrop.onclick = () => close();
  sidebar
    .querySelectorAll("a[href]")
    .forEach((link) => link.addEventListener("click", () => close()));
  // Close before the guide opens its own modal, without taking its focus back.
  $("help").addEventListener("click", () => close({ restoreFocus: false }), {
    capture: true,
  });
  sidebar.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [
      ...sidebar.querySelectorAll("a[href], button:not(:disabled)"),
    ].filter((node) => node.getClientRects().length);
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  mobile.addEventListener("change", syncLayout);
  syncLayout();
  return { close, isOpen: () => open };
}
