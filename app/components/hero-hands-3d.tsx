"use client";

import { useEffect, useRef } from "react";
import type * as Three from "three";

/** Fired when the two fingertips meet; the ripple ring answers with a wave. */
export const HERO_TOUCH_EVENT = "roboexam:touch";

type HandSpec = {
  selector: string;
  src: string;
  /** Wrist and knuckle pivots in image UV (x right, y down). */
  wrist: [number, number];
  knuckle: [number, number];
  /** +1 when the fingers lie to the right of the joints (human), -1 when to the left (robot). */
  toward: 1 | -1;
  mechanical: boolean;
};

const HANDS: HandSpec[] = [
  { selector: ".heroHandHuman", src: "/brand/hand-human.webp", wrist: [0.22, 0.4], knuckle: [0.43, 0.32], toward: 1, mechanical: false },
  { selector: ".heroHandRobot", src: "/brand/hand-robot.webp", wrist: [0.81, 0.34], knuckle: [0.57, 0.28], toward: -1, mechanical: true },
];

const VERTEX = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uWrist;
uniform vec2 uKnuckle;
uniform float uToward;
uniform float uWristAngle;
uniform float uFingerAngle;
uniform float uCurl;
varying vec2 vUv;
varying float vShade;

vec2 rotateAbout(vec2 p, vec2 c, float a) {
  float s = sin(a), k = cos(a);
  p -= c;
  return vec2(k * p.x - s * p.y, s * p.x + k * p.y) + c;
}
float beyond(float u, float joint, float soft) {
  return uToward > 0.0 ? smoothstep(joint - soft, joint + soft, u) : 1.0 - smoothstep(joint - soft, joint + soft, u);
}

