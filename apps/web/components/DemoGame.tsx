'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type DemoTarget = {
  label: string;
  kind: string;
  color: string;
  column: number;
  row: number;
  destroyed: boolean;
};

export type DemoStats = {
  score: number;
  targets: number;
  clearTime: string;
};

type DemoGameProps = {
  playing: boolean;
  paused: boolean;
  resetKey: number;
  onStats: (stats: DemoStats) => void;
  onComplete: () => void;
};

const targetSeeds = [
  ['FEATURED VIDEO', 'VIDEO', '#b34e2d'],
  ['PLAYER 02', 'VIDEO', '#24698b'],
  ['ARTICLE FEED', 'TEXT', '#657a52'],
  ['THUMBNAIL 04', 'IMAGE', '#aa7942'],
  ['LIVE PLAYER', 'VIDEO', '#7d4b72'],
  ['NEWS PANEL', 'TEXT', '#336978'],
  ['CREATOR CARD', 'IMAGE', '#b25f62'],
  ['RELATED CLIP', 'VIDEO', '#677c39'],
  ['DISCUSSION', 'TEXT', '#4e668f']
] as const;

function createTargets(): DemoTarget[] {
  return targetSeeds.map(([label, kind, color], index) => ({
    label,
    kind,
    color,
    column: index % 3,
    row: Math.floor(index / 3),
    destroyed: false
  }));
}

