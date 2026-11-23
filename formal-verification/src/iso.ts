const NS = "http://www.w3.org/2000/svg";

export const TW = 32;
export const TH = 16;

/** On-screen CSS pixel targets. Text is counter-scaled to keep these at default Fit. */
export const TYPE = {
  label: 13,
  body: 15,
  title: 16,
  callout: 20,
  kicker: 13,
  packet: 15,
} as const;

export type ScreenPt = { x: number; y: number };

export type Tone =
  | "empty"
  | "pass"
  | "fail"
  | "unit"
  | "user"
  | "machine"
  | "spec"
  | "ok"
  | "warn"
  | "next"
  | "sand"
  | "ink";

export type BlockDesc = {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  tone: Tone;
  title?: string;
  body?: string[];
};

export type LinkDesc = { id: string; points: Array<{ x: number; y: number; z?: number }> };

export type LabelDesc = {
  id: string;
  x: number;
  y: number;
  z?: number;
  text: string;
  kind?: "tick" | "label" | "eyebrow" | "note";
  anchor?: "start" | "middle" | "end";
};

export type CalloutDesc = {
  id: string;
  x: number;
  y: number;
  z?: number;
  title?: string;
  text: string;
  tone?: "fail" | "ok" | "spec";
  /** Default "above": box sits above the anchor. "below" hangs in front of it. */
  place?: "above" | "below";
};

export type PacketDesc = {
  id: string;
  label: string;
  tone: "idle" | "ok" | "bad";
  x: number;
  y: number;
  z: number;
  check?: boolean;
  /** If set, the packet interpolates along this iso-space path. */
  path?: Array<{ x: number; y: number; z: number }>;
  progress?: number;
};

export type SceneDesc = {
  floor: { x0: number; y0: number; x1: number; y1: number };
  blocks: BlockDesc[];
  links?: LinkDesc[];
  labels?: LabelDesc[];
  callouts?: CalloutDesc[];
  packets?: PacketDesc[];
  /** Fraction of the viewBox kept as margin on each side when fitting. */
  fitMargin?: number;
};

export type Palette = { top: string; left: string; right: string; stroke: string };

export const PALETTES: Record<Tone, Palette> = {
  empty: { top: "#f4ede1", left: "#e4d8c8", right: "#d0c2ae", stroke: "#5c564e" },
  pass: { top: "#dceebb", left: "#b9d48a", right: "#8fb05e", stroke: "#2c4a1c" },
  unit: { top: "#cce69a", left: "#a8cc70", right: "#7fa34c", stroke: "#2c4a1c" },
  user: { top: "#c8d6ef", left: "#9eb6dc", right: "#6f8cb8", stroke: "#24344c" },
  fail: { top: "#f3b7ab", left: "#e39080", right: "#c26252", stroke: "#7a2e22" },
  machine: { top: "#e8e0f4", left: "#cbbddc", right: "#a994c0", stroke: "#322c26" },
  spec: { top: "#e8def4", left: "#cfc0e0", right: "#b09ac8", stroke: "#322c26" },
  ok: { top: "#d8ecb8", left: "#b9d48a", right: "#8fb05e", stroke: "#2c4a1c" },
  warn: { top: "#f6e0a8", left: "#e2c070", right: "#c49a48", stroke: "#6a4a12" },
  next: { top: "#d6e2f4", left: "#b4c4dc", right: "#8aa0c0", stroke: "#24344c" },
  sand: { top: "#f7f0e4", left: "#e6dac9", right: "#d2c3ae", stroke: "#322c26" },
  ink: { top: "#4a453f", left: "#322c26", right: "#1c1814", stroke: "#1c1814" },
};

export function project(x: number, y: number, z = 0): ScreenPt {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - z };
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  if (text != null) node.textContent = text;
  return node;
}

