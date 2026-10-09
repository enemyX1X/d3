'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type PresenceState = 'waiting' | 'ready' | 'thinking' | 'approval';

export default function LiviaPresence({ state }: { state: PresenceState }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let active = true;
    let frame = 0;
    let model: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let lastFrame = performance.now();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 0.1, 5.8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe7f3d1, 0x303c28, 2.5));
    const key = new THREE.DirectionalLight(0xf2f6dd, 4.2);
    key.position.set(-3, 4, 5);
    scene.add(key);
    const rim = new THREE.PointLight(0xc8f169, 18, 9);
    rim.position.set(2.5, 1, 3);
    scene.add(rim);

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    new GLTFLoader().load('/models/box-02_robot.glb', (gltf) => {
      if (!active) return;
      model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);
      const height = Math.max(dimensions.y, 0.001);
      model.scale.setScalar(2.15 / height);
      model.position.y -= 0.05;
      scene.add(model);
      const idle = gltf.animations.find((clip) => /idle|walk/i.test(clip.name));
      if (idle) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idle).play();
      }
    });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = (now: number) => {
      if (!active) return;
      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      if (model && !reducedMotion) {
        const currentState = stateRef.current;
        const turnSpeed = currentState === 'thinking' ? 0.55 : currentState === 'approval' ? 0.18 : 0.1;
        model.rotation.y += delta * turnSpeed;
        model.position.y = -0.05 + Math.sin(now * (currentState === 'thinking' ? 0.0032 : 0.0015)) * (currentState === 'thinking' ? 0.075 : 0.025);
      }
      mixer?.update(delta);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const labels: Record<PresenceState, string> = {
    waiting: 'Waiting for connection',
    ready: 'Ready to help',
    thinking: 'Understanding your task',
    approval: 'Waiting for your approval'
  };

  return (
    <aside className={`livia-presence presence-${state}`} aria-label={`LIVIA assistant. ${labels[state]}`}>
      <div className="livia-presence__scene" ref={hostRef} />
      <div className="livia-presence__caption"><span className="presence-indicator" /><span><strong>LIVIA</strong><small>{labels[state]}</small></span></div>
    </aside>
  );
}
