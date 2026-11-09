"use client";

import { useEffect, useRef } from "react";
import type * as Three from "three";
import type { TrackId } from "../data/metric-plan";
import { methodIcon, monogram } from "../data/method-icons";
import {
  add, climbHeight, climbPoint, coinRadius, COLUMN, COLUMN_COIN, columnHeight, CONTOURS, contourRadius, FLAT, forkPoint, PEAK, polar, prongPoint,
  ridgeHeight, routePoint, SNOW_PEAK, SNOW_PLATE, SNOW_SCALE, spotKey, streamX, trunkHeight, type SnowArm, type Vec,
} from "../data/snowflake";

/** Maps snowflake points (in-plane position, height z) and centre-column points (x across, y height) to the 1600 × 1000 label overlay. */
export type Projector = { plane: (point: Vec, z?: number) => Vec; column: (point: Vec, depth?: number) => Vec };
export type CrystalHover = { arm: number; prong: number; climber: number } | null;

const W = 1600;
const H = 1000;
const MOVE_MS = 1100;
/** Medallions climb into place while the camera moves; the last starts by CLIMB_MAX_DELAY and all land within MOVE_MS. */
const CLIMB_MS = 760;
const CLIMB_STAGGER = 70;
const CLIMB_MAX_DELAY = 300;
/** Height of the summit flag planted on each fork, in snowflake units. */
export const FLAG_HEIGHT = 96;
/** The flag leans a little off the arm so it reads against the trunk behind it. */
const FLAG_LEAN = 0.2;
/** Flags stand on the fork jewel, which sits this high when the arm lies flat. */
const FLAG_BASE = 8;
const TRACK_HEX: Record<TrackId, number> = { T1: 0x4a56c0, T2: 0x7650b4, T3: 0xa94b9c, T4: 0xe07d73 };
/** Podium metals: gold, silver, bronze. */
const MEDAL_HEX = [0xf2c35b, 0xd9dee8, 0xd48b57];

type Props = {
  arms: SnowArm[];
  overall: SnowArm;
  /** 0–5 a capability arm, arms.length the centre column. */
  focus: number;
  full: boolean;
  onReady: () => void;
  onSettle: (project: Projector) => void;
  onHover: (hover: CrystalHover) => void;
  onPickArm: (index: number) => void;
};
type Api = { goTo: (focus: number, full: boolean) => void };
type Mode = "arm" | "whole" | "column";
type Pose = { angle: number; position: Three.Vector3; look: Three.Vector3; up: Three.Vector3; focus: number; mode: Mode };

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The snowflake as a lit ice crystal: a glass hexagonal plate, six glass arms,
 * and per arm a four-pronged fork tinted by track. Each fork is a flagged peak
 * and its prongs are ridges running down to the plate; a method's height on
 * its ridge is its score, contour rings around the peak mark equal scores, and
 * methods are medallions carrying their organisation's mark (gold, silver and
 * bronze rims for the top three). Seen from above it is a flat snowflake; the
 * close-up looks at one peak from the side. Mist falls from the sky into
 * the centre; opened, it splits into four streams — one per track — where
 * methods stand at their mean over the six capabilities. The 2D drawing stays
 * underneath as the no-WebGL fallback.
 */
