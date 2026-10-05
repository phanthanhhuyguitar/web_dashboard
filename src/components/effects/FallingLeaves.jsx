import { useEffect, useRef } from 'react';

import { useAppSettings } from '../../context/AppSettingsContext.jsx';

const LEAF_COUNT = 16;
const LEAF_GLYPHS = ['🍁', '🍁', '🍁', '🍂', '🍁'];
const AVOID_RADIUS = 100;
// Mo hinh luc-quan tinh (acceleration -> velocity -> position), khong cong thang luc vao vi
// tri nhu truoc (do gay giat vi 1 dai luong vua la "luc" vua la "vi tri" cung luc).
const AVOID_ACCEL = 2200;
const SPRING_BACK = 5;
const VELOCITY_DAMPING = 0.82;
const MAX_SPEED = 260;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createLeaf(width, height, spawnAboveScreen) {
  const size = randomBetween(16, 30);

  return {
    glyph: LEAF_GLYPHS[Math.floor(Math.random() * LEAF_GLYPHS.length)],
    baseX: randomBetween(0, width),
    y: spawnAboveScreen ? randomBetween(-height, 0) : randomBetween(-40, -10),
    size,
    // Cache san chuoi font - tranh phai noi chuoi lai moi frame cho tung la.
    font: `${size}px sans-serif`,
    fallSpeed: randomBetween(28, 55),
    swayAmplitude: randomBetween(20, 60),
    swaySpeed: randomBetween(0.4, 1.1),
    swayPhase: randomBetween(0, Math.PI * 2),
    rotation: randomBetween(0, Math.PI * 2),
    rotationSpeed: randomBetween(-1.2, 1.2),
    opacity: randomBetween(0.65, 0.95),
    dispX: 0,
    dispY: 0,
    vx: 0,
    vy: 0,
  };
}

// Hieu ung la phong roi, tranh xa con tro chuot - canvas overlay thuan tuy trang tri
// (pointer-events: none), gan 1 lan o goc app nen khong bi restart moi lan chuyen trang.
function FallingLeaves() {
  const canvasRef = useRef(null);
  const { settings } = useAppSettings();
  const enabled = settings.fallingLeavesEnabled;

  useEffect(() => {
    if (!enabled) return undefined;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return undefined;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const mouse = { x: -9999, y: -9999 };
    let leaves = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let lastTime = performance.now();
    let rafId = null;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function handlePointerMove(event) {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }

    function handlePointerLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    // Dung han rAF khi tab khong hien (chuyen sang tab khac/thu nho) - tranh ton CPU/GPU vo ich
    // vi rAF mac dinh van tiep tuc chay ngam o mot so trinh duyet du tab dang an.
    function handleVisibilityChange() {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    function tick(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);

      lastTime = now;
      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      leaves.forEach((leaf) => {
        leaf.y += leaf.fallSpeed * dt;
        leaf.swayPhase += leaf.swaySpeed * dt;
        leaf.rotation += leaf.rotationSpeed * dt;

        const naturalX = leaf.baseX + Math.sin(leaf.swayPhase) * leaf.swayAmplitude;
        const currentX = naturalX + leaf.dispX;
        const currentY = leaf.y + leaf.dispY;
        const dx = currentX - mouse.x;
        const dy = currentY - mouse.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < AVOID_RADIUS * AVOID_RADIUS) {
          const dist = Math.sqrt(distSq) || 1;
          const accel = (1 - dist / AVOID_RADIUS) * AVOID_ACCEL;

          leaf.vx += (dx / dist) * accel * dt;
          leaf.vy += (dy / dist) * accel * dt;
        }

        // Luc keo nhe ve lai quy dao tu nhien, de la khong troi mai ma tu tu tro ve.
        leaf.vx += -leaf.dispX * SPRING_BACK * dt;
        leaf.vy += -leaf.dispY * SPRING_BACK * dt;

        // Giam toc theo thoi gian thuc (khong theo tung frame) de khong bi giat khi FPS dao dong.
        const damping = VELOCITY_DAMPING ** (dt * 60);

        leaf.vx *= damping;
        leaf.vy *= damping;

        const speed = Math.hypot(leaf.vx, leaf.vy);

        if (speed > MAX_SPEED) {
          leaf.vx = (leaf.vx / speed) * MAX_SPEED;
          leaf.vy = (leaf.vy / speed) * MAX_SPEED;
        }

        leaf.dispX += leaf.vx * dt;
        leaf.dispY += leaf.vy * dt;

        const drawX = naturalX + leaf.dispX;
        const drawY = leaf.y + leaf.dispY;

        ctx.save();
        ctx.globalAlpha = leaf.opacity;
        ctx.translate(drawX, drawY);
        ctx.rotate(leaf.rotation);
        ctx.font = leaf.font;
        ctx.fillText(leaf.glyph, 0, 0);
        ctx.restore();

        if (leaf.y - Math.abs(leaf.dispY) > height + 40) {
          Object.assign(leaf, createLeaf(width, height, false));
        }
      });

      rafId = requestAnimationFrame(tick);
    }

    resize();
    leaves = Array.from({ length: LEAF_COUNT }, () => createLeaf(width, height, true));

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    rafId = requestAnimationFrame(tick);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} className="falling-leaves-canvas" aria-hidden="true" />;
}

export default FallingLeaves;
