const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/features/orders/new-order-chime.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(windowValue) {
  const moduleRecord = { exports: {} };
  vm.runInNewContext(compiled, { module: moduleRecord, exports: moduleRecord.exports, window: windowValue });
  return moduleRecord.exports;
}

function mockAudio() {
  const oscillators = [];
  const gains = [];
  const timers = [];
  const contexts = [];

  const param = () => ({
    values: [],
    setValueAtTime(value, time) { this.values.push({ op: "set", value, time }); },
    exponentialRampToValueAtTime(value, time) { this.values.push({ op: "ramp", value, time }); },
  });
  class FakeAudioContext {
    constructor() {
      this.currentTime = 10;
      this.destination = {};
      this.state = "running";
      this.closed = false;
      contexts.push(this);
    }
    createDynamicsCompressor() {
      const compressor = {
        threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
        connect(destination) { this.destination = destination; },
      };
      this.compressor = compressor;
      return compressor;
    }
    createOscillator() {
      const osc = {
        type: "",
        frequency: param(),
        connect(target) { this.target = target; },
        start(time) { this.startedAt = time; },
        stop(time) { this.stoppedAt = time; },
      };
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      const node = { gain: param(), connect(destination) { this.destination = destination; } };
      gains.push(node);
      return node;
    }
    close() { this.closed = true; return Promise.resolve(); }
    resume() { this.state = "running"; return Promise.resolve(); }
  }

  const window = {
    AudioContext: FakeAudioContext,
    setTimeout(callback, duration) { timers.push({ callback, duration }); return timers.length; },
    clearTimeout() {},
  };
  return { window, oscillators, gains, timers, contexts };
}

test("new-order bell uses four distinct, louder pulses without clipping the mixer", () => {
  const mock = mockAudio();
  const { playNewOrderChime, NEW_ORDER_CHIME_NOTES } = load(mock.window);
  assert.equal(playNewOrderChime(), true);
  assert.equal(NEW_ORDER_CHIME_NOTES.length, 4);
  assert.equal(mock.oscillators.length, 8);
  assert.equal(mock.gains.length, 8);
  assert.equal(mock.oscillators[0].type, "triangle");
  assert.equal(mock.oscillators[1].type, "sine");
  assert.equal(mock.gains[0].gain.values[1].value, 0.42);
  assert.ok(mock.gains[0].gain.values[1].value > 0.12, "must be louder than the previous gain");
  assert.ok(mock.oscillators.at(-1).stoppedAt - mock.oscillators[0].startedAt >= 1.8);
  assert.ok(mock.gains.every((node) => node.gain.values.at(-1).value === 0.0001));
  assert.equal(mock.contexts[0].compressor.threshold.values[0].value, -8);
  assert.ok(mock.timers[0].duration >= 2000);
  mock.timers[0].callback();
  assert.equal(mock.contexts[0].closed, true);
});

test("missing or blocked audio support fails closed", () => {
  assert.equal(load({}).playNewOrderChime(), false);
  assert.equal(load({ AudioContext: class { constructor() { throw Error("blocked"); } } }).playNewOrderChime(), false);
  assert.equal(load(undefined).playNewOrderChime(), false);
});

test("repeat rings stop the prior audio context so alerts do not stack", () => {
  const mock = mockAudio();
  const { playNewOrderChime } = load(mock.window);
  assert.equal(playNewOrderChime(), true);
  assert.equal(playNewOrderChime(), true);
  assert.equal(mock.contexts.length, 2);
  assert.equal(mock.contexts[0].closed, true);
  assert.equal(mock.contexts[1].closed, false);
  mock.timers.at(-1).callback();
  assert.equal(mock.contexts[1].closed, true);
});

test("the existing order notification and manual test button use the chime", () => {
  const page = fs.readFileSync(path.join(__dirname, "../src/features/orders/OrdersPage.tsx"), "utf8");
  const utils = fs.readFileSync(path.join(__dirname, "../src/features/orders/utils.ts"), "utf8");
  assert.match(utils, /export \{ playNewOrderChime \} from "\.\/new-order-chime"/);
  assert.match(page, /if \(isChimeEnabled\) \{\s*playNewOrderChime\(\)/);
  assert.match(page, /const enableChime = \(\) => \{\s*const played = playNewOrderChime\(\)/);
  assert.match(page, /onClick=\{enableChime\}/);
});