export function SnowCrystal3D({ arms, overall, focus, full, onReady, onSettle, onHover, onPickArm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<Api | null>(null);
  const callbacks = useRef({ onReady, onSettle, onHover, onPickArm });
  const target = useRef({ focus, full });
  useEffect(() => {
    callbacks.current = { onReady, onSettle, onHover, onPickArm };
  });
  useEffect(() => {
    target.current = { focus, full };
    api.current?.goTo(focus, full);
  }, [focus, full]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [THREE, { RoomEnvironment }, { mergeGeometries }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
        import("three/examples/jsm/utils/BufferGeometryUtils.js"),
      ]);
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      } catch {
        return; // keep the 2D drawing
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.transmissionResolutionScale = 0.75;

      const scene = new THREE.Scene();
      scene.background = backdrop(THREE);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
      scene.environment = environment;
      scene.environmentIntensity = 1;

      const camera = new THREE.PerspectiveCamera(30, W / H, 10, 20000);
      const key = new THREE.DirectionalLight(0xffffff, 1.45);
      key.position.set(-520, 900, 1700);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -1400, right: 1400, top: 1400, bottom: -1400, near: 100, far: 4000 });
      key.shadow.radius = 7;
      scene.add(key, new THREE.HemisphereLight(0xffffff, 0xe2ddf2, 0.6));
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.075 }));
      catcher.position.z = -170;
      catcher.receiveShadow = true;
      scene.add(catcher);

      let dirty = true;
      const columnIndex = arms.length;
      const built = buildCrystal(THREE, mergeGeometries, arms, overall, renderer.capabilities.getMaxAnisotropy(), () => { dirty = true; wake(); });
      scene.add(built.group, built.column);

      // camera choreography: a focused arm hangs straight down; the column is seen from the side
      const groupAngleFor = (index: number) => ((arms[index].angle - 90) * Math.PI) / 180;
      const near = (angle: number, previous: number) => {
        while (angle - previous > Math.PI) angle -= 2 * Math.PI;
        while (angle - previous < -Math.PI) angle += 2 * Math.PI;
        return angle;
      };
      const Y = new THREE.Vector3(0, 1, 0);
      const Z = new THREE.Vector3(0, 0, 1);
      const poseFor = (index: number, wholeView: boolean, previousAngle: number): Pose => {
        const angle = index < columnIndex ? near(groupAngleFor(index), previousAngle) : previousAngle;
        if (wholeView) return { angle, position: new THREE.Vector3(0, -720, 5380), look: new THREE.Vector3(0, 20, 0), up: Y, focus: index, mode: "whole" };
        // the column is seen from the side, with no arm straight in front of it
        if (index === columnIndex) return { angle: near(Math.PI / 6, previousAngle), position: new THREE.Vector3(0, -3250, 920), look: new THREE.Vector3(0, 0, 640), up: Z, focus: index, mode: "column" };
        // a peak seen from the side, its ridges running down toward the camera; panned left a little, where two tracks of callouts sit
        return { angle, position: new THREE.Vector3(-20, -2860, 740), look: new THREE.Vector3(-20, -960, 262), up: Z, focus: index, mode: "arm" };
      };
      const startedAt = performance.now();
      let from = poseFor(target.current.focus, target.current.full, 0);
      let to = from;
      // the first view plays like an arrival: medallions climb in, labels wait for them
      let moveStart = reduce ? -Infinity : startedAt;
      let climbStart = moveStart;
      let settled = false;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;
      const eye = new THREE.Vector3();
      const look = new THREE.Vector3();
      const up = new THREE.Vector3();
      const localEye = new THREE.Vector3();
      const localTurn = new THREE.Quaternion();
      const toward = new THREE.Vector3();
      const lifted = new THREE.Vector3();
      const footing = new THREE.Vector3();

      function applyPose(progress: number, now: number) {
        const e = easeInOut(progress);
        const angle = from.angle + (to.angle - from.angle) * e;
        built.group.rotation.z = angle;
        const blend = (mode: Mode) => (from.mode === mode ? 1 - e : 0) + (to.mode === mode ? e : 0);
        const whole = blend("whole");
        const column = blend("column");
        // the opened arm rises into a peak; flags lie screen-up in the view from above and stand up in the side views
        const raise = arms.map((_, index) => (to.mode === "arm" && to.focus === index ? e : 0) + (from.mode === "arm" && from.focus === index ? 1 - e : 0));
        built.setRaise(raise);
        built.flags.forEach((flag, index) => {
          const shown = Math.max(whole, raise[index]);
          flag.visible = shown > 0.01;
          flag.scale.setScalar(Math.max(shown, 0.01) * (1 + whole * 0.7));
          flag.rotation.set((1 - whole) * (Math.PI / 2), 0, -angle - FLAG_LEAN * whole);
        });
        eye.lerpVectors(from.position, to.position, e);
        look.lerpVectors(from.look, to.look, e);
        up.lerpVectors(from.up, to.up, e).normalize();
        // poses are framed for 16:10; a narrower canvas backs the camera off, though not all the way,
        // since phones label less and the crystal should stay large
        const stretch = Math.max(1, W / H / camera.aspect) ** 0.55;
        camera.position.copy(eye).sub(look).multiplyScalar(stretch).add(look);
        camera.up.copy(up);
        camera.lookAt(look);
        camera.updateMatrixWorld();
        built.group.updateMatrixWorld();
        // medallions climb (those of the view being opened rise from the foot of their route),
        // face the camera, and stand a little in front of their ridge
        localEye.copy(camera.position);
        built.group.worldToLocal(localEye);
        localTurn.copy(built.group.quaternion).invert().multiply(camera.quaternion);
        // only the open view's medallions show in a side view; the view from above shows every arm's
        const shownIn = (pose: Pose, arm: number) => pose.mode === "whole" ? arm < columnIndex : pose.focus === arm;
        for (const climber of built.climbers) {
          climber.object.visible = shownIn(to, climber.arm) || (e < 1 && shownIn(from, climber.arm));
          const opening = !target.current.full && climber.arm === to.focus;
          const p = opening && !reduce ? clamp01((now - climbStart - climber.delay) / CLIMB_MS) : 1;
          const r = climber.arm < columnIndex ? raise[climber.arm] : 0;
          lifted.lerpVectors(climber.spot[0], climber.spot[1], r);
          footing.lerpVectors(climber.foot[0], climber.foot[1], r);
          const at = climber.object.position.lerpVectors(footing, lifted, easeOut(p));
          climber.object.scale.setScalar((climber.object.userData.hovered ? 1.18 : 1) * (1 + (PEAK.coinScale - 1) * r));
          if (climber.arm === columnIndex) continue;
          at.addScaledVector(toward.subVectors(localEye, at).normalize(), 18);
          climber.object.quaternion.copy(localTurn);
        }
        built.setColumn(column, whole, camera);
      }

      function projector(): Projector {
        const cam = camera.clone();
        const matrix = built.group.matrixWorld.clone();
        const v = new THREE.Vector3();
        const screen = () => ({ x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H });
        return {
          plane: (point, z = 0) => { v.set(point.x, -point.y, z).applyMatrix4(matrix).project(cam); return screen(); },
          column: (point, depth = 0) => { v.set(point.x, depth, point.y).project(cam); return screen(); },
        };
      }

      const settle = () => {
        if (settled) return;
        applyPose(1, Infinity);
        settled = true;
        callbacks.current.onSettle(projector());
      };
      api.current = {
        goTo(nextFocus, nextFull) {
          const now = performance.now();
          const progress = Math.min(1, (now - moveStart) / MOVE_MS);
          applyPose(progress, now);
          const showing = progress < 0.5 ? from : to;
          from = { ...showing, angle: built.group.rotation.z, position: eye.clone(), look: look.clone(), up: up.clone() };
          to = poseFor(nextFocus, nextFull, built.group.rotation.z);
          moveStart = reduce ? -Infinity : now;
          climbStart = moveStart;
          settled = false;
          wake();
          // frames pause in background tabs; settle the labels on time regardless
          clearTimeout(settleTimer);
          settleTimer = setTimeout(settle, (reduce ? 0 : MOVE_MS) + 120);
        },
      };
      settleTimer = setTimeout(settle, (reduce ? 0 : MOVE_MS) + 120);

      function resize() {
        const box = host!.getBoundingClientRect();
        renderer.setSize(box.width, box.height, false);
        camera.aspect = box.width / Math.max(box.height, 1);
        camera.updateProjectionMatrix();
        built.setPointScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan((camera.fov * Math.PI) / 360)), renderer.getPixelRatio());
        settled = false;
        wake();
      }

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let hovered = "";
      let hoveredCoin: Three.Object3D | null = null;
      const pointerAt = (event: PointerEvent) => {
        const box = canvas!.getBoundingClientRect();
        ndc.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
        return box;
      };
      const onMove = (event: PointerEvent) => {
        pointerAt(event);
        raycaster.setFromCamera(ndc, camera);
        const object = raycaster.intersectObjects(built.pickable, false).find((hit) => hit.object.parent?.visible !== false)?.object;
        const hit = object?.userData as CrystalHover | undefined;
        const id = hit ? `${hit.arm}:${hit.prong}:${hit.climber}` : "";
        canvas!.style.cursor = hit || target.current.full ? "pointer" : "default";
        if (id !== hovered) {
          hovered = id;
          if (hoveredCoin) hoveredCoin.userData.hovered = false;
          hoveredCoin = object?.parent ?? null;
          if (hoveredCoin) hoveredCoin.userData.hovered = true;
          dirty = true;
          wake();
          callbacks.current.onHover(hit ?? null);
        }
      };
      const onLeave = () => {
        if (!hovered) return;
        hovered = "";
        if (hoveredCoin) hoveredCoin.userData.hovered = false;
        hoveredCoin = null;
        dirty = true;
        wake();
        callbacks.current.onHover(null);
      };
      const onClick = (event: PointerEvent) => {
        if (!target.current.full) return;
        const box = pointerAt(event);
        const project = projector();
        const click = { x: ((event.clientX - box.left) / box.width) * W, y: ((event.clientY - box.top) / box.height) * H };
        const centre = project.plane({ x: 0, y: 0 });
        if (Math.hypot(centre.x - click.x, centre.y - click.y) < 150) { callbacks.current.onPickArm(columnIndex); return; }
        let best = -1;
        let bestDistance = Infinity;
        arms.forEach((arm, index) => {
          const fork = project.plane(forkPoint(arm));
          const distance = Math.hypot(fork.x - click.x, fork.y - click.y);
          if (distance < bestDistance) { bestDistance = distance; best = index; }
        });
        if (best >= 0 && bestDistance < 260) callbacks.current.onPickArm(best);
      };

      let raf = 0;
      let running = false;
      let visible = true;
      let frameCount = 0;
      function render(now: number) {
        const progress = Math.min(1, (now - moveStart) / MOVE_MS);
        applyPose(progress, now);
        if (!reduce) {
          const t = (now - startedAt) / 1000;
          scene.environmentRotation.y = t * 0.05; // reflections drift; geometry (and labels) stay put
          key.position.x = -520 + Math.sin(t * 0.25) * 160;
          built.animate(t);
        }
        renderer.render(scene, camera);
        dirty = false;
        if (!settled && progress >= 1) settle();
        if (++frameCount === 1) callbacks.current.onReady();
      }
      let tick = 0;
      function loop(now: number) {
        // once settled only reflections, mist and flags move, so half rate is plenty
        if (!settled || dirty || (++tick & 1) === 0) render(now);
        const idle = reduce && settled && !dirty;
        if (visible && !idle) raf = requestAnimationFrame(loop);
        else running = false;
      }
      function wake() {
        if (running || !visible || disposed) return;
        running = true;
        raf = requestAnimationFrame(loop);
      }

      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) wake(); else { cancelAnimationFrame(raf); running = false; }
      });
      io.observe(host);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("click", onClick as EventListener);
      wake();

      cleanup = () => {
        cancelAnimationFrame(raf);
        clearTimeout(settleTimer);
        io.disconnect();
        resizeObserver.disconnect();
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("click", onClick as EventListener);
        built.disposables.forEach((item) => item.dispose());
        catcher.geometry.dispose();
        (catcher.material as Three.Material).dispose();
        environment.dispose();
        pmrem.dispose();
        (scene.background as Three.Texture | null)?.dispose();
        renderer.dispose();
        api.current = null;
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, [arms, overall]); // built once per data set; focus changes go through api.goTo

  return <canvas ref={canvasRef} className="snowCrystal" aria-hidden="true"/>;
}

