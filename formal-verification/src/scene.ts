import { DOMAIN_SIZE, type TestResult } from "./checker";
import type { BlockDesc, CalloutDesc, PacketDesc, SceneDesc, Tone } from "./iso";

export type CellMark = "empty" | "pass" | "fail" | "unit" | "user";
export type ScanStatus = "idle" | "running" | "paused" | "done";

export type SceneState = {
  step: number;
  unitResults: Array<TestResult | null>;
  unitFresh: number;
  userResults: TestResult[];
  cellMarks: CellMark[];
  scan: ScanStatus;
  scanned: number;
  tracePhase: number;
};

const UNIT = [
  { x: 5, label: "5", tag: "正の数" },
  { x: -3, label: "−3", tag: "負の数" },
  { x: 0, label: "0", tag: "ゼロ" },
] as const;

export function heightFor(mark: CellMark): number {
  switch (mark) {
    case "empty":
      return 4;
    case "pass":
      return 13;
    case "unit":
      return 16;
    case "user":
      return 16;
    case "fail":
      return 60;
  }
}

export function describeScene(state: SceneState): SceneDesc {
  switch (state.step) {
    case 0:
      return describeFunction();
    case 1:
      return describeTests(state, false);
    case 2:
      return describeTests(state, true);
    case 3:
      return describeBoard(state, true);
    case 4:
      return describeBoard(state, false);
    case 5:
      return describeTrace(state);
    default:
      return describeTakeaway();
  }
}

function describeFunction(): SceneDesc {
  return {
    floor: { x0: -8, y0: -1.5, x1: 14, y1: 16 },
    blocks: [
      {
        id: "in-pad",
        x: -6.2,
        y: 0.8,
        w: 3.8,
        d: 4.4,
        h: 12,
        tone: "sand",
        title: "入力",
        body: ["−128〜127"],
      },
      {
        id: "machine",
        x: 1.4,
        y: 0.2,
        w: 6.0,
        d: 4.8,
        h: 72,
        tone: "machine",
        title: "abs8",
      },
      {
        id: "out-pad",
        x: 0.6,
        y: 8.8,
        w: 8.4,
        d: 2.8,
        h: 10,
        tone: "ok",
      },
    ],
    links: [
      {
        id: "in-link",
        points: [
          { x: -2.3, y: 2.9, z: 10 },
          { x: 1.4, y: 2.9, z: 10 },
        ],
      },
      {
        id: "out-link",
        points: [
          { x: 4.4, y: 5.0, z: 10 },
          { x: 4.4, y: 8.8, z: 10 },
        ],
      },
    ],
    labels: [
      { id: "out-caption", x: -0.6, y: 10.0, z: 16, text: "出力", kind: "label", anchor: "end" },
    ],
    callouts: [
      {
        id: "code",
        x: 4.4,
        y: 2.5,
        z: 96,
        title: "実装",
        text: "if (x >= 0) return x\nelse return int8(-x)",
        tone: "spec",
      },
      {
        id: "spec-co",
        x: 4.8,
        y: 13.4,
        z: 8,
        title: "仕様",
        text: "abs8(x) ≥ 0",
        tone: "spec",
        place: "below",
      },
    ],
  };
}

function describeTests(state: SceneState, compare: boolean): SceneDesc {
  const blocks: BlockDesc[] = [
    {
      id: "in-pad",
      x: -6.2,
      y: 0.8,
      w: 3.2,
      d: 4.2,
      h: 10,
      tone: "sand",
      title: "入力",
    },
    {
      id: "machine",
      x: 1.6,
      y: 0.4,
      w: 5.4,
      d: 4.4,
      h: 64,
      tone: "machine",
      title: "abs8",
      body: currentExpr(state),
    },
    {
      id: "out-pad",
      x: 0.6,
      y: 8.4,
      w: 8.4,
      d: 2.8,
      h: 10,
      tone: "ok",
    },
  ];

  if (compare) {
    blocks.push(
      {
        id: "cmp-ok",
        x: -2.8,
        y: 14.6,
        w: 7.4,
        d: 3.8,
        h: 18,
        tone: "ok",
        title: "テスト",
        body: ["3本 成功"],
      },
      {
        id: "cmp-warn",
        x: 5.8,
        y: 14.6,
        w: 7.4,
        d: 3.8,
        h: 18,
        tone: "warn",
        title: "未検査",
        body: ["253 通り"],
      },
    );
  }

  const packets: PacketDesc[] = UNIT.map((_, i) => packetForTest(state, i));

  return {
    floor: { x0: -8, y0: -1.5, x1: 14, y1: compare ? 18 : 12.2 },
    blocks,
    links: [
      {
        id: "in-link",
        points: [
          { x: -2.8, y: 2.8, z: 10 },
          { x: 1.6, y: 2.8, z: 10 },
        ],
      },
      {
        id: "out-link",
        points: [
          { x: 4.2, y: 4.6, z: 10 },
          { x: 4.2, y: 8.4, z: 10 },
        ],
      },
    ],
    packets,
    labels: [
      { id: "out-caption", x: -0.6, y: 9.6, z: 16, text: "出力", kind: "label", anchor: "end" },
    ],
  };
}