void main() {
  vUv = uv;
  vec2 wrist = (vec2(uWrist.x, 1.0 - uWrist.y) - 0.5) * uSize;
  vec2 knuckle = (vec2(uKnuckle.x, 1.0 - uKnuckle.y) - 0.5) * uSize;
  float ww = beyond(uv.x, uWrist.x, 0.05);
  float wk = beyond(uv.x, uKnuckle.x, 0.04);
  vec2 p0 = position.xy * uSize; // unit plane → pixels, so bends keep their true angles
  vec2 p = mix(p0, rotateAbout(p0, wrist, uWristAngle), ww);
  p = mix(p, rotateAbout(p, rotateAbout(knuckle, wrist, uWristAngle), uFingerAngle), wk);
  float reach = abs(uv.x - uKnuckle.x);
  float z = uCurl * wk * reach * reach * uSize.x;
  vShade = 1.0 - 1.6 * abs(uFingerAngle) * wk;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z + z, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vShade;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.01) discard;
  gl_FragColor = vec4(c.rgb * clamp(vShade, 0.86, 1.0), c.a * uOpacity);
}`;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** 0 → 1 → 0 reach envelope over one cycle: rest, reach, hold (touch), retreat. */
function reachAt(phase: number) {
  if (phase < 0.45) return 0;
  if (phase < 0.62) return easeInOut((phase - 0.45) / 0.17);
  if (phase < 0.72) return 1;
  if (phase < 0.95) return 1 - easeInOut((phase - 0.72) / 0.23);
  return 0;
}

/**
 * Animated hero hands. Each photo is a subdivided plane bent at two joints in a
 * vertex shader: the human hand breathes and flexes smoothly, the robot hand
 * moves in stepped, slightly lagging servo increments. Both turn toward the
 * pointer and periodically reach until the fingertips meet. Placement follows
 * the CSS boxes of the fallback <img> elements, which stay visible if WebGL is
 * unavailable.
 */
export function HeroHands3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const field = canvas?.parentElement;
    const stage = field?.closest(".heroStage");
    if (!canvas || !field || !stage) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
      } catch {
        return; // keep the static images
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 10, 20000);
      const loader = new THREE.TextureLoader();
      const textures = await Promise.all(HANDS.map((hand) => loader.loadAsync(hand.src)));
      if (disposed) { renderer.dispose(); textures.forEach((t) => t.dispose()); return; }

      const hands = HANDS.map((spec, index) => {
        const texture = textures[index];
        texture.anisotropy = 4;
        const material = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uMap: { value: texture },
            uSize: { value: new THREE.Vector2(1, 1) },
            uWrist: { value: new THREE.Vector2(...spec.wrist) },
            uKnuckle: { value: new THREE.Vector2(...spec.knuckle) },
            uToward: { value: spec.toward },
            uWristAngle: { value: 0 },
            uFingerAngle: { value: 0 },
            uCurl: { value: 0 },
            uOpacity: { value: 0 },
          },
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 64, 16), material);
        const pivot = new THREE.Group(); // rotates about the wrist for the 3D turn
        pivot.add(mesh);
        scene.add(pivot);
        return { spec, mesh, pivot, material, base: { x: 0, y: 0, w: 1, h: 1 }, wrist: { x: 0, y: 0 }, servo: { wrist: 0, finger: 0 } };
      });

      const size = { w: 1, h: 1 };
      function layout() {
        const box = field!.getBoundingClientRect();
        size.w = box.width;
        size.h = box.height;
        renderer.setSize(size.w, size.h, false);
        camera.aspect = size.w / size.h;
        camera.position.set(0, 0, size.h / 2 / Math.tan((camera.fov * Math.PI) / 360));
        camera.updateProjectionMatrix();
        for (const hand of hands) {
          const img = field!.querySelector<HTMLImageElement>(hand.spec.selector);
          if (!img) continue;
          const r = img.getBoundingClientRect();
          const cx = r.left - box.left + r.width / 2 - size.w / 2;
          const cy = -(r.top - box.top + r.height / 2 - size.h / 2);
          hand.base = { x: cx, y: cy, w: r.width, h: r.height };
          hand.wrist = { x: (hand.spec.wrist[0] - 0.5) * r.width, y: (0.5 - hand.spec.wrist[1]) * r.height };
          hand.mesh.position.set(-hand.wrist.x, -hand.wrist.y, 0);
          hand.material.uniforms.uSize.value.set(r.width, r.height);
        }
      }

      const pointer = { x: 0, y: 0, tx: 0, ty: 0, near: 0, tnear: 0 };
      const onMove = (event: PointerEvent) => {
        const box = field!.getBoundingClientRect();
        pointer.tx = ((event.clientX - box.left) / box.width) * 2 - 1;
        pointer.ty = ((event.clientY - box.top) / box.height) * 2 - 1;
        pointer.tnear = clamp01(1 - Math.hypot(pointer.tx, pointer.ty * 1.4) / 0.6);
      };
      const onLeave = () => { pointer.tx = 0; pointer.ty = 0; pointer.tnear = 0; };

      const start = performance.now();
      let last = start;
      let lastCycle = -1;
      function frame(now: number) {
        const t = (now - start) / 1000;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        pointer.x += (pointer.tx - pointer.x) * 0.06;
        pointer.y += (pointer.ty - pointer.y) * 0.06;
        pointer.near += (pointer.tnear - pointer.near) * 0.05;
        const entry = reduce ? 1 : easeOut(clamp01(t / 1.4));
        const cycleTime = Math.max(0, t - 2.2);
        const cycle = Math.floor(cycleTime / 7.5);
        const phase = reduce ? 0 : (cycleTime / 7.5) % 1;
        const reach = t < 2.2 ? 0 : reachAt(phase);
        if (!reduce && t >= 2.2 && phase >= 0.64 && cycle !== lastCycle) {
          lastCycle = cycle;
          window.dispatchEvent(new CustomEvent(HERO_TOUCH_EVENT));
        }
        for (const hand of hands) {
          const human = !hand.spec.mechanical;
          const inward = human ? 1 : -1;
          const approach = (reach * 0.022 + pointer.near * 0.012) * size.w;
          const slide = (1 - entry) * 0.07 * size.w;
          const bob = reduce ? 0 : (human ? 6 * Math.sin(t * 0.9) : 5 * Math.sin(t * 0.8 + 1.7));
          hand.pivot.position.set(hand.base.x + hand.wrist.x + inward * (approach - slide), hand.base.y + hand.wrist.y + bob, 0);
          hand.pivot.rotation.y = pointer.x * 0.22;
          hand.pivot.rotation.x = -pointer.y * 0.12;
          let wristTarget: number;
          let fingerTarget: number;
          if (human) {
            wristTarget = 0.02 * Math.sin(t * 1.25) - reach * 0.025;
            fingerTarget = 0.04 * Math.sin(t * 1.9 + 1) + reach * 0.05;
          } else {
            // servo: bang-bang wrist sweeps and quantised finger targets
            wristTarget = 0.016 * Math.sign(Math.sin(t * 0.7)) + reach * 0.02;
            fingerTarget = Math.round((0.035 * Math.sin(t * 1.4) - reach * 0.05) / 0.012) * 0.012;
            if (phase > 0.66 && phase < 0.74) fingerTarget += 0.07 * Math.max(0, Math.sin(((phase - 0.66) / 0.04) * Math.PI));
          }
          if (reduce) { wristTarget = 0; fingerTarget = 0; }
          if (human) {
            hand.servo.wrist = wristTarget;
            hand.servo.finger = fingerTarget;
          } else {
            // stepped targets followed with a short, fixed lag read as a motor, not a muscle
            const follow = 1 - Math.exp(-dt * 9);
            hand.servo.wrist += (wristTarget - hand.servo.wrist) * follow;
            hand.servo.finger += (fingerTarget - hand.servo.finger) * follow;
          }
          const uniforms = hand.material.uniforms;
          uniforms.uWristAngle.value = Math.max(-0.12, Math.min(0.12, hand.servo.wrist));
          uniforms.uFingerAngle.value = Math.max(-0.14, Math.min(0.14, hand.servo.finger));
          uniforms.uCurl.value = 0.06 + reach * 0.05;
          uniforms.uOpacity.value = entry;
        }
        renderer.render(scene, camera);
        if (!reduce && visible) raf = requestAnimationFrame(frame);
      }

      let raf = 0;
      let visible = true;
      // switch the fallback images to their static pose first, then measure them
      stage!.classList.add("hands3d");
      layout();
      frame(performance.now());
      const resize = new ResizeObserver(() => { layout(); if (reduce || !visible) frame(performance.now()); });
      resize.observe(field!);
      const io = new IntersectionObserver(([entry]) => {
        const next = entry.isIntersecting && document.visibilityState === "visible";
        if (next && !visible && !reduce) { visible = true; last = performance.now(); raf = requestAnimationFrame(frame); }
        if (!next) { visible = false; cancelAnimationFrame(raf); }
      });
      io.observe(field!);
      if (!reduce) {
        stage!.addEventListener("pointermove", onMove as EventListener);
        stage!.addEventListener("pointerleave", onLeave);
        raf = requestAnimationFrame(frame);
      }
      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        resize.disconnect();
        stage!.removeEventListener("pointermove", onMove as EventListener);
        stage!.removeEventListener("pointerleave", onLeave);
        stage!.classList.remove("hands3d");
        hands.forEach((hand) => { hand.mesh.geometry.dispose(); hand.material.dispose(); });
        textures.forEach((texture) => texture.dispose());
        renderer.dispose();
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, []);
  return <canvas ref={canvasRef} className="heroHands3d"/>;
}
