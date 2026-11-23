import {
  DOMAIN_SIZE,
  INT8_MIN,
  INT8_MAX,
  UNIT_TESTS,
  exhaustiveOrder,
  isInt8,
  runAgainstExpected,
  runAgainstSpec,
  type TestResult,
} from "./checker";
import { CHAPTER, STEPS, type CalloutKind } from "./lesson";
import { Stage } from "./iso";
import {
  describeScene,
  type CellMark,
  type ScanStatus,
  type SceneState,
} from "./scene";

const DWELL_MS = 2800;
const SCAN_BATCH = 4;
const SCAN_FRAME_MS = 16;
const TEST_STAGGER_MS = 900;
const TRACE_STAGGER_MS = 850;

type Timers = {
  tests: number[];
  trace: number[];
  dwell: number;
  scan: number;
};

const timers: Timers = { tests: [], trace: [], dwell: 0, scan: 0 };

const state = {
  step: 0,
  playing: false,
  unitResults: [null, null, null] as Array<TestResult | null>,
  unitFresh: -1,
  userResults: [] as TestResult[],
  cellMarks: Array<CellMark>(DOMAIN_SIZE).fill("empty"),
  scan: "idle" as ScanStatus,
  scanned: 0,
  tracePhase: -1,
};

let stage: Stage;
let inputEl: HTMLInputElement;

export function mount(root: HTMLElement): void {
  root.innerHTML = shellHtml();
  stage = new Stage();
  const canvas = root.querySelector<HTMLElement>("#canvas")!;
  canvas.appendChild(stage.svg);
  stage.bind(canvas);
  inputEl = root.querySelector("#x-input")!;
  bind(root);
  applyHash(location.hash);
  render();
  enterStep(state.step, false);
}

function shellHtml(): string {
  const steps = STEPS.map(
    (step, i) => `
      <li>
        <button type="button" class="dot" data-step="${i}" style="--i:${i}">
          <span class="dot__num">${i + 1}</span>
          <span class="dot__label">${step.short}</span>
        </button>
      </li>`,
  ).join("");

  return `
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <span class="brand__kicker">形式検証</span>
          <span class="brand__title">第${CHAPTER.num}章　${CHAPTER.title}</span>
        </div>
        <div class="tools">
          <button type="button" class="tool" id="fit" title="全体を表示（0）">全体</button>
          <button type="button" class="tool" id="replay" title="このステップをやり直す（R）">やり直す</button>
          <button type="button" class="tool" id="play" title="再生 / 一時停止（Space）">再生</button>
        </div>
      </header>

      <div class="workspace">
        <section class="stage" aria-label="図">
          <div class="hud" id="hud"></div>
          <div class="canvas" id="canvas"></div>
          <div class="stage-legend" id="legend" hidden></div>
        </section>

        <aside class="rail">
          <section class="card guide" id="guide"></section>
          <section class="card goals">
            <h2>この章でわかること</h2>
            <ol>
              ${CHAPTER.goals.map((g) => `<li>${g}</li>`).join("")}
            </ol>
          </section>
          <section class="card widget" id="widget" hidden>
            <h2>自分で試す</h2>
            <p class="widget__hint">−128 から 127 の整数を入れて、仕様「結果 ≥ 0」を1件だけ検査します。</p>
            <div class="widget__row">
              <label for="x-input">入力 x</label>
              <input id="x-input" type="number" min="-128" max="127" value="7" step="1" />
              <button type="button" class="btn" id="run-test">この値で試す</button>
            </div>
            <p class="widget__msg" id="widget-msg" hidden></p>
            <ul class="tries" id="tries"></ul>
            <button type="button" class="btn btn--accent" id="exhaustive">すべて調べる（256通り）</button>
          </section>
        </aside>
      </div>

      <footer class="dock">
        <nav class="timeline" aria-label="ステップ">
          <div class="timeline__rail" style="--n:${STEPS.length}"><span id="rail-fill"></span></div>
          <ol class="timeline__steps" style="--n:${STEPS.length}">${steps}</ol>
        </nav>
        <div class="pager">
          <button type="button" class="btn" id="prev">前へ</button>
          <button type="button" class="btn btn--accent" id="next">次へ</button>
        </div>
      </footer>
    </div>
  `;
}