/** Studio backdrop: a soft paper gradient, a faint measuring grid, and the homepage ring as a whisper of colour for the glass. */
function backdrop(THREE: typeof Three) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const paper = ctx.createLinearGradient(0, 0, 0, height);
  paper.addColorStop(0, "#fcfcfe");
  paper.addColorStop(0.62, "#f4f3f9");
  paper.addColorStop(1, "#ebe9f3");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  const pools: [number, number, number, string][] = [
    [0.08, 0.95, 620, "rgba(74,86,192,0.10)"],
    [0.94, 0.92, 560, "rgba(224,125,115,0.10)"],
    [0.92, 0.06, 460, "rgba(83,223,228,0.07)"],
    [0.5, 0.42, 640, "rgba(255,255,255,0.9)"],
  ];
  for (const [x, y, r, color] of pools) {
    const g = ctx.createRadialGradient(x * width, y * height, 0, x * width, y * height, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  // measuring grid, strongest in the middle
  ctx.save();
  const fade = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.55);
  fade.addColorStop(0, "rgba(74,86,192,0.075)");
  fade.addColorStop(1, "rgba(74,86,192,0)");
  ctx.strokeStyle = fade;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = width / 2 % 40; x < width; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); }
  for (let y = height / 2 % 40; y < height; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(width, y + 0.5); }
  ctx.stroke();
  ctx.restore();
  // the homepage's iridescent ring, softly blurred, for the glass to refract
  ctx.save();
  ctx.filter = "blur(26px)";
  ctx.globalAlpha = 0.24;
  const ring = ctx.createConicGradient(-Math.PI / 2, width / 2, height / 2);
  for (const [stop, color] of BRAND_STOPS) ring.addColorStop(stop, color);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 360, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Logo gradient, indigo → violet → magenta → coral → amber → cyan. */
const BRAND_STOPS: [number, string][] = [
  [0, "#4a56c0"], [0.2, "#7650b4"], [0.4, "#a94b9c"], [0.6, "#e07d73"], [0.75, "#f0a24a"], [0.88, "#53dfe4"], [1, "#4a56c0"],
];

/** Sweeps the brand gradient around the centre as vertex colours, fading to white inward. */
function paintBrandSweep(THREE: typeof Three, geometry: Three.BufferGeometry, radius: number, whiteness: number) {
  const stops = BRAND_STOPS.map(([stop, hex]) => [stop, new THREE.Color(hex)] as const);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const t = ((Math.atan2(y, x) / (Math.PI * 2)) + 1.25) % 1;
    const upper = stops.findIndex(([stop]) => stop >= t);
    const [s1, c1] = stops[Math.max(1, upper)];
    const [s0, c0] = stops[Math.max(1, upper) - 1];
    color.copy(c0).lerp(c1, (t - s0) / Math.max(s1 - s0, 1e-6));
    color.lerp(white, whiteness + (1 - whiteness) * (1 - Math.min(1, Math.hypot(x, y) / radius)) * 0.6);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Medallion face: the organisation's mark on white, or a monogram on the track colour. */
function faceTexture(THREE: typeof Three, label: string, track: TrackId, anisotropy: number, onLoad: () => void) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const icon = methodIcon(label);
  const paint = (image?: HTMLImageElement) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    if (icon && image) {
      if (icon.bleed) ctx.drawImage(image, 0, 0, size, size);
      else ctx.drawImage(image, size * 0.16, size * 0.16, size * 0.68, size * 0.68);
    } else {
      const hex = `#${TRACK_HEX[track].toString(16).padStart(6, "0")}`;
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, hex);
      g.addColorStop(1, "#1d1c2b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${size * 0.34}px Inter, "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(monogram(label), size / 2, size / 2 + size * 0.02);
    }
    texture.needsUpdate = true;
  };
  paint();
  if (icon) {
    const image = new Image();
    image.decoding = "async";
    image.src = icon.src;
    image.decode().then(() => { paint(image); onLoad(); }).catch(() => {}); // keep the monogram
  }
  return texture;
}

