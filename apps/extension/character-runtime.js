import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

globalThis.LIVIACharacter = {
  create(canvas, modelUrl) {
    const scene = new THREE.Scene();
    const viewHeight = 8;
    const camera = new THREE.OrthographicCamera(-viewHeight, viewHeight, viewHeight, -viewHeight, 0.1, 100);
    camera.position.set(0, 0, 12);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    scene.add(new THREE.HemisphereLight(0xc9efff, 0x15202c, 2.1));

    const keyLight = new THREE.DirectionalLight(0xffe2c2, 3.2);
    keyLight.position.set(-3, 6, 7);
    scene.add(keyLight);
    scene.add(new THREE.PointLight(0x7cf3ff, 16, 7));

    const actor = new THREE.Group();
    scene.add(actor);
    const cameraState = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.55, heading: 0, moving: false, scale: 1 };
    const pose = new THREE.Group();
    actor.add(pose);
    let mixer = null;
    let walkAction = null;
    let jumpAction = null;
    let baseScale = 1;
    let jumpStartedAt = 0;
    let lastMotionAt = performance.now();
    let ready = false;
    let active = true;
    let frame = 0;
    let lastFrameAt = performance.now();

    function resize() {
      const height = Math.max(1, window.innerHeight);
      const width = Math.max(1, window.innerWidth);
      const verticalView = viewHeight * height / 900;
      const horizontalView = verticalView * width / height;
      camera.left = -horizontalView / 2;
      camera.right = horizontalView / 2;
      camera.top = verticalView / 2;
      camera.bottom = -verticalView / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function onFinished(event) {
      if (event.action !== jumpAction || !walkAction) return;
      jumpAction.fadeOut(0.12);
      walkAction.reset().fadeIn(0.16).play();
    }

    new GLTFLoader().load(modelUrl, (gltf) => {
      if (!active) return;
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      gltf.scene.position.sub(center);
      pose.add(gltf.scene);
      baseScale = 1.05 / Math.max(dimensions.y, 0.001);
      actor.scale.setScalar(baseScale);
      mixer = new THREE.AnimationMixer(gltf.scene);
      const walkClip = gltf.animations.find((clip) => /walk/i.test(clip.name));
      const jumpClip = gltf.animations.find((clip) => /jump/i.test(clip.name));
      if (walkClip) {
        walkAction = mixer.clipAction(walkClip);
        walkAction.play();
        walkAction.setEffectiveWeight(0);
      }
      if (jumpClip) jumpAction = mixer.clipAction(jumpClip);
      mixer.addEventListener('finished', onFinished);
      ready = true;
    }, undefined, () => {
      canvas.dataset.modelError = 'Unable to load LIVIA character model';
    });

    function animate() {
      if (!active) return;
      const now = performance.now();
      const delta = Math.min((now - lastFrameAt) / 1000, 0.05);
      lastFrameAt = now;
      if (ready) {
        const verticalView = viewHeight * window.innerHeight / 900;
        const horizontalView = verticalView * window.innerWidth / Math.max(1, window.innerHeight);
        const x = (cameraState.x / Math.max(1, window.innerWidth) - 0.5) * horizontalView;
        const y = (0.5 - cameraState.y / Math.max(1, window.innerHeight)) * verticalView;
        if (cameraState.moving) lastMotionAt = now;
        const jumping = jumpStartedAt > 0 && now - jumpStartedAt < 1000;
        const walking = cameraState.moving && !jumping;
        const sleeping = !walking && !jumping && now - lastMotionAt > 1100;
        const hop = jumping ? Math.sin(Math.PI * (now - jumpStartedAt) / 1000) * 0.5 : 0;
        actor.position.x += (x - actor.position.x) * Math.min(1, delta * 12);
        actor.position.y += (y + hop + (sleeping ? Math.sin(now * 0.002) * 0.025 : 0) - actor.position.y) * Math.min(1, delta * 12);
        const headingDelta = Math.atan2(Math.sin(cameraState.heading - actor.rotation.y), Math.cos(cameraState.heading - actor.rotation.y));
        actor.rotation.y += headingDelta * Math.min(1, delta * 8);
        const sleepTilt = sleeping ? -Math.PI / 2 : 0;
        pose.rotation.z += (sleepTilt - pose.rotation.z) * Math.min(1, delta * 3.5);
        actor.scale.setScalar(baseScale * cameraState.scale);
        walkAction?.setEffectiveWeight(walking ? 1 : 0);
        if (walkAction?.isRunning()) walkAction.timeScale = 1;
        mixer?.update(delta);
      }
      renderer.render(scene, camera);
      cameraState.moving = false;
      frame = requestAnimationFrame(animate);
    }

    function update({ x, y, heading = 0, moving = false, scale = 1 }) {
      cameraState.x = x;
      cameraState.y = y;
      cameraState.heading = heading;
      cameraState.moving = moving;
      cameraState.scale = Math.max(0.25, Math.min(3, scale));
    }

    function jump() {
      if (!jumpAction || !walkAction) return;
      jumpStartedAt = performance.now();
      lastMotionAt = jumpStartedAt;
      jumpAction.reset().setLoop(THREE.LoopOnce, 1);
      jumpAction.clampWhenFinished = true;
      jumpAction.fadeIn(0.12).play();
      walkAction.fadeOut(0.12);
    }

    function dispose() {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      mixer?.removeEventListener('finished', onFinished);
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value?.isTexture) value.dispose();
          }
          material.dispose();
        }
      });
      renderer.dispose();
    }

    window.addEventListener('resize', resize);
    resize();
    frame = requestAnimationFrame(animate);
    return {
      update,
      jump,
      dispose,
      get ready() { return ready; }
    };
  }
};