function bind(root: HTMLElement): void {
  root.querySelector("#prev")!.addEventListener("click", () => go(state.step - 1));
  root.querySelector("#next")!.addEventListener("click", () => go(state.step + 1));
  root.querySelector("#play")!.addEventListener("click", togglePlay);
  root.querySelector("#fit")!.addEventListener("click", () => stage.fit());
  root.querySelector("#replay")!.addEventListener("click", () => enterStep(state.step, true));
  root.querySelector("#run-test")!.addEventListener("click", onRunTest);
  root.querySelector("#exhaustive")!.addEventListener("click", onExhaustive);
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onRunTest();
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((btn) => {
    btn.addEventListener("click", () => go(Number(btn.dataset.step)));
  });

  window.addEventListener("hashchange", () => {
    if (applyHash(location.hash)) {
      enterStep(state.step, false);
      render();
    }
  });

  window.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target && target.closest("input, textarea, button")) {
      if (event.key === " " && target.closest("input")) return;
    }
    if (target && target.closest("input") && event.key === "0") return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(state.step + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(state.step - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      enterStep(state.step, true);
    } else if (event.key === "0") {
      event.preventDefault();
      stage.fit();
    }
  });
}

function applyHash(hash: string): boolean {
  const match = /^#\/ch1\/(\d+)$/.exec(hash);
  const next = match ? clamp(Number(match[1]) - 1, 0, STEPS.length - 1) : 0;
  const changed = next !== state.step || !match;
  state.step = next;
  const expected = `#/ch1/${state.step + 1}`;
  if (location.hash !== expected) history.replaceState(null, "", expected);
  return changed;
}

