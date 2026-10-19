import { render } from "/render.js";
fetch("/api/admin/state", { cache: "no-store" })
  .then((r) => {
    if (!r.ok) throw Error("Sign in to preview.");
    return r.json();
  })
  .then((d) => render(d.config, { preview: true, open: true }))
  .catch((e) => (document.querySelector("#app").textContent = e.message));
window.addEventListener("message", (e) => {
  if (
    e.origin !== location.origin ||
    e.source !== parent ||
    e.data?.type !== "LOVELETTA_PREVIEW"
  )
    return;
  render(e.data.config, { preview: true, open: true });
});