/** The pennant: brand coral into amber, with a fine light hem. */
function pennantTexture(THREE: typeof Three) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 128, 64);
  g.addColorStop(0, "#e2685f");
  g.addColorStop(0.55, "#ec8a57");
  g.addColorStop(1, "#f4b04e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(0, 0, 128, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft white glow for the sky the mist falls from. */
function glowTexture(THREE: typeof Three) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(236,232,255,0.55)");
  g.addColorStop(1, "rgba(236,232,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Points shaders. Mist falls from the sky into the plate: as one swirling column in the whole view,
// split into four track streams (uMorph = 1) when the column is opened. Snow drifts slowly everywhere.
const MIST_VERTEX = /* glsl */ `
uniform float uTime, uTop, uFloor, uMorph, uScale, uSize, uMax;
attribute vec4 aSeed;   // jitter x, jitter y, phase, speed
attribute vec2 aSwirl;  // angle, radius in the single column
attribute float aStream;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float fall = fract(aSeed.z + uTime * aSeed.w);
  float spread = 1.0 + fall * 1.5;
  vec2 stream = vec2(aStream + aSeed.x * 19.0 * spread, aSeed.y * 19.0 * spread);
  float angle = aSwirl.x + uTime * 0.35 + fall * 2.6;
  vec2 swirl = vec2(cos(angle), sin(angle)) * aSwirl.y * (1.0 - 0.6 * fall);
  vec3 p = vec3(mix(swirl, stream, uMorph), mix(uTop, uFloor, fall));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = min(uSize * (0.6 + aSeed.w * 6.0) * uScale / -mv.z, uMax);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vAlpha = smoothstep(0.0, 0.14, fall) * (1.0 - smoothstep(0.86, 1.0, fall));
}`;
const SNOW_VERTEX = /* glsl */ `
uniform float uTime, uScale, uSize, uMax;
uniform vec3 uDown;     // falls toward the bottom of the screen in every view
attribute vec4 aSeed;   // x, y, z, speed
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 base = aSeed.xyz;
  float along = dot(base, uDown);
  float travel = mod(along + uTime * aSeed.w * 60.0 + 2200.0, 4400.0) - 2200.0;
  vec3 p = base + uDown * (travel - along) + vec3(sin(uTime * 0.5 + base.z * 0.01) * 40.0, 0.0, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = min(uSize * (0.7 + aSeed.w) * uScale / -mv.z, uMax);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vAlpha = 1.0 - smoothstep(1700.0, 2200.0, abs(travel));
}`;
const DOT_FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, smoothstep(0.5, 0.08, d) * vAlpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

type Merge = (geometries: Three.BufferGeometry[]) => Three.BufferGeometry | null;
/** A medallion: it climbs from `foot` to `spot`, each blended from its flat to its raised position by its arm's raise (the column's two are the same). */
type ClimberObject = { object: Three.Object3D; foot: [Three.Vector3, Three.Vector3]; spot: [Three.Vector3, Three.Vector3]; arm: number; delay: number };

function buildCrystal(THREE: typeof Three, mergeGeometries: Merge, arms: SnowArm[], overall: SnowArm, anisotropy: number, onTexture: () => void) {
  const to3 = (p: Vec, z = 0) => new THREE.Vector3(p.x, -p.y, z);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item; };
  const prism = (a: Three.Vector3, b: Three.Vector3, r0: number, r1: number, sides = 6) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const geometry = new THREE.CylinderGeometry(r1, r0, dir.length(), sides, 1);
    geometry.translate(0, dir.length() / 2, 0);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(yAxis, dir.normalize()));
    geometry.translate(a.x, a.y, a.z);
    return geometry.toNonIndexed();
  };
  const octa = (at: Three.Vector3, radius: number) => {
    const geometry = new THREE.OctahedronGeometry(radius, 0);
    geometry.translate(at.x, at.y, at.z);
    return geometry;
  };
  /** Flat hexagonal jewel lying in the plane, one vertex along `angle`. */
  const hexJewel = (at: Three.Vector3, radius: number, depth: number, angle: number) => {
    const geometry = new THREE.CylinderGeometry(radius * 0.82, radius, depth, 6, 1);
    geometry.rotateX(Math.PI / 2);
    geometry.rotateZ(Math.PI / 2 - (angle * Math.PI) / 180);
    geometry.translate(at.x, at.y, at.z);
    return geometry.toNonIndexed();
  };
  const merged = (parts: Three.BufferGeometry[]) => {
    const geometry = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    return keep(geometry);
  };
  const glass = (tint: number, distance: number, roughness: number, thickness = 30) => keep(new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness, transmission: 1, thickness, ior: 1.31,
    attenuationColor: new THREE.Color(tint), attenuationDistance: distance,
    iridescence: 0.5, iridescenceIOR: 1.3, iridescenceThicknessRange: [220, 640],
    clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1,
  }));
  const mesh = (geometry: Three.BufferGeometry, material: Three.Material, shadow = true) => {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = shadow;
    return item;
  };

  const group = new THREE.Group();
  const pickable: Three.Mesh[] = [];
  const climbers: ClimberObject[] = [];

  // layered hexagonal plate: clear outer plate, raised inner plate, faceted centre gem
  const hexShape = (radius: number) => new THREE.Shape(arms.map((arm) => {
    const p = to3(polar(radius, arm.angle));
    return new THREE.Vector2(p.x, p.y);
  }));
  const outer = keep(new THREE.ExtrudeGeometry(hexShape(SNOW_PLATE), { depth: 24, bevelEnabled: true, bevelThickness: 10, bevelSize: 16, bevelSegments: 4 }));
  outer.translate(0, 0, -12);
  const inner = keep(new THREE.ExtrudeGeometry(hexShape(SNOW_PLATE * 0.56), { depth: 12, bevelEnabled: true, bevelThickness: 6, bevelSize: 8, bevelSegments: 3 }));
  inner.translate(0, 0, 14);
  const facet = keep(new THREE.CylinderGeometry(0, 96, 36, 6, 1));
  facet.rotateX(Math.PI / 2);
  facet.rotateZ(Math.PI / 6 + (arms[0].angle * Math.PI) / 180);
  facet.translate(0, 0, 50);
  paintBrandSweep(THREE, outer, SNOW_PLATE, 0.5);
  paintBrandSweep(THREE, inner, SNOW_PLATE * 0.56, 0.62);
  const sweptGlass = (roughness: number, thickness: number) => {
    const material = glass(0xd9d3fb, 560, roughness, thickness);
    material.vertexColors = true;
    material.iridescence = 0.9;
    return material;
  };
  group.add(mesh(outer, sweptGlass(0.06, 60)));
  group.add(mesh(inner, sweptGlass(0.16, 30)));
  group.add(mesh(facet, glass(0xa99cf0, 240, 0.02, 40)));
  // fine etched rules: two hexagonal rings and six spokes
  const etch: Three.BufferGeometry[] = [];
  for (const ring of [0.48, 0.9]) {
    for (let i = 0; i < 6; i++) etch.push(prism(to3(polar(SNOW_PLATE * ring, arms[i].angle), 13), to3(polar(SNOW_PLATE * ring, arms[(i + 1) % 6].angle), 13), 1.6, 1.6));
  }
  for (const arm of arms) etch.push(prism(to3(polar(70, arm.angle), 33), to3(polar(SNOW_PLATE * 0.56, arm.angle), 33), 2, 1));
  const etchMaterial = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0, transmission: 0.25, thickness: 4, clearcoat: 0.6 }));
  group.add(mesh(merged(etch), etchMaterial, false));

  // arms: each is built twice — lying flat, and raised so its fork is a peak with ridges running down to
  // the plate — and morphs between the two. Seen from above the snowflake is flat; opening an arm raises its peak.
  // side branches under a snowflake's envelope: longest a third of the way out, tapering to the fork
  const BRANCHES = [
    { r: 446, len: 150, w: 8.5 }, { r: 504, len: 196, w: 9.5 }, { r: 562, len: 170, w: 8.5 },
    { r: 618, len: 128, w: 7 }, { r: 670, len: 86, w: 5.5 }, { r: 716, len: 48, w: 4 },
  ];
  const trunkMaterial = glass(0x9f93ec, 260, 0.05);
  const jewelMaterial = glass(0x9d8ff0, 200, 0.02, 40);
  const leafMaterial = glass(0xc9c0f6, 420, 0.12, 10);
  const pendingTrack = (track: TrackId) => arms.every((arm) => arm.prongs.find((prong) => prong.track === track)!.pending);
  const ridgeMaterials = new Map(arms[0].prongs.map((prong) => [prong.track,
    pendingTrack(prong.track) ? glass(TRACK_HEX[prong.track], 760, 0.42) : glass(TRACK_HEX[prong.track], 270, 0.04)]));
  const coreMaterials = new Map(arms[0].prongs.map((prong) => [prong.track,
    keep(new THREE.MeshStandardMaterial({ color: TRACK_HEX[prong.track], roughness: 0.3, metalness: 0.2, emissive: TRACK_HEX[prong.track], emissiveIntensity: 0.12 }))]));
  // contour arcs around each peak at their score's height, one material per level so a pulse can run down them
  const arcSpan = (120 * Math.PI) / 180;
  const peakArcSpan = (166 * Math.PI) / 180; // the raised routes reach ±64°
  const contourMaterials = CONTOURS.map(() => keep(new THREE.MeshBasicMaterial({ color: 0x8b82c9, transparent: true, opacity: 0.32, depthWrite: false })));
  const armMeshes: Three.Mesh[][] = arms.map(() => []);
  /** One mesh per arm and material whose geometry morphs from flat (influence 0) to raised (influence 1). */
  const raising = (armIndex: number, material: Three.Material, build: (lift: number) => Three.BufferGeometry[], shadow = true) => {
    const flat = merged(build(0));
    const parts = build(1);
    const raised = mergeGeometries(parts)!;
    parts.forEach((part) => part.dispose());
    flat.morphAttributes.position = [raised.getAttribute("position")];
    flat.morphAttributes.normal = [raised.getAttribute("normal")];
    const item = mesh(flat, material, shadow);
    item.morphTargetInfluences = [0];
    group.add(item);
    armMeshes[armIndex].push(item);
  };
  arms.forEach((arm, armIndex) => {
    const fork = forkPoint(arm);
    // the trunk climbs from the plate's rim to the summit; its branches stay level
    raising(armIndex, trunkMaterial, (lift) => {
      const parts = [prism(to3(polar(SNOW_PLATE - 24, arm.angle), 0), to3(fork, SNOW_PEAK * lift), 18, 10)];
      for (const { r, len, w } of BRANCHES) {
        const base = polar(r, arm.angle);
        const z = trunkHeight(r) * lift;
        for (const side of [1, -1]) {
          const direction = arm.angle + side * 60;
          parts.push(prism(to3(base, z), to3(add(base, polar(len, direction)), z), w, 1.4));
          // fern-like twigs on both sides of every long branch, shortening toward its tip
          if (len > 80) {
            for (const f of [0.3, 0.52, 0.74]) {
              const at = add(base, polar(len * f, direction));
              const twig = len * 0.38 * (1.15 - f);
              parts.push(prism(to3(at, z), to3(add(at, polar(twig, arm.angle)), z), 2.8, 0.7));
              parts.push(prism(to3(at, z), to3(add(at, polar(twig * 0.75, direction + side * 60)), z), 2.4, 0.7));
            }
          }
        }
      }
      return parts;
    });
    raising(armIndex, jewelMaterial, (lift) => [
      ...BRANCHES.filter(({ len }) => len > 120).flatMap(({ r, len }) => [1, -1].map((side) =>
        octa(to3(add(polar(r, arm.angle), polar(len, arm.angle + side * 60)), trunkHeight(r) * lift), 6))),
      hexJewel(to3(polar(518, arm.angle), trunkHeight(518) * lift), 38, 14, arm.angle),
      hexJewel(to3(fork, SNOW_PEAK * lift), 26, 16, arm.angle),
    ]);
    // a sectored leaf on each side of the trunk, like the broad plates of a stellar snowflake
    raising(armIndex, leafMaterial, (lift) => [1, -1].map((side) => {
      const corners = [polar(SNOW_PLATE - 10, arm.angle), add(polar(470, arm.angle), polar(92, arm.angle + side * 60)), polar(560, arm.angle)];
      const shape = new THREE.Shape(corners.map((p) => { const q = to3(p); return new THREE.Vector2(q.x, q.y); }));
      const leaf = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelThickness: 2, bevelSize: 3, bevelSegments: 1 });
      // tilt the leaf up the ridge with the arm: lift each vertex by the trunk's height at its radius
      const position = leaf.getAttribute("position");
      for (let i = 0; i < position.count; i++) position.setZ(i, position.getZ(i) + trunkHeight(Math.hypot(position.getX(i), position.getY(i))) * lift);
      leaf.computeVertexNormals();
      return leaf.toNonIndexed();
    }));
    // ridges: tinted glass per track with quarter-mark twigs, and a solid core from the foot up to the leader's height;
    // raised, the routes also fan out wider and run longer (the PEAK layout)
    const layoutFor = (lift: number) => (lift ? PEAK : FLAT);
    arm.prongs.forEach((prong) => {
      raising(armIndex, ridgeMaterials.get(prong.track)!, (lift) => {
        const layout = layoutFor(lift);
        const direction = arm.angle + layout.offsets[prong.track];
        const end = routePoint(arm, prong, 1, layout);
        return [
          prism(to3(fork, SNOW_PEAK * lift), to3(end, 0), 8.5, 3.5),
          ...[{ t: 0.25, len: 34 }, { t: 0.5, len: 27 }, { t: 0.75, len: 19 }].flatMap(({ t, len }) => {
            const base = routePoint(arm, prong, t, layout);
            const z = ridgeHeight(PEAK.reach * t) * lift;
            return [1, -1].map((side) => prism(to3(base, z), to3(add(base, polar(len, direction + side * 60)), z), 3, 1));
          }),
          octa(to3(end, 0), 12),
        ];
      });
      if (prong.best !== null) {
        const reach = Math.max(0.02, Math.min(1, prong.best / SNOW_SCALE));
        raising(armIndex, coreMaterials.get(prong.track)!, (lift) => [prism(to3(routePoint(arm, prong, 1, layoutFor(lift)), 0),
          to3(climbPoint(arm, prong, reach, layoutFor(lift)), climbHeight(reach) * lift), 3.6, 3.6 - 1.2 * reach, 10)]);
      }
    });
    CONTOURS.forEach((level, k) => {
      raising(armIndex, contourMaterials[k], (lift) => {
        const span = lift ? peakArcSpan : arcSpan;
        const arc = new THREE.TorusGeometry(contourRadius(level, layoutFor(lift)), 1.3, 4, 72, span);
        arc.rotateZ((-arm.angle * Math.PI) / 180 - span / 2);
        const centre = to3(fork, ridgeHeight(contourRadius(level, PEAK)) * lift + 2);
        arc.translate(centre.x, centre.y, centre.z);
        return [arc.toNonIndexed()];
      }, false);
    });
  });

  // medallions: shared unit geometry, scaled per method
  const coinBody = keep(new THREE.CylinderGeometry(1, 1, 1, 64, 1));
  coinBody.rotateX(Math.PI / 2);
  const coinFace = keep(new THREE.CircleGeometry(1, 64));
  const bezel = keep(new THREE.TorusGeometry(1, 0.07, 12, 64));
  // medallions draw after the glass and the mist, ignoring depth, so nothing in the crystal ever veils a logo
  const onTop = { transparent: true, depthTest: false, depthWrite: false };
  const metals = MEDAL_HEX.map((hex) => keep(new THREE.MeshPhysicalMaterial({ color: hex, metalness: 1, roughness: 0.18, clearcoat: 0.7, clearcoatRoughness: 0.1, ...onTop })));
  const finialMaterial = keep(new THREE.MeshPhysicalMaterial({ color: MEDAL_HEX[0], metalness: 1, roughness: 0.18, clearcoat: 0.7 }));
  const enamels: Partial<Record<TrackId, Three.MeshPhysicalMaterial>> = {};
  const enamel = (track: TrackId) => (enamels[track] ??= keep(new THREE.MeshPhysicalMaterial({ color: TRACK_HEX[track], roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, ...onTop })));
  const faces = new Map<string, Three.MeshStandardMaterial>();
  const faceMaterial = (label: string, track: TrackId) => {
    const key = `${methodIcon(label)?.src ?? `${label}:${track}`}`;
    if (!faces.has(key)) {
      const map = keep(faceTexture(THREE, label, track, anisotropy, onTexture));
      faces.set(key, keep(new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.32, metalness: 0, ...onTop })));
    }
    return faces.get(key)!;
  };
  const coin = (radius: number, rank: number, track: TrackId, label: string, info: NonNullable<CrystalHover>) => {
    const item = new THREE.Group();
    const rim = rank <= 3 ? metals[rank - 1] : enamel(track);
    const order = 1000 + (12 - Math.min(rank, 12)) * 3; // leaders on top of the medallions they overlap
    const body = mesh(coinBody, rim, false);
    body.scale.set(radius, radius, 7);
    body.renderOrder = order;
    const face = mesh(coinFace, faceMaterial(label, track), false);
    face.scale.setScalar(radius * 0.8);
    face.position.z = 3.6;
    face.renderOrder = order + 1;
    body.userData = info;
    face.userData = info;
    item.add(body, face);
    if (rank <= 3) {
      const ring = mesh(bezel, rim, false);
      ring.scale.setScalar(radius * 0.86);
      ring.position.z = 3.7;
      ring.renderOrder = order + 2;
      item.add(ring);
    }
    pickable.push(body, face);
    return item;
  };

  // summit flags, one per arm on its fork: a shared waving pennant tapering to a point
  const pennantWidth = 56;
  const pennantHeight = 34;
  const pennant = keep(new THREE.PlaneGeometry(pennantWidth, pennantHeight, 12, 2));
  const cloth = pennant.getAttribute("position");
  for (let i = 0; i < cloth.count; i++) cloth.setY(i, cloth.getY(i) * (1 - 0.94 * (cloth.getX(i) / pennantWidth + 0.5)));
  pennant.translate(pennantWidth / 2, FLAG_HEIGHT - pennantHeight / 2 - 1, 0);
  const rest = Float32Array.from(pennant.getAttribute("position").array);
  const pennantMaterial = keep(new THREE.MeshStandardMaterial({ map: keep(pennantTexture(THREE)), side: THREE.DoubleSide, roughness: 0.55, metalness: 0 }));
  const pole = keep(new THREE.CylinderGeometry(2, 2.6, FLAG_HEIGHT + 6, 12));
  pole.translate(0, (FLAG_HEIGHT + 6) / 2, 0);
  const finial = keep(new THREE.SphereGeometry(5, 24, 14));
  finial.translate(0, FLAG_HEIGHT + 9, 0);
  const poleMaterial = keep(new THREE.MeshPhysicalMaterial({ color: 0x2b2942, metalness: 0.75, roughness: 0.28, clearcoat: 0.5 }));
  const flags = arms.map((arm) => {
    const flag = new THREE.Group();
    flag.position.copy(to3(forkPoint(arm), FLAG_BASE)); // planted on the fork jewel; rises with the peak
    flag.rotation.order = "ZYX"; // stand it up first, then turn it with the arm
    flag.add(mesh(pole, poleMaterial), mesh(finial, finialMaterial), mesh(pennant, pennantMaterial));
    group.add(flag);
    return flag;
  });

  // medallions for methods: flat on the snowflake, at their score's height on a raised peak
  arms.forEach((arm, armIndex) => arm.prongs.forEach((prong, prongIndex) => {
    prong.climbers.forEach((climber, climberIndex) => {
      const item = coin(coinRadius(climber.rank), climber.rank, prong.track, climber.label, { arm: armIndex, prong: prongIndex, climber: climberIndex });
      const key = spotKey(prong, climber);
      const spot: [Three.Vector3, Three.Vector3] = [to3(arm.spots.get(key)!, 0), to3(arm.peakSpots.get(key)!, climbHeight(climber.t))];
      item.position.copy(spot[0]);
      group.add(item);
      climbers.push({ object: item, foot: [to3(prongPoint(arm, prong, 1), 0), to3(routePoint(arm, prong, 1, PEAK), 0)], spot, arm: armIndex, delay: Math.min((climber.rank - 1) * CLIMB_STAGGER, CLIMB_MAX_DELAY) });
    });
  }));

  /** Raise each arm's peak by its own amount (0 flat, 1 a full peak). */
  function setRaise(raise: number[]) {
    armMeshes.forEach((meshes, index) => { for (const item of meshes) item.morphTargetInfluences![0] = raise[index]; });
    flags.forEach((flag, index) => { flag.position.z = FLAG_BASE + SNOW_PEAK * raise[index]; });
  }

  // ------------------------------------------------------------ the centre column (scene space, unrotated)
  const column = new THREE.Group();
  const top = COLUMN.floor + COLUMN.height + 120;
  const colour = (hex: number, lift: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), lift);
  // mist: per track a stream; pending tracks fall thin and pale
  const mistCounts = overall.prongs.map((prong) => (prong.pending ? 140 : 620));
  const total = mistCounts.reduce((sum, n) => sum + n, 0);
  const mist = new THREE.BufferGeometry();
  const seeds = new Float32Array(total * 4);
  const swirl = new Float32Array(total * 2);
  const streams = new Float32Array(total);
  const colors = new Float32Array(total * 3);
  let n = 0;
  overall.prongs.forEach((prong, index) => {
    const tint = colour(TRACK_HEX[prong.track], prong.pending ? 0.7 : 0.25);
    for (let i = 0; i < mistCounts[index]; i++, n++) {
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      seeds.set([gauss(), gauss(), Math.random(), 0.12 + Math.random() * 0.1], n * 4);
      swirl.set([Math.random() * Math.PI * 2, 24 + Math.sqrt(Math.random()) * 120], n * 2);
      streams[n] = streamX(index);
      colors.set([tint.r, tint.g, tint.b], n * 3);
    }
  });
  mist.setAttribute("position", new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  mist.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  mist.setAttribute("aSwirl", new THREE.BufferAttribute(swirl, 2));
  mist.setAttribute("aStream", new THREE.BufferAttribute(streams, 1));
  mist.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  const mistUniforms = { uTime: { value: 0 }, uTop: { value: top }, uFloor: { value: 40 }, uMorph: { value: 0 }, uScale: { value: 1000 }, uSize: { value: 10 }, uMax: { value: 24 }, uOpacity: { value: 0.75 } };
  const mistMaterial = keep(new THREE.ShaderMaterial({ uniforms: mistUniforms, vertexShader: MIST_VERTEX, fragmentShader: DOT_FRAGMENT, transparent: true, depthWrite: false }));
  const mistPoints = new THREE.Points(keep(mist), mistMaterial);
  mistPoints.frustumCulled = false;
  column.add(mistPoints);

  // ambient snow drifting through the whole scene
  const snowCount = 170;
  const snow = new THREE.BufferGeometry();
  const snowSeeds = new Float32Array(snowCount * 4);
  const snowColors = new Float32Array(snowCount * 3);
  const flake = new THREE.Color(0xc9c2ee);
  for (let i = 0; i < snowCount; i++) {
    snowSeeds.set([(Math.random() - 0.5) * 5600, (Math.random() - 0.5) * 4400, -150 + Math.random() * 1500, 0.25 + Math.random() * 0.75], i * 4);
    snowColors.set([flake.r, flake.g, flake.b], i * 3);
  }
  snow.setAttribute("position", new THREE.BufferAttribute(new Float32Array(snowCount * 3), 3));
  snow.setAttribute("aSeed", new THREE.BufferAttribute(snowSeeds, 4));
  snow.setAttribute("aColor", new THREE.BufferAttribute(snowColors, 3));
  const snowUniforms = { uTime: { value: 0 }, uScale: { value: 1000 }, uSize: { value: 14 }, uMax: { value: 14 }, uOpacity: { value: 0.55 }, uDown: { value: new THREE.Vector3(0, -1, 0) } };
  const snowPoints = new THREE.Points(keep(snow), keep(new THREE.ShaderMaterial({ uniforms: snowUniforms, vertexShader: SNOW_VERTEX, fragmentShader: DOT_FRAGMENT, transparent: true, depthWrite: false })));
  snowPoints.frustumCulled = false;
  column.add(snowPoints);

  // contour rings around the column, and the summit ring at 100
  const levels = [...CONTOURS, SNOW_SCALE];
  const ringMaterials = levels.map(() => keep(new THREE.MeshBasicMaterial({ color: 0x8b82c9, transparent: true, opacity: 0.3, depthWrite: false })));
  const ringGeometry = keep(new THREE.TorusGeometry(COLUMN.ring, 1.6, 6, 128));
  const summitRing = keep(new THREE.TorusGeometry(COLUMN.ring, 3, 8, 128));
  const rings = levels.map((level, k) => {
    const ring = new THREE.Mesh(level === SNOW_SCALE ? summitRing : ringGeometry, ringMaterials[k]);
    ring.position.z = columnHeight(level);
    column.add(ring);
    return ring;
  });
  // stream guides from sky to plate
  const guideMaterials = overall.prongs.map((prong) => keep(new THREE.MeshBasicMaterial({ color: TRACK_HEX[prong.track], transparent: true, opacity: 0, depthWrite: false })));
  overall.prongs.forEach((prong, index) => {
    const guide = keep(new THREE.CylinderGeometry(1.4, 1.4, top - 40, 6));
    guide.rotateX(Math.PI / 2);
    guide.translate(streamX(index), 0, (top + 40) / 2);
    column.add(new THREE.Mesh(guide, guideMaterials[index]));
  });
  // where the mist lands: two ripples spreading over the plate
  const rippleGeometry = keep(new THREE.RingGeometry(0.94, 1, 96));
  const ripples = [0, 0.5].map((phase) => {
    const material = keep(new THREE.MeshBasicMaterial({ color: 0x8f86d6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const ripple = new THREE.Mesh(rippleGeometry, material);
    ripple.position.z = 42;
    column.add(ripple);
    return { ripple, material, phase };
  });
  // the sky the mist falls from
  const sky = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTexture(THREE)), transparent: true, opacity: 0, depthWrite: false })));
  sky.position.z = top + 60;
  sky.scale.set(900, 900, 1);
  column.add(sky);
  // medallions on the streams, facing the camera
  const columnCoins: Three.Object3D[] = [];
  overall.prongs.forEach((prong, prongIndex) => {
    prong.climbers.forEach((climber, climberIndex) => {
      const at = overall.spots.get(spotKey(prong, climber))!;
      const radius = COLUMN_COIN * (climber.rank === 1 ? 1.15 : 1);
      const item = coin(radius, climber.rank, prong.track, climber.label, { arm: arms.length, prong: prongIndex, climber: climberIndex });
      const spot = new THREE.Vector3(at.x, 0, at.y);
      const foot = new THREE.Vector3(at.x, 0, COLUMN.floor);
      item.position.copy(spot);
      column.add(item);
      columnCoins.push(item);
      climbers.push({ object: item, foot: [foot, foot], spot: [spot, spot], arm: arms.length, delay: Math.min((climber.rank - 1) * CLIMB_STAGGER, CLIMB_MAX_DELAY) });
    });
  });

  let columnShown = 0;
  let wholeShown = 0;
  /** Blend the centre between the whole view's single falling column (0) and the opened four streams (1). */
  function setColumn(open: number, whole: number, camera: Three.Camera) {
    columnShown = open;
    wholeShown = whole;
    mistUniforms.uMorph.value = open;
    // seen from above the rings stay a small halo inside the plate; opened they wrap the four streams
    for (const ring of rings) ring.scale.setScalar(0.42 + 0.58 * open);
    snowUniforms.uDown.value.copy(camera.up).negate();
    // in an arm's side view the column stays a faint veil behind the peak
    mistUniforms.uOpacity.value = 0.3 + 0.5 * Math.max(open, whole);
    (sky.material as Three.SpriteMaterial).opacity = 0.75 * open;
    guideMaterials.forEach((material, index) => { material.opacity = (overall.prongs[index].pending ? 0.12 : 0.3) * open; });
    for (const item of columnCoins) {
      item.visible = open > 0.02;
      item.quaternion.copy(camera.quaternion);
    }
  }

  const position = pennant.getAttribute("position");
  function animate(t: number) {
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3];
      const reach = x / pennantWidth;
      position.setZ(i, Math.sin(x * 0.17 - t * 3.4) * 3.6 * reach);
      position.setY(i, rest[i * 3 + 1] + Math.sin(x * 0.11 - t * 2.6) * 1.2 * reach);
    }
    position.needsUpdate = true;
    pennant.computeVertexNormals();
    mistUniforms.uTime.value = t;
    snowUniforms.uTime.value = t;
    // a pulse runs down the contours from the summit, like water finding its level
    const pulse = (k: number, count: number) => Math.max(0, Math.sin(t * 1.3 - (count - 1 - k) * 0.75)) ** 6;
    contourMaterials.forEach((material, k) => { material.opacity = 0.26 + 0.34 * pulse(k, contourMaterials.length); });
    const centred = Math.max(columnShown, wholeShown);
    ringMaterials.forEach((material, k) => { material.opacity = centred * (0.32 + 0.32 * pulse(k, ringMaterials.length)); });
    for (const { ripple, material, phase } of ripples) {
      const p = (t * 0.32 + phase) % 1;
      ripple.scale.setScalar(60 + p * 230);
      material.opacity = 0.42 * (1 - p) * Math.max(columnShown, wholeShown, 0.35);
    }
  }
  /** Perspective scale for point sizes, and the device pixel ratio that caps them. */
  function setPointScale(scale: number, pixelRatio: number) {
    mistUniforms.uScale.value = scale;
    snowUniforms.uScale.value = scale;
    mistUniforms.uMax.value = 16 * pixelRatio;
    snowUniforms.uMax.value = 9 * pixelRatio;
  }
  return { group, column, pickable, flags, climbers, setRaise, setColumn, animate, setPointScale, disposables };
}