function setHash(): void {
  const next = `#/ch1/${state.step + 1}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

function go(step: number): void {
  const next = clamp(step, 0, STEPS.length - 1);
  if (next === state.step) return;
  stopScanLoop();
  state.step = next;
  setHash();
  enterStep(state.step, false);
  render();
}

function togglePlay(): void {
  if (state.step === 4 && (state.scan === "running" || state.scan === "paused")) {
    if (state.scan === "running") {
      state.scan = "paused";
      state.playing = false;
    } else {
      state.scan = "running";
      state.playing = true;
      tickScan();
    }
    render();
    return;
  }
  state.playing = !state.playing;
  if (state.playing) {
    if (state.step === 4 && state.scan === "idle") startScan();
    else scheduleDwell();
  } else {
    clearTimer("dwell");
  }
  render();
}

function enterStep(step: number, replay: boolean): void {
  clearTimer("tests");
  clearTimer("trace");
  clearTimer("dwell");
  state.unitFresh = -1;

  if (step === 1) {
    if (replay) resetUnitTests();
    animateUnitTests();
  } else if (step > 1 && state.unitResults.some((r) => r == null)) {
    UNIT_TESTS.forEach((t, i) => {
      state.unitResults[i] = runAgainstExpected(t.x, t.expected);
      paintCell(t.x, "unit");
    });
  }

  if (step === 5) {
    state.tracePhase = replay ? -1 : state.tracePhase >= 4 ? 4 : -1;
    animateTrace();
  } else if (step > 5) {
    state.tracePhase = 4;
  }

  if (step === 4 && replay) {
    resetScan(false);
    if (state.playing) startScan();
  }

  if (state.playing && step !== 4) scheduleDwell();
  if (state.playing && step === 4 && state.scan === "idle") startScan();
}

function resetUnitTests(): void {
  state.unitResults = [null, null, null];
  for (const t of UNIT_TESTS) {
    const i = t.x - INT8_MIN;
    if (state.cellMarks[i] === "unit") state.cellMarks[i] = "empty";
  }
}

function animateUnitTests(): void {
  state.unitResults = [null, null, null];
  UNIT_TESTS.forEach((t, i) => {
    const id = window.setTimeout(() => {
      state.unitResults[i] = runAgainstExpected(t.x, t.expected);
      state.unitFresh = i;
      paintCell(t.x, "unit");
      render();
    }, TEST_STAGGER_MS * (i + 1));
    timers.tests.push(id);
  });
  const settle = window.setTimeout(() => {
    state.unitFresh = -1;
    render();
  }, TEST_STAGGER_MS * UNIT_TESTS.length + 780);
  timers.tests.push(settle);
}

function animateTrace(): void {
  const start = state.tracePhase < 0 ? 0 : state.tracePhase + 1;
  for (let phase = start; phase <= 4; phase++) {
    const id = window.setTimeout(() => {
      state.tracePhase = phase;
      render();
    }, TRACE_STAGGER_MS * (phase - start + 1));
    timers.trace.push(id);
  }
}

function scheduleDwell(): void {
  clearTimer("dwell");
  if (!state.playing) return;
  if (state.step >= STEPS.length - 1) {
    state.playing = false;
    render();
    return;
  }
  timers.dwell = window.setTimeout(() => {
    if (!state.playing) return;
    go(state.step + 1);
  }, DWELL_MS);
}

function onRunTest(): void {
  const raw = inputEl.value.trim();
  const value = Number(raw);
  const msg = document.querySelector<HTMLElement>("#widget-msg")!;
  if (raw === "" || Number.isNaN(value) || !isInt8(value)) {
    msg.hidden = false;
    msg.textContent = `8ビットの範囲は ${INT8_MIN} から ${INT8_MAX} の整数です。`;
    msg.className = "widget__msg is-warn";
    return;
  }
  const result = runAgainstSpec(value);
  state.userResults = [
    result,
    ...state.userResults.filter((r) => r.x !== value),
  ].slice(0, 6);
  paintCell(value, result.pass ? "user" : "fail");
  msg.hidden = false;
  if (!result.pass) {
    msg.className = "widget__msg is-bad";
    msg.textContent = `反例を見つけた。abs8(${value}) = ${result.got} で、0 以上ではない。`;
  } else {
    const left = DOMAIN_SIZE - state.cellMarks.filter((m) => m !== "empty").length;
    msg.className = "widget__msg";
    msg.textContent = `通った。abs8(${value}) = ${result.got}。まだ見ていない入力が ${left} 通りある。`;
  }
  render();
}

function onExhaustive(): void {
  if (state.step !== 4) {
    state.playing = false;
    state.step = 4;
    setHash();
  }
  resetScan(false);
  startScan();
  render();
}

function resetScan(clearUser: boolean): void {
  stopScanLoop();
  state.scan = "idle";
  state.scanned = 0;
  const keep = new Map<number, CellMark>();
  for (const t of UNIT_TESTS) keep.set(t.x, "unit");
  if (!clearUser) {
    for (const r of state.userResults) keep.set(r.x, r.pass ? "user" : "fail");
  }
  state.cellMarks = Array<CellMark>(DOMAIN_SIZE).fill("empty");
  for (const [x, mark] of keep) state.cellMarks[x - INT8_MIN] = mark;
}

function startScan(): void {
  if (state.scan === "done") return;
  state.scan = "running";
  state.playing = true;
  tickScan();
}

function tickScan(): void {
  stopScanLoop();
  if (state.scan !== "running") return;
  const order = exhaustiveOrder();
  const end = Math.min(state.scanned + SCAN_BATCH, order.length);
  for (let i = state.scanned; i < end; i++) {
    const x = order[i]!;
    const mark: CellMark = runAgainstSpec(x).pass
      ? state.cellMarks[x - INT8_MIN] === "unit"
        ? "unit"
        : state.cellMarks[x - INT8_MIN] === "user"
          ? "user"
          : "pass"
      : "fail";
    state.cellMarks[x - INT8_MIN] = mark;
  }
  state.scanned = end;
  if (state.scanned >= order.length) {
    state.scan = "done";
    state.playing = false;
    render();
    return;
  }
  render();
  timers.scan = window.setTimeout(tickScan, SCAN_FRAME_MS);
}

function stopScanLoop(): void {
  if (timers.scan) {
    window.clearTimeout(timers.scan);
    timers.scan = 0;
  }
}

function paintCell(x: number, mark: CellMark): void {
  const i = x - INT8_MIN;
  const prev = state.cellMarks[i];
  if (prev === "fail") return;
  if (mark === "user" || mark === "unit" || prev === "empty" || mark === "fail") {
    state.cellMarks[i] = mark;
  }
}

function render(): void {
  const step = STEPS[state.step]!;
  const guide = document.querySelector("#guide")!;
  guide.innerHTML = `
    <p class="kicker">ステップ ${state.step + 1} / ${STEPS.length}</p>
    <h1>${step.title}</h1>
    ${step.body.map((p) => `<p>${p}</p>`).join("")}
    ${step.callout ? calloutHtml(step.callout.kind, step.callout.text) : ""}
  `;

  const widget = document.querySelector<HTMLElement>("#widget")!;
  widget.hidden = state.step < 3 || state.step > 4;

  const tries = document.querySelector("#tries")!;
  tries.innerHTML = state.userResults
    .map((r) => {
      const cls = r.pass ? "is-ok" : "is-bad";
      const word = r.pass ? "通った" : "失敗";
      return `<li class="${cls}"><code>x = ${r.x}</code> → <code>${r.got}</code>　${word}</li>`;
    })
    .join("");

  const hud = document.querySelector("#hud")!;
  hud.innerHTML = hudHtml();

  const play = document.querySelector("#play")!;
  const scanning = state.step === 4 && state.scan === "running";
  play.textContent = state.playing || scanning ? "一時停止" : "再生";

  document.querySelector<HTMLButtonElement>("#prev")!.disabled = state.step === 0;
  document.querySelector<HTMLButtonElement>("#next")!.disabled =
    state.step === STEPS.length - 1;

  const fill = document.querySelector<HTMLElement>("#rail-fill")!;
  fill.style.width = `${(state.step / (STEPS.length - 1)) * 100}%`;

  document.querySelectorAll<HTMLElement>("[data-step]").forEach((btn) => {
    const i = Number(btn.dataset.step);
    btn.classList.toggle("is-active", i === state.step);
    btn.classList.toggle("is-done", i < state.step);
  });

  const scene: SceneState = {
    step: state.step,
    unitResults: state.unitResults,
    unitFresh: state.unitFresh,
    userResults: state.userResults,
    cellMarks: state.cellMarks,
    scan: state.scan,
    scanned: state.scanned,
    tracePhase: state.tracePhase,
  };
  stage.show(describeScene(scene), state.step);
  paintLegend(state.step);
}

function paintLegend(step: number): void {
  const legend = document.querySelector<HTMLElement>("#legend")!;
  if (step !== 3 && step !== 4) {
    legend.hidden = true;
    legend.innerHTML = "";
    return;
  }
  legend.hidden = false;
  const items: Array<[string, string]> =
    step === 3
      ? [
          ["empty", "未検査"],
          ["unit", "単体テスト"],
          ["user", "自分で試した"],
          ["fail", "仕様違反"],
        ]
      : [
          ["empty", "未検査"],
          ["pass", "仕様を満たす"],
          ["fail", "仕様違反（反例）"],
          ["unit", "単体テストで見た"],
          ["user", "自分で試した"],
        ];
  legend.innerHTML = items
    .map(([tone, label]) => `<span class="swatch"><i class="swatch__chip swatch--${tone}"></i>${label}</span>`)
    .join("");
}

function hudHtml(): string {
  const chips: string[] = [
    chip("仕様", "abs8(x) ≥ 0"),
    chip("入力空間", `${DOMAIN_SIZE} 通り`),
  ];
  const seen = state.cellMarks.filter((m) => m !== "empty").length;
  if (state.step >= 3) chips.push(chip("見た入力", `${seen} / ${DOMAIN_SIZE}`));
  if (state.scan === "done") chips.push(chip("反例", "x = −128", "bad"));
  return chips.join("");
}

function chip(label: string, value: string, tone = ""): string {
  return `<div class="chip ${tone}"><span class="chip__label">${label}</span><span class="chip__value">${value}</span></div>`;
}

function calloutHtml(kind: CalloutKind, text: string): string {
  const title =
    kind === "idea" ? "Key idea" : kind === "warn" ? "Watch out" : "次の章";
  return `<aside class="callout callout--${kind}"><p class="callout__kicker">${title}</p><p>${text}</p></aside>`;
}

function clearTimer(name: "tests" | "trace" | "dwell"): void {
  if (name === "dwell") {
    window.clearTimeout(timers.dwell);
    timers.dwell = 0;
    return;
  }
  for (const id of timers[name]) window.clearTimeout(id);
  timers[name] = [];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
