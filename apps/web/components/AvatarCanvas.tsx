'use client';

import { useEffect, useRef } from 'react';
import type { Form } from '@/lib/livia';

export default function AvatarCanvas({
  form,
  color,
  size,
  className
}: {
  form: Form;
  color: string;
  size: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const ctx = context;
    const canvasEl = canvas;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { x: 180, y: 150, targetX: 180, targetY: 150, heading: 0 };
    let width = 0;
    let height = 0;
    let start = performance.now();
    let frame = 0;

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvasEl.width = width * dpr;
      canvasEl.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function pointerMove(event: PointerEvent) {
      const rect = canvasEl.getBoundingClientRect();
      state.targetX = event.clientX - rect.left;
      state.targetY = event.clientY - rect.top;
      state.heading = Math.atan2(state.targetY - state.y, state.targetX - state.x);
    }

    function draw(now: number) {
      const dt = Math.min((now - start) / 1000, 0.05);
      start = now;
      const target = size * 34;
      const follow = prefersReducedMotion ? 1 : 1 - Math.exp(-8 * dt);

      state.x += (state.targetX - state.x) * follow;
      state.y += (state.targetY - state.y) * follow;

      state.x = Math.min(Math.max(40, state.x), width - 40);
      state.y = Math.min(Math.max(40, state.y), height - 40);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(state.x, state.y);
      ctx.rotate(state.heading || 0);

      const gradient = ctx.createRadialGradient(-target * 0.4, -target * 0.3, target * 0.2, 0, 0, target * 1.2);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.35, color);
      gradient.addColorStop(1, '#0a1822');

      ctx.fillStyle = gradient;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;

      switch (form) {
        case 'sphere':
          ctx.beginPath();
          ctx.arc(0, 0, target, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case 'cube':
          ctx.fillRect(-target * 0.9, -target * 0.9, target * 1.8, target * 1.8);
          ctx.strokeRect(-target * 0.9, -target * 0.9, target * 1.8, target * 1.8);
          break;
        case 'ball':
          ctx.beginPath();
          ctx.ellipse(0, 0, target, target * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case 'spaceship':
          ctx.beginPath();
          ctx.moveTo(0, -target * 1.2);
          ctx.lineTo(target * 0.9, target);
          ctx.lineTo(0, target * 0.6);
          ctx.lineTo(-target * 0.9, target);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        case 'drone':
          ctx.beginPath();
          ctx.arc(0, 0, target * 0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(x * target, y * target);
            ctx.stroke();
          }
          break;
        case 'robot':
          ctx.fillRect(-target * 0.8, -target * 0.7, target * 1.6, target * 1.4);
          ctx.strokeRect(-target * 0.8, -target * 0.7, target * 1.6, target * 1.4);
          ctx.fillStyle = '#0a1822';
          ctx.fillRect(-target * 0.3, -target * 0.1, target * 0.2, target * 0.2);
          ctx.fillRect(target * 0.1, -target * 0.1, target * 0.2, target * 0.2);
          break;
        case 'particle':
          for (let i = 0; i < 18; i += 1) {
            const angle = (i / 18) * Math.PI * 2 + now / 1000;
            const distance = target * (0.6 + (i % 5) * 0.18);
            ctx.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, 4, 4);
          }
          break;
      }

      ctx.restore();
      frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', pointerMove);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', pointerMove);
    };
  }, [form, color, size]);

  return <canvas ref={canvasRef} className={className} aria-label="LIVIA avatar preview" />;
}