function currentExpr(state: SceneState): string[] | undefined {
  if (state.unitFresh < 0) return undefined;
  const i = state.unitFresh;
  const u = UNIT[i];
  const r = state.unitResults[i];
  if (!u || !r) return undefined;
  return [`abs8(${u.label})`, `= ${r.got}`];
}

function packetForTest(state: SceneState, i: number): PacketDesc {
  const u = UNIT[i]!;
  const result = state.unitResults[i];
  const inY = 1.6 + i * 1.25;
  const start = { x: -4.6, y: inY, z: 20 };
  const mid = { x: 4.2, y: 2.4, z: 66 };
  const end = { x: 1.8 + i * 2.4, y: 9.6, z: 22 };
  if (result == null) {
    return {
      id: `pkt-${i}`,
      label: u.label,
      tone: "idle",
      ...start,
    };
  }
  return {
    id: `pkt-${i}`,
    label: String(result.got),
    tone: "ok",
    ...end,
    check: true,
    path: [start, mid, end],
    progress: 0,
  };
}

function describeBoard(state: SceneState, _trying: boolean): SceneDesc {
  const blocks: BlockDesc[] = [];
  const n = 16;
  const pitch = 1.15;
  const size = 0.78;
  for (let i = 0; i < DOMAIN_SIZE; i++) {
    const col = i % n;
    const row = Math.floor(i / n);
    const mark = state.cellMarks[i] ?? "empty";
    blocks.push({
      id: `c${i}`,
      x: col * pitch,
      y: row * pitch,
      w: size,
      d: size,
      h: heightFor(mark),
      tone: mark as Tone,
    });
  }

  const callouts: CalloutDesc[] = [];
  const failIndex = state.cellMarks.findIndex((m) => m === "fail");
  const extent = (n - 1) * pitch + size;
  if (failIndex >= 0) {
    const col = failIndex % n;
    const row = Math.floor(failIndex / n);
    callouts.push({
      id: "cx",
      x: col * pitch + size / 2,
      y: row * pitch + size / 2,
      z: heightFor("fail") + 14,
      title: "反例",
      text: "x = −128",
      tone: "fail",
    });
  }

  const labels: SceneDesc["labels"] = [
    { id: "min", x: -2.4, y: 1.2, z: 6, text: "−128", kind: "tick", anchor: "end" },
    { id: "max", x: extent + 2.2, y: extent + 0.4, z: 6, text: "127", kind: "tick", anchor: "start" },
  ];
  if (callouts.length === 0) {
    labels.push({
      id: "caption",
      x: -3.4,
      y: -3.6,
      z: 4,
      text: "入力空間（256 通り）",
      kind: "label",
    });
  }

  return {
    floor: { x0: -3, y0: -3, x1: extent + 3, y1: extent + 3 },
    fitMargin: 0.11,
    blocks,
    labels,
    callouts,
  };
}

