import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mailMarkup, mountMail } from "../shared/mail.js";
const tick = () => new Promise((r) => setTimeout(r, 10));
function fixture(t, { messages = [], fail = false, preview = false } = {}) {
  const { window } = parseHTML(
    "<html><body>" + mailMarkup() + "</body></html>",
  );
  Object.assign(globalThis, {
    document: window.document,
    matchMedia: () => ({ matches: true }),
  });
  window.HTMLElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLElement.prototype.close = function () {
    this.open = false;
  };
  const requests = [];
  globalThis.fetch = async (path, opts = {}) => {
    requests.push({ path, ...opts });
    if (opts.method === "POST" && fail)
      return Response.json({ error: "Try again safely." }, { status: 503 });
    return Response.json(opts.method === "POST" ? { ok: true } : { messages });
  };
  const root = document.body,
    form = root.querySelector("form");
  form.reset = () => {
    form.querySelectorAll("input,textarea").forEach((el) => (el.value = ""));
  };
  const controller = mountMail(root, {}, { preview });
  t.after(() => controller.destroy());
  form.querySelector("#reply-body").value = "My private words";
  return { root, form, requests, window };
}
test("successful stationery submission seals after delivery and allows another letter", async (t) => {
  const { root, form, requests, window } = fixture(t);
  await tick();
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  const send = requests.find((r) => r.method === "POST");
  assert.equal(send.path, "/api/mail");
  assert.equal(JSON.parse(send.body).body, "My private words");
  assert.equal(form.hidden, true);
  assert.equal(root.querySelector(".reply-sent").hidden, false);
  root.querySelector("#write-again").click();
  assert.equal(form.hidden, false);
  assert.equal(root.querySelector("#reply-body").value, "");
});
test("failed delivery preserves text and stable reference for safe retry", async (t) => {
  const { root, form, requests, window } = fixture(t, { fail: true });
  await tick();
  for (let i = 0; i < 2; i++) {
    form.dispatchEvent(new window.Event("submit", { cancelable: true }));
    await tick();
  }
  assert.equal(form.hidden, false);
  assert.equal(root.querySelector("#reply-body").value, "My private words");
  assert.match(root.querySelector("#mail-status").textContent, /Try again/);
  const sends = requests.filter((r) => r.method === "POST");
  assert.equal(
    JSON.parse(sends[0].body).requestId,
    JSON.parse(sends[1].body).requestId,
  );
  assert.equal(form.querySelector("button").disabled, false);
});
test("returning reply unfolds safely and is marked read only after opening the seal", async (t) => {
  const id = crypto.randomUUID();
  const { root, requests } = fixture(t, {
    messages: [
      {
        id,
        direction: "admin",
        name: "With love",
        body: "<script>private</script>",
        created_at: new Date().toISOString(),
        read_at: null,
      },
    ],
  });
  await tick();
  assert.equal(root.querySelector("dialog").open, true);
  assert.equal(requests.filter((r) => r.method === "POST").length, 0);
  assert.equal(root.querySelector(".returned-note script"), null);
  root.querySelector(".return-envelope").click();
  await tick();
  assert.equal(root.querySelector(".return-reading").hidden, false);
  assert.equal(root.querySelector(".return-mail-trigger").hidden, true);
  assert.deepEqual(
    JSON.parse(requests.find((r) => r.path === "/api/mail/read").body).ids,
    [id],
  );
});
test("editor preview simulates sending without network delivery", async (t) => {
  const { root, form, requests, window } = fixture(t, { preview: true });
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(requests.length, 0);
  assert.match(root.querySelector("#mail-status").textContent, /Preview only/);
});
test("full-motion delivery triggers paper folding, envelope sealing, flight, and completion", async (t) => {
  const { root, form, window } = fixture(t, { preview: true });
  globalThis.matchMedia = () => ({ matches: false });
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(
    root.querySelector(".reply-workspace").classList.contains("mail-sending"),
    true,
  );
  assert.equal(form.hidden, false);
  assert.ok(root.querySelector(".send-envelope"));
  assert.ok(root.querySelector(".send-plane"));
  await new Promise((r) => setTimeout(r, 3120));
  assert.equal(form.hidden, true);
  assert.equal(
    root.querySelector(".reply-workspace").classList.contains("mail-sending"),
    false,
  );
});
test("sent letters and received replies open separate views without marking replies read from sent history", async (t) => {
  const received = crypto.randomUUID();
  const { root, requests } = fixture(t, {
    messages: [
      {
        id: crypto.randomUUID(),
        direction: "visitor",
        name: "Me",
        body: "Only in my sent letters",
        created_at: new Date().toISOString(),
        read_at: null,
      },
      {
        id: received,
        direction: "admin",
        name: "You",
        body: "Only in my replies",
        created_at: new Date().toISOString(),
        read_at: null,
      },
    ],
  });
  await tick();
  root.querySelector(".return-close").click();
  assert.equal(root.querySelector("#mail-sent").textContent, "My letters");
  assert.equal(root.querySelector("#mail-replies").textContent, "Replies");
  root.querySelector("#mail-sent").click();
  await tick();
  assert.equal(
    root.querySelector("dialog").getAttribute("aria-label"),
    "My letters",
  );
  assert.equal(root.querySelector(".return-reading").hidden, false);
  assert.equal(root.querySelector(".return-welcome").hidden, true);
  assert.equal(root.querySelectorAll(".returned-note").length, 1);
  assert.match(
    root.querySelector(".return-reading").textContent,
    /Only in my sent letters/,
  );
  assert.doesNotMatch(
    root.querySelector(".return-reading").textContent,
    /Only in my replies/,
  );
  assert.equal(requests.filter((r) => r.path === "/api/mail/read").length, 0);
  root.querySelector(".return-close").click();
  root.querySelector("#mail-replies").click();
  await tick();
  assert.equal(
    root.querySelector("dialog").getAttribute("aria-label"),
    "Replies",
  );
  assert.equal(root.querySelector(".return-reading").hidden, true);
  assert.equal(root.querySelectorAll(".returned-note").length, 1);
  root.querySelector(".return-envelope").click();
  await tick();
  assert.match(
    root.querySelector(".return-reading").textContent,
    /Only in my replies/,
  );
  assert.doesNotMatch(
    root.querySelector(".return-reading").textContent,
    /Only in my sent letters/,
  );
  assert.deepEqual(
    JSON.parse(requests.find((r) => r.path === "/api/mail/read").body).ids,
    [received],
  );
});
test("separate letter folders show relevant empty states", async (t) => {
  const { root } = fixture(t, { preview: true });
  root.querySelector("#mail-sent").click();
  await tick();
  assert.match(
    root.querySelector(".return-reading").textContent,
    /Your sent letters will be kept here/,
  );
  assert.equal(root.querySelector(".return-reading").hidden, false);
  root.querySelector(".return-close").click();
  root.querySelector("#mail-replies").click();
  await tick();
  assert.match(
    root.querySelector(".return-reading").textContent,
    /No replies yet/,
  );
  assert.equal(root.querySelector(".return-welcome").hidden, true);
});