export default function DemoGame({ playing, paused, resetKey, onStats, onComplete }: DemoGameProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const robotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onStatsRef = useRef(onStats);
  const onCompleteRef = useRef(onComplete);
  const playingRef = useRef(playing);
  const pausedRef = useRef(paused);

  useEffect(() => {
    onStatsRef.current = onStats;
    onCompleteRef.current = onComplete;
  }, [onStats, onComplete]);

  useEffect(() => {
    playingRef.current = playing;
    pausedRef.current = paused;
  }, [playing, paused]);

  useEffect(() => {
    const stage = stageRef.current as HTMLDivElement;
    const gameCanvas = gameCanvasRef.current as HTMLCanvasElement;
    const robotCanvas = robotCanvasRef.current as HTMLCanvasElement;
    if (!stageRef.current || !gameCanvasRef.current || !robotCanvasRef.current) return;
    const rawContext = gameCanvas.getContext('2d');
    if (!rawContext) return;
    const ctx = rawContext as CanvasRenderingContext2D;

    const game = {
      targets: createTargets(),
      projectiles: [] as Array<{ x: number; y: number; vx: number; vy: number; missile: boolean }>,
      particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
      keys: new Set<string>(),
      x: 0,
      y: 0,
      aimX: 0,
      aimY: 0,
      firing: false,
      shotAt: 0,
      score: 0,
      startedAt: 0,
      clearTime: '--',
      completed: false,
      jumpFrom: null as { x: number; y: number } | null,
      jumpTo: null as { x: number; y: number } | null,
      jumpAt: 0,
      jumpIndex: -1,
      playing: playingRef.current,
      paused: pausedRef.current
    };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
    camera.position.set(0, 0, 12);
    const renderer = new THREE.WebGLRenderer({ canvas: robotCanvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene.add(new THREE.HemisphereLight(0xd7f1ff, 0x171a27, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffe1be, 3.1);
    keyLight.position.set(-3, 6, 7);
    scene.add(keyLight);
    scene.add(new THREE.PointLight(0x7cf3ff, 14, 8));

    const actor = new THREE.Group();
    const pose = new THREE.Group();
    actor.add(pose);
    scene.add(actor);
    const mixerClock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;
    let walkAction: THREE.AnimationAction | null = null;
    let jumpAction: THREE.AnimationAction | null = null;
    let modelScale = 1;
    let active = true;
    let ready = false;
    let frame = 0;
    let width = 0;
    let height = 0;

    function getBounds(target: DemoTarget) {
      const gap = 12;
      const cardWidth = Math.max(110, Math.min(220, (width - gap * 4) / 3));
      const cardHeight = Math.max(78, Math.min(126, (height - 220) / 3));
      const gridWidth = cardWidth * 3 + gap * 2;
      const left = Math.max(12, (width - gridWidth) / 2);
      const top = Math.max(72, height * 0.14);
      return {
        x: left + target.column * (cardWidth + gap),
        y: top + target.row * (cardHeight + gap),
        w: cardWidth,
        h: cardHeight
      };
    }

    function remainingTargets() {
      return game.targets.reduce((sum, target) => sum + Number(!target.destroyed), 0);
    }

    function reportStats() {
      onStatsRef.current({ score: game.score, targets: remainingTargets(), clearTime: game.clearTime });
    }

    function resetGame() {
      game.targets = createTargets();
      game.projectiles = [];
      game.particles = [];
      game.keys.clear();
      game.firing = false;
      game.score = 0;
      game.startedAt = 0;
      game.clearTime = '--';
      game.completed = false;
      game.jumpFrom = null;
      game.jumpTo = null;
      game.jumpIndex = -1;
      reportStats();
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!width || !height) return;
      const verticalView = 12;
      const horizontalView = verticalView * width / height;
      camera.left = -horizontalView / 2;
      camera.right = horizontalView / 2;
      camera.top = verticalView / 2;
      camera.bottom = -verticalView / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      gameCanvas.width = Math.round(width * ratio);
      gameCanvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!game.x) game.x = width * 0.5;
      if (!game.y) game.y = height - 48;
      game.aimX = Math.max(0, Math.min(width, game.aimX || width * 0.72));
      game.aimY = Math.max(0, Math.min(height, game.aimY || height * 0.42));
    }

    function pointerMove(event: PointerEvent) {
      const rect = stage.getBoundingClientRect();
      game.aimX = event.clientX - rect.left;
      game.aimY = event.clientY - rect.top;
    }

    function fire(missile = false) {
      if (!game.playing || game.paused || remainingTargets() === 0) return;
      if (!game.startedAt) game.startedAt = performance.now();
      const dx = game.aimX - game.x;
      const dy = game.aimY - game.y;
      const distance = Math.hypot(dx, dy) || 1;
      game.projectiles.push({ x: game.x, y: game.y, vx: dx / distance * (missile ? 620 : 980), vy: dy / distance * (missile ? 620 : 980), missile });
      if (game.projectiles.length > 40) game.projectiles.shift();
    }

    function jumpToNext() {
      const liveTargets = game.targets.filter((target) => !target.destroyed);
      if (!liveTargets.length) return;
      if (!game.startedAt) game.startedAt = performance.now();
      const next = liveTargets[(game.jumpIndex + 1) % liveTargets.length];
      game.jumpIndex = game.targets.indexOf(next);
      const bounds = getBounds(next);
      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;
      const dx = centerX - game.x;
      const dy = centerY - game.y;
      const distance = Math.hypot(dx, dy) || 1;
      const gap = 62;
      game.jumpFrom = { x: game.x, y: game.y };
      game.jumpTo = {
        x: Math.max(24, Math.min(width - 24, centerX - dx / distance * (Math.min(bounds.w, bounds.h) / 2 + gap))),
        y: Math.max(24, Math.min(height - 24, centerY - dy / distance * (Math.min(bounds.w, bounds.h) / 2 + gap)))
      };
      game.jumpAt = performance.now();
      if (jumpAction && walkAction) {
        jumpAction.reset().setLoop(THREE.LoopOnce, 1);
        jumpAction.clampWhenFinished = true;
        jumpAction.fadeIn(0.1).play();
        walkAction.fadeOut(0.1);
      }
    }

    function pointerDown(event: PointerEvent) {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      game.firing = event.button === 0;
      fire(event.button === 2);
    }

    function pointerUp(event: PointerEvent) {
      if (event.button === 0) game.firing = false;
    }

    function onContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!game.playing || game.paused || event.repeat) return;
      const keys: Record<string, string> = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
      if (keys[event.code]) {
        event.preventDefault();
        game.keys.add(keys[event.code]);
      } else if (event.code === 'Space') {
        event.preventDefault();
        jumpToNext();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      const keys: Record<string, string> = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
      if (keys[event.code]) game.keys.delete(keys[event.code]);
    }

    function destroyTarget(target: DemoTarget) {
      if (target.destroyed) return;
      target.destroyed = true;
      game.score += 100;
      const bounds = getBounds(target);
      for (let index = 0; index < 14; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 190;
        game.particles.push({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.7 + Math.random() * 0.7, color: target.color });
      }
      if (!remainingTargets()) {
        game.clearTime = `${((performance.now() - game.startedAt) / 1000).toFixed(2)}s`;
        game.playing = false;
        game.completed = true;
        game.firing = false;
        game.projectiles = [];
        onCompleteRef.current();
      }
      reportStats();
    }

    function drawTargets() {
      for (const target of game.targets) {
        if (target.destroyed) continue;
        const bounds = getBounds(target);
        const gradient = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
        gradient.addColorStop(0, target.color);
        gradient.addColorStop(1, '#121a2a');
        ctx.fillStyle = 'rgba(5, 10, 18, 0.92)';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.78;
        ctx.fillRect(bounds.x + 3, bounds.y + 3, bounds.w - 6, bounds.h * 0.62);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(124, 243, 255, 0.64)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.w - 1, bounds.h - 1);
        ctx.fillStyle = '#edf6ff';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(target.kind, bounds.x + 9, bounds.y + 8);
        ctx.fillStyle = '#a7bad8';
        ctx.font = '500 12px system-ui, sans-serif';
        ctx.fillText(target.label, bounds.x + 9, bounds.y + bounds.h * 0.7, bounds.w - 18);
      }
    }

    function render(now: number) {
      const requestedPlay = playingRef.current;
      const requestedPaused = pausedRef.current;
      if (!game.playing && requestedPlay && !game.completed) game.startedAt = now;
      game.playing = requestedPlay && !game.completed;
      game.paused = requestedPaused;
      const dt = Math.min(mixerClock.getDelta(), 0.04);
      ctx.clearRect(0, 0, width, height);
      drawTargets();

      if (game.playing && !game.paused) {
        if (game.keys.size && !game.jumpTo) {
          const horizontal = Number(game.keys.has('d')) - Number(game.keys.has('a'));
          const vertical = Number(game.keys.has('s')) - Number(game.keys.has('w'));
          const magnitude = Math.hypot(horizontal, vertical) || 1;
          game.x = Math.max(22, Math.min(width - 22, game.x + horizontal / magnitude * 280 * dt));
          game.y = Math.max(22, Math.min(height - 22, game.y + vertical / magnitude * 280 * dt));
        }
        if (game.jumpFrom && game.jumpTo) {
          const progress = Math.min(1, (now - game.jumpAt) / 620);
          const eased = progress * progress * (3 - 2 * progress);
          game.x = game.jumpFrom.x + (game.jumpTo.x - game.jumpFrom.x) * eased;
          game.y = game.jumpFrom.y + (game.jumpTo.y - game.jumpFrom.y) * eased - Math.sin(Math.PI * progress) * 62;
          if (progress >= 1) {
            game.jumpFrom = null;
            game.jumpTo = null;
            walkAction?.reset().fadeIn(0.14).play();
            jumpAction?.fadeOut(0.14);
          }
        }
        if (game.firing && now - game.shotAt > 95) {
          fire();
          game.shotAt = now;
        }
        for (let index = game.projectiles.length - 1; index >= 0; index -= 1) {
          const projectile = game.projectiles[index];
          projectile.x += projectile.vx * dt;
          projectile.y += projectile.vy * dt;
          const target = game.targets.find((item) => {
            if (item.destroyed) return false;
            const bounds = getBounds(item);
            return projectile.x >= bounds.x && projectile.x <= bounds.x + bounds.w && projectile.y >= bounds.y && projectile.y <= bounds.y + bounds.h;
          });
          if (target) {
            destroyTarget(target);
            if (projectile.missile) {
              for (const nearby of game.targets) {
                if (nearby.destroyed) continue;
                const bounds = getBounds(nearby);
                if (Math.hypot(bounds.x + bounds.w / 2 - projectile.x, bounds.y + bounds.h / 2 - projectile.y) < 150) destroyTarget(nearby);
              }
            }
            game.projectiles.splice(index, 1);
          } else if (projectile.x < 0 || projectile.x > width || projectile.y < 0 || projectile.y > height) {
            game.projectiles.splice(index, 1);
          }
        }
      }

      for (let index = game.particles.length - 1; index >= 0; index -= 1) {
        const particle = game.particles[index];
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 180 * dt;
        particle.life -= dt;
        if (particle.life <= 0) game.particles.splice(index, 1);
        else {
          ctx.globalAlpha = Math.min(1, particle.life);
          ctx.fillStyle = particle.color;
          ctx.fillRect(particle.x, particle.y, 3, 3);
          ctx.globalAlpha = 1;
        }
      }
      for (const projectile of game.projectiles) {
        ctx.fillStyle = projectile.missile ? '#ffad5a' : '#fff4ae';
        ctx.shadowColor = projectile.missile ? '#ff7b45' : '#ffca55';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, projectile.missile ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = '#e9f5ff';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(game.playing ? 'WASD MOVE  SPACE HOP  MOUSE AIM  CLICK FIRE  RMB MISSILE' : 'PRESS PLAY TO ARM  |  NOTHING FIRES AUTOMATICALLY', 14, 14);
      if (!game.playing && game.clearTime !== '--') {
        ctx.fillStyle = 'rgba(3, 8, 14, 0.84)';
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#7cf3ff';
        ctx.font = '700 22px system-ui, sans-serif';
        ctx.fillText('SCREEN CLEARED', width / 2, height / 2 - 28);
        ctx.fillStyle = '#edf6ff';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.fillText(`CLEAR TIME ${game.clearTime}  ·  SCORE ${game.score}`, width / 2, height / 2 + 12);
        ctx.textAlign = 'start';
      }

      const movement = game.playing && !game.paused && game.keys.size > 0;
      if (ready) {
        actor.position.x = (game.x / Math.max(1, width) - 0.5) * (12 * width / Math.max(1, height));
        actor.position.y = (0.5 - game.y / Math.max(1, height)) * 12;
        const jumpProgress = game.jumpFrom ? Math.min(1, (now - game.jumpAt) / 620) : 0;
        actor.position.y += game.jumpFrom ? Math.sin(Math.PI * jumpProgress) * 0.7 : 0;
        const angle = Math.atan2(game.aimX - game.x, game.y - game.aimY);
        actor.rotation.y += (angle - actor.rotation.y) * Math.min(1, dt * 7);
        const sleeping = !game.playing && game.clearTime === '--';
        pose.rotation.z += ((sleeping ? -Math.PI / 2 : 0) - pose.rotation.z) * Math.min(1, dt * 2.5);
        walkAction?.setEffectiveWeight(movement ? 1 : 0);
        mixer?.update(dt);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    }

    function onBlur() {
      game.keys.clear();
      game.firing = false;
    }

    const resizeObserver = new ResizeObserver(resize);
    const onReset = () => resetGame();
    resizeObserver.observe(stage);
    gameCanvas.addEventListener('livia-reset', onReset);
    stage.addEventListener('pointermove', pointerMove);
    stage.addEventListener('pointerdown', pointerDown);
    stage.addEventListener('pointerup', pointerUp);
    stage.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    new GLTFLoader().load('/models/box-02_robot.glb', (gltf) => {
      if (!active) return;
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      gltf.scene.position.sub(center);
      pose.add(gltf.scene);
      modelScale = 1.7 / Math.max(dimensions.y, 0.001);
      actor.scale.setScalar(modelScale);
      mixer = new THREE.AnimationMixer(gltf.scene);
      const walkClip = gltf.animations.find((clip) => /walk/i.test(clip.name));
      const jumpClip = gltf.animations.find((clip) => /jump/i.test(clip.name));
      if (walkClip) {
        walkAction = mixer.clipAction(walkClip);
        walkAction.play();
        walkAction.setEffectiveWeight(0);
      }
      if (jumpClip) jumpAction = mixer.clipAction(jumpClip);
      ready = true;
    }, undefined, () => {
      gameCanvas.dataset.modelError = 'Unable to load LIVIA character model';
    });

    resize();
    reportStats();
    frame = requestAnimationFrame(render);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      gameCanvas.removeEventListener('livia-reset', onReset);
      stage.removeEventListener('pointermove', pointerMove);
      stage.removeEventListener('pointerdown', pointerDown);
      stage.removeEventListener('pointerup', pointerUp);
      stage.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material as unknown as Record<string, unknown>)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  useEffect(() => {
    if (resetKey > 0) {
      gameCanvasRef.current?.dispatchEvent(new CustomEvent('livia-reset'));
    }
  }, [resetKey]);

  return (
    <div ref={stageRef} className="demo-game-stage" data-playing={playing} data-paused={paused}>
      <canvas ref={gameCanvasRef} className="demo-game-canvas" aria-label="Interactive LIVIA demo targets" />
      <canvas ref={robotCanvasRef} className="demo-robot-canvas" aria-label="Animated LIVIA robot demo character" />
    </div>
  );
}