function describeTrace(state: SceneState): SceneDesc {
  const phase = state.tracePhase;
  const blocks: BlockDesc[] = [
    {
      id: "in-pad",
      x: -6.8,
      y: 1.2,
      w: 3.4,
      d: 3.8,
      h: 12,
      tone: "sand",
      title: "入力",
    },
    {
      id: "machine",
      x: 1.4,
      y: 0.8,
      w: 6.0,
      d: 4.8,
      h: 62,
      tone: phase >= 2 ? "fail" : "machine",
      title: "abs8",
      body: traceBody(phase),
    },
    {
      id: "out-pad",
      x: 11.6,
      y: 1.2,
      w: 3.6,
      d: 3.8,
      h: 12,
      tone: phase >= 3 ? "fail" : "sand",
      title: undefined,
    },
  ];

  const callouts: CalloutDesc[] = [];
  if (phase >= 4) {
    callouts.push({
      id: "verdict",
      x: 13.4,
      y: 3.0,
      z: 48,
      title: "反例",
      text: "abs8(−128) = −128",
      tone: "fail",
    });
  }

  const packets: PacketDesc[] = [];
  if (phase >= 0) {
    const start = { x: -5.0, y: 3.0, z: 22 };
    const mid = { x: 4.1, y: 2.8, z: 68 };
    const end = { x: 13.4, y: 3.0, z: 22 };
    const atOut = phase >= 3;
    const path = atOut ? [start, mid, end] : [start, mid];
    packets.push({
      id: "trace-pkt",
      label: phase >= 2 ? "−128" : phase >= 1 ? "128" : "−128",
      tone: phase >= 2 ? "bad" : "idle",
      ...(atOut ? end : mid),
      check: phase >= 3,
      path,
      progress: 0,
    });
  }

  return {
    floor: { x0: -8.5, y0: -1, x1: 16.5, y1: phase >= 4 ? 8 : 6.5 },
    blocks,
    links: [
      {
        id: "in-link",
        points: [
          { x: -3.2, y: 3.0, z: 10 },
          { x: 1.4, y: 3.0, z: 10 },
        ],
      },
      {
        id: "out-link",
        points: [
          { x: 6.8, y: 3.0, z: 10 },
          { x: 11.6, y: 3.0, z: 10 },
        ],
      },
    ],
    packets,
    labels: [
      { id: "out-cap", x: 16.8, y: 5.4, z: 14, text: "出力", kind: "label", anchor: "start" },
      ...(phase >= 0
        ? [{ id: "in-val", x: -7.4, y: 5.4, z: 16, text: "−128", kind: "label" as const, anchor: "end" as const }]
        : []),
    ],
    callouts,
  };
}

function traceBody(phase: number): string[] | undefined {
  if (phase < 1) return ["受け取る"];
  if (phase === 1) return ["−x = 128"];
  if (phase === 2) return ["128 → −128"];
  return undefined;
}

function describeTakeaway(): SceneDesc {
  const mini: BlockDesc[] = [];
  const pitch = 0.9;
  const size = 0.62;
  const originX = 7.2;
  const originY = 5.4;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      const fail = r === 3 && c === 0;
      mini.push({
        id: `mini-${r}-${c}`,
        x: originX + c * pitch,
        y: originY + r * pitch,
        w: size,
        d: size,
        h: fail ? 26 : 10,
        tone: fail ? "fail" : "pass",
      });
    }
  }

  return {
    floor: { x0: -7, y0: -3.5, x1: 17, y1: 17 },
    blocks: [
      {
        id: "left",
        x: -5.0,
        y: -1.2,
        w: 8.2,
        d: 4.2,
        h: 24,
        tone: "ok",
        title: "テスト",
      },
      {
        id: "s0",
        x: -4.6,
        y: 5.2,
        w: 1.15,
        d: 1.15,
        h: 14,
        tone: "unit",
      },
      {
        id: "s1",
        x: -3.0,
        y: 5.2,
        w: 1.15,
        d: 1.15,
        h: 14,
        tone: "unit",
      },
      {
        id: "s2",
        x: -1.4,
        y: 5.2,
        w: 1.15,
        d: 1.15,
        h: 14,
        tone: "unit",
      },
      {
        id: "right",
        x: 5.8,
        y: -1.2,
        w: 9.6,
        d: 4.2,
        h: 24,
        tone: "spec",
        title: "形式検証",
      },
      ...mini,
      {
        id: "next",
        x: -5.0,
        y: 12.2,
        w: 20.0,
        d: 4.0,
        h: 22,
        tone: "next",
        title: "次の章",
        body: ["状態機械と不変条件"],
      },
    ],
    labels: [],
  };
}
