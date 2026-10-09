'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  const avatarConfig = useRef({ color, size });

  useEffect(() => {
    avatarConfig.current = { color, size };
  }, [color, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;
    const initialRect = canvasElement.getBoundingClientRect();

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    camera.position.set(0, 0.8, 12);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    scene.add(new THREE.HemisphereLight(0xc9efff, 0x15202c, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffe2c2, 3.2);
    keyLight.position.set(-3, 6, 7);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(avatarConfig.current.color, 22, 8);
    rimLight.position.set(2.4, 1.6, 2.4);
    scene.add(rimLight);

    const target = new THREE.Vector3(0, 0, 0);
    const state = {
      x: initialRect.width / 2,
      y: initialRect.height * 0.55,
      heading: 0,
      lastX: initialRect.width / 2,
      lastY: initialRect.height * 0.55,
      moving: false
    };
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let actor: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let walkAction: THREE.AnimationAction | null = null;
    let jumpAction: THREE.AnimationAction | null = null;
    let modelScale = 1;
    let active = true;
    let frame = 0;
    let lastFrameAt = performance.now();

    function resize() {
      const rect = canvasElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const viewHeight = 7.4;
      camera.left = -(viewHeight * rect.width / rect.height) / 2;
      camera.right = (viewHeight * rect.width / rect.height) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    }

    function pointerMove(event: PointerEvent) {
      const rect = canvasElement.getBoundingClientRect();
      const nextX = THREE.MathUtils.clamp(event.clientX - rect.left, 40, Math.max(40, rect.width - 40));
      const nextY = THREE.MathUtils.clamp(event.clientY - rect.top, 55, Math.max(55, rect.height - 55));
      state.heading = Math.atan2(nextX - state.x, state.y - nextY);
      state.x = nextX;
      state.y = nextY;
      state.moving = Math.hypot(state.x - state.lastX, state.y - state.lastY) > 1.2;
      state.lastX = state.x;
      state.lastY = state.y;
    }

    function playJump() {
      if (!jumpAction || !walkAction) return;
      jumpAction.reset().setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
      jumpAction.fadeIn(0.12).play();
      walkAction.fadeOut(0.12);
    }

    function animate() {
      if (!active) return;
      const now = performance.now();
      const delta = Math.min((now - lastFrameAt) / 1000, 0.05);
      lastFrameAt = now;
      if (actor) {
        const rect = canvasElement.getBoundingClientRect();
        const width = viewHeightForWidth(rect.width, rect.height);
        const height = 7.4;
        target.set((state.x / Math.max(1, rect.width) - 0.5) * width, (0.5 - state.y / Math.max(1, rect.height)) * height, 0);
        actor.position.lerp(target, prefersReducedMotion ? 1 : 1 - Math.exp(-8 * delta));
        actor.rotation.y += (state.heading * 0.28 - actor.rotation.y) * Math.min(1, delta * 5);
        actor.scale.setScalar(modelScale * avatarConfig.current.size);
        rimLight.color.set(avatarConfig.current.color);
        if (walkAction?.isRunning()) walkAction.timeScale = state.moving ? 1 : 0.16;
        mixer?.update(delta);
      }
      renderer.render(scene, camera);
      state.moving = false;
      frame = requestAnimationFrame(animate);
    }

    function viewHeightForWidth(width: number, height: number) {
      return height ? 7.4 * width / height : 7.4;
    }

    const onAnimationFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== jumpAction || !walkAction) return;
      jumpAction?.fadeOut(0.12);
      walkAction.reset().fadeIn(0.16).play();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvasElement);
    window.addEventListener('pointermove', pointerMove);
    canvasElement.addEventListener('pointerdown', playJump);

    new GLTFLoader().load('/models/box-02_robot.glb', (gltf) => {
      if (!active) return;
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      const model = new THREE.Group();
      gltf.scene.position.sub(center);
      model.add(gltf.scene);
      modelScale = 2.1 / Math.max(dimensions.y, 0.001);
      model.scale.setScalar(modelScale * avatarConfig.current.size);
      scene.add(model);
      actor = model;
      mixer = new THREE.AnimationMixer(gltf.scene);
      const walkClip = gltf.animations.find((clip) => /walk/i.test(clip.name));
      const jumpClip = gltf.animations.find((clip) => /jump/i.test(clip.name));
      if (walkClip) {
        walkAction = mixer.clipAction(walkClip);
        walkAction.play();
      }
      if (jumpClip) jumpAction = mixer.clipAction(jumpClip);
      mixer.addEventListener('finished', onAnimationFinished);
      resize();
    }, undefined, () => {
      canvasElement.dataset.modelError = 'Unable to load LIVIA character model';
    });

    resize();
    frame = requestAnimationFrame(animate);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', pointerMove);
      canvasElement.removeEventListener('pointerdown', playJump);
      mixer?.removeEventListener('finished', onAnimationFinished);
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-label={`LIVIA ${form} character preview`} />;
}
