import { mailDefaults } from "./validation.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mailMarkup(settings = {}) {
  const c = { ...mailDefaults, ...settings };
  if (!c.enabled) return "";
  return `<span class="chapter">A letter, in return</span><h2 class="section-title">${escape(c.title)}</h2><p class="section-subtitle">${escape(c.subtitle)}</p><div class="reply-workspace"><form class="reply-paper" id="visitor-letter"><p class="reply-greeting">${escape(c.greeting)}</p><label class="sr-only" for="reply-name">Your name (optional)</label><input id="reply-name" name="name" maxlength="80" placeholder="Your name, if you like…" autocomplete="nickname"><label class="sr-only" for="reply-body">Your letter</label><textarea id="reply-body" name="body" required maxlength="5000" rows="9" placeholder="There is something I wanted to tell you…"></textarea><label class="mail-honeypot" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label><div class="reply-paper-footer"><span>A little piece of your heart.</span><button class="primary" type="submit">${escape(c.button)} <span aria-hidden="true">↗</span></button></div></form><div class="mail-send-scene" aria-hidden="true"><div class="send-envelope"><i></i><span>with love</span></div><svg class="send-plane" viewBox="0 0 140 100"><path d="M5 45L135 5 80 94 61 60Z" fill="#f4d5dd" stroke="#a94361" stroke-width="2"/><path d="M5 45L61 60 135 5M61 60L51 88 73 75" fill="#fffaf4" stroke="#a94361" stroke-width="2"/></svg><span class="flight-trail"></span></div><div class="reply-sent" hidden><span aria-hidden="true">❧</span><h3>Sealed with love.</h3><p>${escape(c.success)}</p><button class="text-button" id="write-again">Write another letter</button></div></div><p class="mail-status" id="mail-status" role="status"></p><p class="reply-return-note">Replies will find you here, on this same browser.</p><button class="text-button" id="mail-history">My letters & replies</button>`;
}
export function mountMail(root, settings = {}, { preview = false } = {}) {
  const c = { ...mailDefaults, ...settings };
  if (!c.enabled) return { destroy() {} };
  let dead = false,
    ready = false,
    submitting = false,
    messages = [],
    poll,
    refreshing,
    requestId = crypto.randomUUID();
  const shown = new Set(),
    timers = new Set();
  function later(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!dead) void callback();
    }, delay);
    timers.add(timer);
    return timer;
  }
  const status = root.querySelector("#mail-status"),
    form = root.querySelector("#visitor-letter"),
    workspace = root.querySelector(".reply-workspace");
  const badge = document.createElement("button");
  badge.className = "return-mail-trigger";
  badge.type = "button";
  badge.hidden = true;
  badge.textContent = "A letter for you";
  root.append(badge);
  const dialog = document.createElement("dialog");
  dialog.className = "return-letter-dialog";
  dialog.setAttribute("aria-label", "Your returning love letters");
  root.append(dialog);
  const reduced = () =>
    !c.animation || matchMedia("(prefers-reduced-motion: reduce)").matches;
  async function request(path, options = {}) {
    const res = await fetch(path, {
      cache: "no-store",
      ...options,
      headers: {
        "X-Loveletta-Request": "1",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const data = await res.json();
    if (!res.ok)
      throw Error(
        data.error || "Your letter could not be delivered. Please try again.",
      );
    return data;
  }
  function unread() {
    return messages.filter((m) => m.direction === "admin" && !m.read_at);
  }
  function updateBadge() {
    const n = unread().length;
    badge.hidden = n === 0;
    badge.textContent = `A letter for you${n > 1 ? " · " + n : ""}`;
  }
  async function refresh(announce = true) {
    if (preview || dead) return;
    if (!refreshing)
      refreshing = request("/api/mail").finally(() => {
        refreshing = undefined;
      });
    const result = await refreshing;
    if (dead) return;
    messages = result.messages;
    ready = true;
    updateBadge();
    const fresh = unread().filter((m) => !shown.has(m.id));
    if (
      announce &&
      fresh.length &&
      !dialog.open &&
      document.visibilityState !== "hidden"
    ) {
      fresh.forEach((m) => shown.add(m.id));
      openLetters(true);
    }
  }
  function openLetters(incoming = false) {
    const snapshot = [...messages],
      newIds = snapshot
        .filter((m) => m.direction === "admin" && !m.read_at)
        .map((m) => m.id);
    dialog.innerHTML = `<button class="return-close" aria-label="Close letter">×</button><div class="return-welcome ${incoming && !reduced() ? "arriving" : ""}"><span class="chapter">A little love, coming home</span><h2>${escape(c.returnTitle)}</h2><button class="return-envelope" aria-label="Open your returning letter"><span class="return-flap"></span><span class="return-seal">L</span></button><p>Tap the seal to unfold your letter.</p></div><div class="return-reading" hidden><span class="tiny-flower" aria-hidden="true">❧</span>${snapshot.length ? snapshot.map((m) => `<article class="returned-note ${m.direction === "visitor" ? "your-note" : ""}"><small>${m.direction === "admin" ? "A LETTER FOR YOU" : "YOUR LETTER"} · ${escape(new Date(m.created_at).toLocaleDateString())}</small><h3>${escape(m.name)}</h3><p>${escape(m.body)}</p></article>`).join("") : '<p class="no-return-yet">Your letter box is waiting for its first little note.</p>'}</div>`;
    if (!dialog.open) dialog.showModal();
    const reading = dialog.querySelector(".return-reading");
    dialog
      .querySelector(".return-close")
      .addEventListener("click", () => dialog.close());
    dialog.querySelector(".return-envelope").addEventListener("click", () => {
      dialog.querySelector(".return-envelope").disabled = true;
      const welcome = dialog.querySelector(".return-welcome");
      welcome.classList.add("unfolding");
      later(
        async () => {
          if (dead) return;
          welcome.hidden = true;
          if (!welcome.isConnected || !dialog.open) return;
          reading.hidden = false;
          if (newIds.length && !preview) {
            try {
              await request("/api/mail/read", {
                method: "POST",
                body: JSON.stringify({ ids: newIds }),
              });
              messages = messages.map((m) =>
                newIds.includes(m.id)
                  ? { ...m, read_at: new Date().toISOString() }
                  : m,
              );
              updateBadge();
            } catch (error) {
              if (status) status.textContent = error.message;
            }
          }
        },
        reduced() ? 0 : 650,
      );
    });
  }
  const outside = (event) => {
    if (event.target === dialog) dialog.close();
  };
  dialog.addEventListener("click", outside);
  badge.addEventListener("click", () => openLetters(true));
  root.querySelector("#mail-history")?.addEventListener("click", async () => {
    try {
      if (!preview) await refresh(false);
      openLetters(false);
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
  const again = root.querySelector("#write-again");
  again?.addEventListener("click", () => {
    workspace.querySelector(".reply-sent").hidden = true;
    form.hidden = false;
    form.reset();
    requestId = crypto.randomUUID();
    status.textContent = "";
    form.querySelector("textarea").focus();
  });
  const onSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const text = form.querySelector("#reply-body").value.trim();
    if (!text) {
      status.textContent = "Write a little something before sending.";
      return;
    }
    submitting = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Sealing your letter…";
    try {
      if (!preview) {
        if (!ready) await refresh(false);
        await request("/api/mail", {
          method: "POST",
          body: JSON.stringify({
            requestId,
            name: form.querySelector("#reply-name").value,
            body: text,
            website: form.querySelector('[name="website"]').value,
          }),
        });
      }
      if (dead) return;
      workspace.classList.add("mail-sending");
      status.textContent = preview
        ? "Preview only — no message was sent."
        : "Your letter has been delivered.";
      later(
        () => {
          if (dead) return;
          workspace.classList.remove("mail-sending");
          form.hidden = true;
          workspace.querySelector(".reply-sent").hidden = false;
          button.disabled = false;
          submitting = false;
          requestId = crypto.randomUUID();
          if (!preview) void refresh(false).catch(() => {});
        },
        reduced() ? 0 : 3100,
      );
    } catch (error) {
      if (!dead) {
        status.textContent = error.message;
        button.disabled = false;
        submitting = false;
      }
    }
  };
  form?.addEventListener("submit", onSubmit);
  const visible = () => {
    if (document.visibilityState === "visible") void refresh().catch(() => {});
  };
  if (!preview) {
    void refresh().catch(() => {
      if (status)
        status.textContent =
          "You can still write your letter. We will reconnect when you send it.";
    });
    poll = setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh().catch(() => {});
    }, 45000);
    document.addEventListener("visibilitychange", visible);
  }
  return {
    destroy() {
      dead = true;
      clearInterval(poll);
      timers.forEach(clearTimeout);
      timers.clear();
      document.removeEventListener("visibilitychange", visible);
      form?.removeEventListener("submit", onSubmit);
      if (dialog.open) dialog.close();
      dialog.remove();
      badge.remove();
    },
  };
}
