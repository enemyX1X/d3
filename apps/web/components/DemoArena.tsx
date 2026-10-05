'use client';

import { useEffect, useRef } from 'react';

export default function DemoArena({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars: Array<{ x: number; y: number; r: number; alpha: number; speed: number }> = [];

    let width = 0;
    let height = 0;
    let dpr = 1;
    let frameId = 0;

    const buildStars = () => {
      stars.length = 0;
      const count = Math.max(70, Math.round(width * height / 18));
      for (let i = 0; i < count; i += 1) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 2.2 + 0.5,
          alpha: Math.random() * 0.9 + 0.1,
          speed: Math.random() * 0.8 + 0.2
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width || canvas.clientWidth || 800;
      height = rect.height || canvas.clientHeight || 480;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    };

    const drawCity = (time: number) => {
      const skyline = [
        [0.12, 60], [0.18, 90], [0.26, 72], [0.32, 120], [0.38, 84], [0.45, 110],
        [0.52, 70], [0.58, 94], [0.68, 130], [0.78, 76], [0.9, 110], [1, 64]
      ];

      ctx.save();
      ctx.fillStyle = 'rgba(36, 26, 60, 0.9)';
      for (const [x, h] of skyline) {
        const px = width * x;
        const pw = width * 0.06;
        ctx.fillRect(px, height - h, pw, h);
      }
      ctx.restore();

      const glow = ctx.createLinearGradient(0, 0, width, height);
      glow.addColorStop(0, 'rgba(255, 108, 51, 0.14)');
      glow.addColorStop(0.5, 'rgba(120, 92, 255, 0.08)');
      glow.addColorStop(1, 'rgba(19, 28, 46, 0.0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(118, 218, 255, 0.18)';
      ctx.beginPath();
      for (let x = 0; x <= width; x += 24) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += 24) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      const pulse = 0.5 + Math.sin(time / 500) * 0.18;
      ctx.fillStyle = `rgba(122, 320, 255, ${0.3 * pulse})`;
      ctx.fillRect(width * 0.14, height * 0.18, width * 0.68, height * 0.52);
    };

    const drawParticles = (time: number) => {
      for (const star of stars) {
        star.y += star.speed;
        if (star.y > height + 6) {
          star.x = Math.random() * width;
          star.y = -6;
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < 26; i += 1) {
        const x = ((i * 79 + time * 0.06) % (width + 80)) - 40;
        const y = height * 0.4 + Math.sin(i * 1.4 + time / 700) * 14;
        ctx.fillStyle = 'rgba(255, 156, 84, 0.24)';
        ctx.beginPath();
        ctx.arc(x, y, 6 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawFighter = (time: number) => {
      const x = width * 0.26 + Math.sin(time / 1100) * 60;
      const y = height * 0.36 + Math.cos(time / 800) * 28;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(time / 830) * 0.28);

      ctx.fillStyle = '#0d152a';
      ctx.strokeStyle = '#7cf3ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7cf3ff';
      ctx.shadowBlur = 16;

      ctx.beginPath();
      ctx.moveTo(-60, 10);
      ctx.lineTo(-10, -8);
      ctx.lineTo(12, -14);
      ctx.lineTo(60, -6);
      ctx.lineTo(18, 8);
      ctx.lineTo(-18, 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    };

    const drawStatsCard = (time: number) => {
      const cardX = width * 0.56;
      const cardY = height * 0.56;
      const cardW = width * 0.26;
      const cardH = height * 0.26;

      ctx.save();
      ctx.fillStyle = 'rgba(16, 22, 32, 0.8)';
      ctx.strokeStyle = 'rgba(124, 243, 255, 0.5)';
      ctx.lineWidth = 1.3;
      ctx.shadowColor = '#7cf3ff';
      ctx.shadowBlur = 18;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeRect(cardX, cardY, cardW, cardH);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#edf4ff';
      ctx.font = '600 13px sans-serif';
      ctx.fillText('Threats', cardX + 18, cardY + 30);
      ctx.fillText('05', cardX + cardW - 54, cardY + 30);

      const bars = [0.35, 0.58, 0.72, 0.48, 0.76, 0.9];
      const step = cardW / (bars.length + 2);
      for (let i = 0; i < bars.length; i += 1) {
        const barH = (bars[i] * 56) + 6;
        const x = cardX + 18 + i * step;
        const y = cardY + 64;
        ctx.fillStyle = i % 2 === 0 ? '#ff6c57' : '#7cf3ff';
        ctx.fillRect(x, y + (56 - barH), step - 8, barH);
      }

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.moveTo(cardX + 18, cardY + cardH - 24);
      ctx.lineTo(cardX + cardW - 18, cardY + cardH - 24);
      ctx.stroke();

      const ticker = ((time / 1200) % 1) * (cardW - 40);
      ctx.fillStyle = 'rgba(255, 175, 82, 0.9)';
      ctx.fillRect(cardX + 14 + ticker, cardY + cardH - 18, 16, 6);
      ctx.restore();
    };

    const drawCrosshair = (time: number) => {
      const cx = width * 0.7;
      const cy = height * 0.28;
      const radius = 16 + Math.sin(time / 300) * 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 175, 82, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.moveTo(cx - 26, cy);
      ctx.lineTo(cx - 10, cy);
      ctx.moveTo(cx + 10, cy);
      ctx.lineTo(cx + 26, cy);
      ctx.moveTo(cx, cy - 26);
      ctx.lineTo(cx, cy - 10);
      ctx.moveTo(cx, cy + 10);
      ctx.lineTo(cx, cy + 26);
      ctx.stroke();
      ctx.restore();
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#170f2d');
      sky.addColorStop(0.38, '#120d25');
      sky.addColorStop(1, '#0d1320');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      drawCity(time);
      drawParticles(time);
      drawFighter(time);
      drawStatsCard(time);
      drawCrosshair(time);

      ctx.fillStyle = '#dfe9ff';
      ctx.font = '600 28px sans-serif';
      ctx.fillText('LIVIA', width * 0.1, height * 0.16);
      ctx.font = '500 12px sans-serif';
      ctx.fillStyle = 'rgba(223, 233, 255, 0.72)';
      ctx.fillText('PLAY MODE • BROWSER READY', width * 0.1, height * 0.185);

      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 103, 65, 0.86)';
      ctx.arc(width * 0.94, height * 0.16, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    const loop = (time: number) => {
      render(time);
      frameId = requestAnimationFrame(loop);
    };

    resize();
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-label="LIVIA demo arena" />;
}