function poly(points: ScreenPt[]): string {
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} Z`;
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPt(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function along(
  path: Array<{ x: number; y: number; z: number }>,
  t: number,
): { x: number; y: number; z: number } {
  if (path.length === 0) return { x: 0, y: 0, z: 0 };
  if (path.length === 1 || t <= 0) return path[0]!;
  if (t >= 1) return path[path.length - 1]!;
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1]!, q = path[i]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y, (q.z - p.z) / TW);
    segs.push(len);
    total += len;
  }
  if (total === 0) return path[path.length - 1]!;
  let walked = t * total;
  for (let i = 1; i < path.length; i++) {
    const len = segs[i - 1]!;
    if (walked <= len) return lerpPt(path[i - 1]!, path[i]!, len === 0 ? 1 : walked / len);
    walked -= len;
  }
  return path[path.length - 1]!;
}

export function blockGeometry(x: number, y: number, w: number, d: number, h: number, z0 = 0): {
  top: ScreenPt[];
  left: ScreenPt[];
  right: ScreenPt[];
  base: ScreenPt[];
  apex: ScreenPt;
} {
  const top = h + z0;
  const t0 = project(x, y, top);
  const t1 = project(x + w, y, top);
  const t2 = project(x + w, y + d, top);
  const t3 = project(x, y + d, top);
  const b1 = project(x + w, y, z0);
  const b2 = project(x + w, y + d, z0);
  const b3 = project(x, y + d, z0);
  const b0 = project(x, y, z0);
  return {
    top: [t0, t1, t2, t3],
    right: [t1, t2, b2, b1],
    left: [t3, t2, b2, b3],
    base: [b0, b1, b2, b3],
    apex: { x: (t0.x + t2.x) / 2, y: (t0.y + t2.y) / 2 },
  };
}

function shadowPath(base: ScreenPt[]): string {
  const ox = 3;
  const oy = 5;
  return poly(base.map((p) => ({ x: p.x + ox, y: p.y + oy })));
}

const POP_MS = 340;

type BlockView = {
  desc: BlockDesc;
  g: SVGGElement;
  shadow: SVGPathElement;
  left: SVGPathElement;
  right: SVGPathElement;
  top: SVGPathElement;
  title?: SVGTextElement;
  body: SVGTextElement[];
  h: number;
  from: number;
  to: number;
  started: number;
};

type PacketView = {
  desc: PacketDesc;
  g: SVGGElement;
  t: number;
  started: number;
  duration: number;
};

export class Stage {
  readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly floor: SVGGElement;
  private readonly links: SVGGElement;
  private readonly ents: SVGGElement;
  private readonly packetsLayer: SVGGElement;
  private readonly overlays: SVGGElement;
  private host: HTMLElement | null = null;
  private blocks = new Map<string, BlockView>();
  private packetViews = new Map<string, PacketView>();
  private panX = 0;
  private panY = 0;
  private scale = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private step = -1;
  private fitMargin = 0.12;
  private labelDescs: LabelDesc[] = [];
  private calloutDescs: CalloutDesc[] = [];
  private ro: ResizeObserver | null = null;
  private reduced = false;
  private mq: MediaQueryList | null = null;

  constructor() {
    this.svg = svgEl("svg", {
      class: "stage-svg",
      viewBox: "0 0 840 500",
      role: "img",
      "aria-label": "このステップの図",
      preserveAspectRatio: "xMidYMid meet",
    });
    this.svg.appendChild(this.buildDefs());
    this.world = svgEl("g", { class: "iso-world" });
    this.floor = svgEl("g", { class: "iso-floor" });
    this.links = svgEl("g", { class: "iso-links" });
    this.ents = svgEl("g", { class: "iso-ents" });
    this.packetsLayer = svgEl("g", { class: "iso-packets" });
    this.overlays = svgEl("g", { class: "iso-overlays" });
    this.world.append(this.floor, this.links, this.ents, this.packetsLayer, this.overlays);
    this.svg.appendChild(this.world);
    this.applyCam();
  }

  bind(host: HTMLElement): void {
    this.host = host;
    this.mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = this.mq.matches;
    this.mq.addEventListener("change", (event) => {
      this.reduced = event.matches;
    });

    this.svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.svg.setPointerCapture(event.pointerId);
      host.classList.add("is-dragging");
    });
    this.svg.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const vb = this.clientToViewBoxDelta(event.clientX - this.lastX, event.clientY - this.lastY);
      this.panX += vb.x;
      this.panY += vb.y;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      host.classList.add("is-zoomed");
      this.applyCam();
    });
    const endDrag = (event: PointerEvent): void => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        this.svg.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      host.classList.remove("is-dragging");
    };
    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);

    this.svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
        const next = clamp(this.scale * factor, 0.4, 2.8);
        const pt = this.clientToViewBox(event.clientX, event.clientY);
        const wx = (pt.x - this.panX) / this.scale;
        const wy = (pt.y - this.panY) / this.scale;
        this.scale = next;
        this.panX = pt.x - wx * this.scale;
        this.panY = pt.y - wy * this.scale;
        host.classList.toggle("is-zoomed", Math.abs(this.scale - 1) > 0.04);
        this.applyCam();
      },
      { passive: false },
    );

    this.svg.addEventListener("dblclick", (event) => {
      event.preventDefault();
      this.fit();
    });

    this.ro = new ResizeObserver(() => {
      if (this.host?.classList.contains("is-zoomed")) this.applyCam();
      else this.fit();
    });
    this.ro.observe(this.svg);

    requestAnimationFrame(this.loop);
  }

  show(desc: SceneDesc, step: number): void {
    const stepChanged = step !== this.step;
    this.step = step;
    this.fitMargin = desc.fitMargin ?? 0.12;
    if (stepChanged) {
      this.clear();
      this.drawFloor(desc.floor);
      this.drawLinks(desc.links ?? []);
    }
    const hadCallout = this.calloutDescs.length > 0;
    this.syncBlocks(desc.blocks, stepChanged);
    this.syncLabels(desc.labels ?? []);
    this.syncCallouts(desc.callouts ?? []);
    this.syncPackets(desc.packets ?? [], stepChanged);
    if (stepChanged || (this.calloutDescs.length > 0 && !hadCallout)) this.fit();
  }

  fit(): void {
    const bbox = this.contentBBox();
    if (!bbox || !bbox.width || !bbox.height) return;
    const vbW = 840;
    const vbH = 500;
    const m = this.fitMargin;
    const padX = vbW * m;
    const hasBelow = this.calloutDescs.some((c) => c.place === "below");
    const padBottom = hasBelow ? Math.max(vbH * m, 110) : vbH * m;
    // Extra top room for counter-scaled callouts, which are excluded from the bbox.
    const padTop = this.calloutDescs.length > 0 ? Math.max(vbH * m, 128) : vbH * m;
    const availW = vbW - padX * 2;
    const availH = vbH - padTop - padBottom;
    const next = clamp(Math.min(availW / bbox.width, availH / bbox.height), 0.22, 1.55);
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    this.scale = next;
    this.panX = padX + availW / 2 - cx * next;
    this.panY = padTop + availH / 2 - cy * next;
    this.host?.classList.remove("is-zoomed");
    this.applyCam();
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const ms = this.reduced ? 0 : POP_MS;
    let dirty = false;
    for (const view of this.blocks.values()) {
      if (view.h === view.to) continue;
      if (ms === 0) {
        view.h = view.to;
      } else {
        const t = clamp((now - view.started) / ms, 0, 1);
        view.h = lerp(view.from, view.to, easeOutBack(t));
        if (t >= 1) view.h = view.to;
      }
      this.paintBlock(view);
      dirty = true;
    }
    for (const pack of this.packetViews.values()) {
      if (!pack.desc.path || pack.t >= 1) continue;
      if (this.reduced) {
        pack.t = 1;
      } else {
        pack.t = clamp((now - pack.started) / pack.duration, 0, 1);
      }
      this.paintPacket(pack);
      dirty = true;
    }
    if (!dirty) return;
  };

  private clear(): void {
    this.floor.replaceChildren();
    this.links.replaceChildren();
    this.ents.replaceChildren();
    this.packetsLayer.replaceChildren();
    this.overlays.replaceChildren();
    this.blocks.clear();
    this.packetViews.clear();
  }

  private drawFloor(area: SceneDesc["floor"]): void {
    const { x0, y0, x1, y1 } = area;
    const pad = 2;
    const fill = [
      project(x0 - pad, y0 - pad),
      project(x1 + pad, y0 - pad),
      project(x1 + pad, y1 + pad),
      project(x0 - pad, y1 + pad),
    ];
    this.floor.appendChild(
      svgEl("path", { d: poly(fill), class: "iso-floor__fill" }),
    );
    const grid = svgEl("g", { class: "iso-floor__grid" });
    const step = 1;
    for (let x = Math.ceil(x0 - pad); x <= x1 + pad; x += step) {
      const a = project(x, y0 - pad);
      const b = project(x, y1 + pad);
      grid.appendChild(
        svgEl("line", {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          class: x % 4 === 0 ? "iso-grid-line is-strong" : "iso-grid-line",
        }),
      );
    }
    for (let y = Math.ceil(y0 - pad); y <= y1 + pad; y += step) {
      const a = project(x0 - pad, y);
      const b = project(x1 + pad, y);
      grid.appendChild(
        svgEl("line", {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          class: y % 4 === 0 ? "iso-grid-line is-strong" : "iso-grid-line",
        }),
      );
    }
    this.floor.appendChild(grid);
  }

  private drawLinks(links: LinkDesc[]): void {
    for (const link of links) {
      const pts = link.points.map((p) => project(p.x, p.y, p.z ?? 6));
      const d = pts
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
        .join(" ");
      const g = svgEl("g", { class: "iso-link", "data-id": link.id });
      g.appendChild(svgEl("path", { d, class: "iso-link__shaft" }));
      g.appendChild(svgEl("path", { d, class: "iso-link__core" }));
      this.links.appendChild(g);
    }
  }

  private syncBlocks(list: BlockDesc[], rebuild: boolean): void {
    const seen = new Set<string>();
    const now = performance.now();
    const ordered = [...list].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const desc of ordered) {
      seen.add(desc.id);
      let view = this.blocks.get(desc.id);
      if (!view) {
        view = this.makeBlock(desc);
        this.blocks.set(desc.id, view);
        view.h = this.reduced || rebuild ? desc.h : 0;
        view.from = view.h;
        view.to = desc.h;
        view.started = now;
        this.paintBlock(view);
        this.insertByDepth(view);
      } else {
        const toneChanged = view.desc.tone !== desc.tone;
        const moved =
          view.desc.x !== desc.x ||
          view.desc.y !== desc.y ||
          view.desc.w !== desc.w ||
          view.desc.d !== desc.d;
        if (view.to !== desc.h) {
          view.from = view.h;
          view.to = desc.h;
          view.started = now;
        }
        view.desc = desc;
        if (toneChanged) this.colorBlock(view);
        if (moved || toneChanged) this.paintBlock(view);
        this.writeBlockText(view);
      }
    }
    for (const [id, view] of this.blocks) {
      if (seen.has(id)) continue;
      view.g.remove();
      this.blocks.delete(id);
    }
  }

  private makeBlock(desc: BlockDesc): BlockView {
    const g = svgEl("g", { class: "iso-block", "data-id": desc.id });
    const shadow = svgEl("path", { class: "iso-block__shadow" });
    const left = svgEl("path", { class: "iso-block__left" });
    const right = svgEl("path", { class: "iso-block__right" });
    const top = svgEl("path", { class: "iso-block__top" });
    g.append(shadow, left, right, top);
    const view: BlockView = {
      desc,
      g,
      shadow,
      left,
      right,
      top,
      body: [],
      h: desc.h,
      from: desc.h,
      to: desc.h,
      started: 0,
    };
    this.colorBlock(view);
    this.writeBlockText(view);
    return view;
  }

  private colorBlock(view: BlockView): void {
    const pal = PALETTES[view.desc.tone];
    view.top.setAttribute("fill", pal.top);
    view.left.setAttribute("fill", pal.left);
    view.right.setAttribute("fill", pal.right);
    for (const face of [view.top, view.left, view.right]) {
      face.setAttribute("stroke", pal.stroke);
      face.setAttribute("stroke-width", view.desc.tone === "fail" ? "1.5" : "1.15");
      face.setAttribute("stroke-linejoin", "round");
    }
  }

  private paintBlock(view: BlockView): void {
    const { x, y, w, d } = view.desc;
    const geo = blockGeometry(x, y, w, d, Math.max(view.h, 0.5));
    view.top.setAttribute("d", poly(geo.top));
    view.left.setAttribute("d", poly(geo.left));
    view.right.setAttribute("d", poly(geo.right));
    view.shadow.setAttribute("d", shadowPath(geo.base));
    this.placeBlockText(view, geo);
  }

  private writeBlockText(view: BlockView): void {
    view.title?.remove();
    for (const line of view.body) line.remove();
    view.title = undefined;
    view.body = [];
    const { title, body } = view.desc;
    if (title) {
      view.title = svgEl("text", { class: "iso-block__title", "text-anchor": "middle" }, title);
      view.g.appendChild(view.title);
    }
    if (body) {
      view.body = body.map((line) => {
        const el = svgEl("text", { class: "iso-block__body", "text-anchor": "middle" }, line);
        view.g.appendChild(el);
        return el;
      });
    }
    this.placeBlockText(view, blockGeometry(view.desc.x, view.desc.y, view.desc.w, view.desc.d, Math.max(view.h, 0.5)));
  }

  private placeBlockText(
    view: BlockView,
    geo: ReturnType<typeof blockGeometry>,
  ): void {
    const topY = Math.min(...geo.top.map((p) => p.y));
    const botY = Math.max(...geo.top.map((p) => p.y));
    const leftX = Math.min(...geo.top.map((p) => p.x));
    const rightX = Math.max(...geo.top.map((p) => p.x));
    const cx = geo.apex.x;
    const faceH = botY - topY;
    const minSize = this.worldPx(TYPE.label);
    const titleSize = this.worldPx(TYPE.title);
    const bodySize = this.worldPx(TYPE.body);
    const lines = (view.title ? 1 : 0) + view.body.length;
    // Pack around the centroid so lines stay in the wide part of the diamond.
    const lineH = bodySize * 1.32;
    const band = Math.max(lineH, faceH * 0.46);
    const packed = Math.max(lines, 1) * lineH;
    const shrink = packed > band ? Math.max(minSize / bodySize, band / packed) : 1;
    const gap = lineH * shrink;
    const start = (topY + botY) / 2 - ((lines - 1) * gap) / 2;
    const fullW = rightX - leftX;
    const widthAt = (y: number): number => {
      const t = (y - topY) / Math.max(faceH, 1);
      const span = 1 - Math.abs(2 * t - 1);
      return Math.max(minSize, fullW * span * 0.6);
    };
    let i = 0;
    const place = (el: SVGTextElement, text: string, want: number): void => {
      const y = start + i * gap;
      const size = fitFont(text, widthAt(y), want, minSize);
      el.setAttribute("x", String(cx));
      el.setAttribute("y", String(y));
      el.setAttribute("font-size", String(size));
      el.setAttribute("dominant-baseline", "middle");
      i += 1;
    };
    if (view.title) place(view.title, view.desc.title ?? "", titleSize);
    for (const line of view.body) place(line, line.textContent ?? "", bodySize);
  }

  private insertByDepth(view: BlockView): void {
    const depth = view.desc.x + view.desc.y;
    const kids = [...this.ents.children];
    const next = kids.find((node) => {
      const id = (node as SVGGElement).dataset.id;
      if (!id) return false;
      const other = this.blocks.get(id);
      return other ? other.desc.x + other.desc.y > depth : false;
    });
    if (next) this.ents.insertBefore(view.g, next);
    else this.ents.appendChild(view.g);
  }

  private syncLabels(list: LabelDesc[]): void {
    this.labelDescs = list;
    this.overlays.querySelectorAll("[data-label]").forEach((n) => n.remove());
    for (const label of list) {
      const el = svgEl(
        "text",
        {
          class: `iso-label iso-label--${label.kind ?? "label"}`,
          "text-anchor": label.anchor ?? "middle",
          "data-label": label.id,
          "dominant-baseline": "middle",
        },
        label.text,
      );
      this.overlays.appendChild(el);
    }
    this.layoutLabels();
  }

  private layoutLabels(): void {
    for (const label of this.labelDescs) {
      const el = this.overlays.querySelector(`[data-label="${label.id}"]`);
      if (!(el instanceof SVGTextElement)) continue;
      const p = project(label.x, label.y, label.z ?? 0);
      const px = label.kind === "tick" ? TYPE.label : TYPE.body;
      el.setAttribute("x", String(p.x));
      el.setAttribute("y", String(p.y));
      el.setAttribute("font-size", String(this.worldPx(px)));
    }
  }

  private syncCallouts(list: CalloutDesc[]): void {
    this.calloutDescs = list;
    this.overlays.querySelectorAll("[data-callout]").forEach((n) => n.remove());
    for (const item of list) {
      const g = svgEl("g", {
        class: `iso-callout iso-callout--${item.tone ?? "fail"}`,
        "data-callout": item.id,
      });
      this.overlays.appendChild(g);
    }
    this.layoutCallouts();
  }

  private layoutCallouts(): void {
    const k = this.typoScale();
    for (const item of this.calloutDescs) {
      const g = this.overlays.querySelector(`[data-callout="${item.id}"]`);
      if (!(g instanceof SVGGElement)) continue;
      const p = project(item.x, item.y, item.z ?? 0);
      g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(4)})`);
      const title = item.title ?? "";
      const lines = item.text.split("\n").filter((line) => line.length > 0);
      const fs = this.filmPx(lines.length > 1 ? TYPE.body : TYPE.callout);
      const kick = this.filmPx(TYPE.kicker);
      const padX = this.filmPx(18);
      const padY = this.filmPx(10);
      const stack = this.filmPx(8);
      const lineGap = this.filmPx(4);
      const textW = Math.max(0, ...lines.map((line) => textWidth(line, fs)));
      const titleW = title ? textWidth(title, kick) : 0;
      const w = Math.max(textW, titleW) + padX * 2;
      const textBlock = lines.length * fs + Math.max(0, lines.length - 1) * lineGap;
      const inner = title ? kick + stack + textBlock : textBlock;
      const h = inner + padY * 2;
      const gap = this.filmPx(10);
      const stemH = this.filmPx(14);
      const stemW = this.filmPx(9);
      const below = item.place === "below";
      const boxTop = below ? gap : -h - gap;
      const stemTip = below ? -(stemH * 0.4) : stemH * 0.4;
      const stemBase = below ? -stemH : stemH;
      g.replaceChildren();
      g.appendChild(
        svgEl("path", {
          d: `M0,${stemTip.toFixed(1)} L${(-stemW).toFixed(1)},${stemBase.toFixed(1)} L${stemW.toFixed(1)},${stemBase.toFixed(1)} Z`,
          class: "iso-callout__stem",
        }),
      );
      g.appendChild(
        svgEl("rect", {
          x: -w / 2,
          y: boxTop,
          width: w,
          height: h,
          rx: this.filmPx(8),
          class: "iso-callout__box",
        }),
      );
      let y = boxTop + padY;
      if (title) {
        g.appendChild(
          svgEl(
            "text",
            {
              x: 0,
              y,
              "text-anchor": "middle",
              "dominant-baseline": "hanging",
              "font-size": kick,
              class: "iso-callout__kicker",
            },
            title,
          ),
        );
        y += kick + stack;
      }
      for (const line of lines) {
        g.appendChild(
          svgEl(
            "text",
            {
              x: 0,
              y,
              "text-anchor": "middle",
              "dominant-baseline": "hanging",
              "font-size": fs,
              class: "iso-callout__text",
            },
            line,
          ),
        );
        y += fs + lineGap;
      }
    }
  }

  private syncPackets(list: PacketDesc[], rebuild: boolean): void {
    const seen = new Set<string>();
    const now = performance.now();
    for (const desc of list) {
      seen.add(desc.id);
      let view = this.packetViews.get(desc.id);
      if (!view) {
        const g = svgEl("g", { class: "iso-packet", "data-id": desc.id });
        this.packetsLayer.appendChild(g);
        const startT =
          this.reduced || rebuild || !desc.path || (desc.progress ?? 0) >= 1 ? 1 : 0;
        view = {
          desc,
          g,
          t: startT,
          started: now,
          duration: 720,
        };
        this.packetViews.set(desc.id, view);
        this.paintPacket(view);
      } else {
        const pathChanged = JSON.stringify(view.desc.path) !== JSON.stringify(desc.path);
        const startNew = pathChanged && desc.path && (desc.progress ?? 0) < 1 && !this.reduced;
        view.desc = desc;
        if (startNew) {
          view.t = 0;
          view.started = now;
        } else if (desc.progress === 1 || this.reduced) {
          view.t = 1;
        }
        this.paintPacket(view);
      }
    }
    for (const [id, view] of this.packetViews) {
      if (seen.has(id)) continue;
      view.g.remove();
      this.packetViews.delete(id);
    }
  }

  private paintPacket(view: PacketView): void {
    const d = view.desc;
    const pos = d.path ? along(d.path, view.t) : { x: d.x, y: d.y, z: d.z };
    const atEnd = !d.path || view.t >= 1;
    const tone = atEnd || !d.path ? d.tone : view.t < 0.45 ? "idle" : d.tone;
    const pal = tone === "ok" ? PALETTES.ok : tone === "bad" ? PALETTES.fail : PALETTES.sand;
    const half = 0.62;
    const geo = blockGeometry(pos.x - half, pos.y - half, half * 2, half * 2, 16, Math.max(0, pos.z - 16));
    view.g.replaceChildren();
    view.g.setAttribute("transform", "");
    const shadow = svgEl("path", { d: shadowPath(geo.base), class: "iso-block__shadow" });
    const left = svgEl("path", { d: poly(geo.left), fill: pal.left, stroke: pal.stroke, "stroke-width": 1.1, "stroke-linejoin": "round" });
    const right = svgEl("path", { d: poly(geo.right), fill: pal.right, stroke: pal.stroke, "stroke-width": 1.1, "stroke-linejoin": "round" });
    const top = svgEl("path", { d: poly(geo.top), fill: pal.top, stroke: pal.stroke, "stroke-width": 1.1, "stroke-linejoin": "round" });
    view.g.append(shadow, left, right, top);
    const apex = geo.apex;
    const badge = svgEl("g", {
      transform: `translate(${apex.x.toFixed(1)} ${apex.y.toFixed(1)}) scale(${this.typoScale().toFixed(4)})`,
    });
    const fs = this.filmPx(TYPE.packet);
    badge.appendChild(
      svgEl("text", {
        x: 0,
        y: this.filmPx(2),
        "text-anchor": "middle",
        "dominant-baseline": "middle",
        "font-size": fs,
        class: "iso-packet__label",
      }, d.label),
    );
    if (d.check && atEnd) {
      const cy = -this.filmPx(20);
      const r = this.filmPx(8);
      badge.appendChild(svgEl("circle", { cx: 0, cy, r, class: tone === "bad" ? "iso-check is-bad" : "iso-check" }));
      const m = r * 0.55;
      badge.appendChild(
        svgEl("path", {
          d: `M${-m} ${cy + 0.4} l${m * 0.7} ${m * 0.9} l${m * 1.5} ${-m * 1.7}`,
          class: tone === "bad" ? "iso-check__mark is-bad" : "iso-check__mark",
        }),
      );
    }
    view.g.appendChild(badge);
  }

  private contentBBox(): DOMRect | null {
    const groups = [this.links, this.ents, this.packetsLayer];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const group of groups) {
      if (!group.childElementCount) continue;
      try {
        const box = group.getBBox();
        if (!box.width && !box.height) continue;
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      } catch {
        /* empty group */
      }
    }
    for (const label of this.labelDescs) {
      const p = project(label.x, label.y, label.z ?? 0);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    for (const item of this.calloutDescs) {
      const p = project(item.x, item.y, item.z ?? 0);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    if (!Number.isFinite(minX)) return null;
    return new DOMRect(minX, minY, maxX - minX, maxY - minY);
  }

  private applyCam(): void {
    this.world.setAttribute(
      "transform",
      `translate(${this.panX.toFixed(2)} ${this.panY.toFixed(2)}) scale(${this.scale.toFixed(4)})`,
    );
    this.syncTypography();
  }

  /** CSS pixels per viewBox unit (camera not included). */
  private film(): number {
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) return 1;
    return Math.min(r.width / 840, r.height / 500);
  }

  /** World units that render as `px` CSS pixels at the current camera. */
  private worldPx(px: number): number {
    return px / Math.max(this.film() * this.scale, 0.001);
  }

  /** Local units inside a group counter-scaled by 1/camera. */
  private filmPx(px: number): number {
    return px / Math.max(this.film(), 0.001);
  }

  private typoScale(): number {
    return 1 / Math.max(this.scale, 0.001);
  }

  private syncTypography(): void {
    for (const view of this.blocks.values()) {
      this.placeBlockText(
        view,
        blockGeometry(view.desc.x, view.desc.y, view.desc.w, view.desc.d, Math.max(view.h, 0.5)),
      );
    }
    this.layoutLabels();
    this.layoutCallouts();
    for (const pack of this.packetViews.values()) this.paintPacket(pack);
  }

  private buildDefs(): SVGDefsElement {
    const defs = svgEl("defs");
    return defs;
  }

  private clientToViewBox(clientX: number, clientY: number): ScreenPt {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  private clientToViewBoxDelta(dx: number, dy: number): ScreenPt {
    const r = this.svg.getBoundingClientRect();
    const p0 = this.clientToViewBox(r.left, r.top);
    const p1 = this.clientToViewBox(r.left + dx, r.top + dy);
    return { x: p1.x - p0.x, y: p1.y - p0.y };
  }
}

function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) > 127 ? 1 : 0.7;
  }
  return Math.max(units, 1);
}

function textWidth(text: string, size: number): number {
  return textUnits(text) * size;
}

function fitFont(text: string, maxW: number, maxSize: number, minSize: number): number {
  if (!text) return maxSize;
  const size = maxW / textUnits(text);
  return Math.max(minSize, Math.min(maxSize, size));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

