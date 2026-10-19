import { render, esc } from "/render.js";
const root = document.querySelector("#app");
async function load() {
  try {
    const response = await fetch("/api/content", { cache: "no-store" }),
      data = await response.json();
    if (data.locked) {
      gate();
      return;
    }
    if (data.maintenance) {
      root.innerHTML = `<div class="gate"><span class="brand">LoveLetta ❧</span><h1>A little love<br>is still growing.</h1><p>${esc(data.message)}</p></div>`;
      return;
    }
    if (!response.ok)
      throw Error(data.error || "The letter could not be loaded.");
    render(data.config);
  } catch (e) {
    root.innerHTML = `<div class="gate"><span class="brand">LoveLetta</span><h1>A moment, my love.</h1><p>${esc(e.message)}</p><button class="primary" id="retry">Try again</button></div>`;
    document.querySelector("#retry").onclick = load;
  }
}
function gate() {
  root.innerHTML =
    '<div class="gate"><span class="brand">LoveLetta ❧</span><h1>A garden,<br>just for us.</h1><p>This little corner of the world has a key.</p><form id="unlock"><label for="password">Your secret password</label><input id="password" type="password" required autocomplete="current-password"><button class="primary">Open the garden</button><p id="error" role="alert"></p></form></div>';
  document.querySelector("#unlock").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Loveletta-Request": "1",
        },
        body: JSON.stringify({
          password: document.querySelector("#password").value,
        }),
      });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      await load();
    } catch (err) {
      document.querySelector("#error").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
load();
