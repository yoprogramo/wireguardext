const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function setup({ connected = false, running = false } = {}) {
  let state = { connected, proxyPort: connected ? 1080 : null, activeProfileId: connected ? "p" : null };
  let hostConnected = true;
  let listener;
  let notification;
  const icons = [];
  const native = {
    init() {},
    isConnected: () => hostConnected,
    isHostMissing: () => false,
    status: async () => ({ running, socksPort: running ? 1080 : null }),
    start: async () => { running = true; return { socksPort: 1080 }; },
    stop: async () => { running = false; },
    subscribe: (callback) => { notification = callback; },
  };
  const storage = {
    getState: async () => ({ ...state }),
    setState: async (patch) => { state = { ...state, ...patch }; },
    getProfile: async () => ({ name: "test" }),
  };
  const chrome = {
    action: { setIcon: async ({ path: paths }) => {
      for (const [size, url] of Object.entries(paths)) {
        assert.match(url, new RegExp(`^chrome-extension://test/icons/icon-${size}(-connected)?\\.png$`));
        assert.equal(fs.existsSync(path.join(__dirname, "../extension", url.replace("chrome-extension://test/", ""))), true);
      }
      icons.push(paths[16]);
    } },
    runtime: {
      getURL: (file) => `chrome-extension://test/${file}`,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onMessage: { addListener(callback) { listener = callback; } },
    },
  };
  const context = vm.createContext({ chrome, console, setTimeout: (callback) => queueMicrotask(callback) });
  const modules = {
    "../lib/storage.js": storage,
    "../lib/native.js": native,
    "../lib/proxy.js": { applyProxy: async () => {}, clearProxy: async () => {} },
  };
  const worker = new vm.SourceTextModule(
    fs.readFileSync(path.join(__dirname, "../extension/background/service-worker.js"), "utf8"),
    { context }
  );
  await worker.link((specifier) => {
    const exports = modules[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await worker.evaluate();
  await new Promise(setImmediate);
  return {
    icons,
    send: (command) => new Promise((resolve) => listener(command, {}, resolve)),
    disconnectHost: () => { hostConnected = false; notification({ type: "disconnected" }); },
  };
}

test("connection and disconnection update the icon", async () => {
  const worker = await setup();
  assert.equal(worker.icons.at(-1), "chrome-extension://test/icons/icon-16.png");
  assert.equal((await worker.send({ command: "connect", profileId: "p" })).ok, true);
  assert.equal(worker.icons.at(-1), "chrome-extension://test/icons/icon-16-connected.png");
  assert.equal((await worker.send({ command: "disconnect" })).ok, true);
  assert.equal(worker.icons.at(-1), "chrome-extension://test/icons/icon-16.png");
});

test("startup restores the icon only for a running tunnel", async () => {
  const active = await setup({ connected: true, running: true });
  assert.equal(active.icons.at(-1), "chrome-extension://test/icons/icon-16-connected.png");
  const stopped = await setup({ connected: true });
  assert.equal(stopped.icons.at(-1), "chrome-extension://test/icons/icon-16.png");
});

test("losing the native host clears the connected icon", async () => {
  const worker = await setup({ connected: true, running: true });
  worker.disconnectHost();
  assert.equal(worker.icons.at(-1), "chrome-extension://test/icons/icon-16.png");
});
