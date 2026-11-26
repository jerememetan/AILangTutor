import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

type VrmAvatarProps = {
  src: string;
  speaking?: boolean;
};

/** Loads a local VRM and renders an animated tutor into its host element. */
export default function VrmAvatar({ src, speaking = false }: VrmAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  const [loaded, setLoaded] = useState(false);
  speakingRef.current = speaking;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.location.protocol === 'file:') return;
    let disposed = false;
    let frameId = 0;
    let avatar: VRM | undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
    camera.position.set(0, 1.35, 3.7);
    camera.lookAt(0, 1.15, 0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // Keep the illustrated tutor when this browser has no WebGL context.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8b6a6, 2.1));
    const key = new THREE.DirectionalLight(0xfff3e7, 2.6);
    key.position.set(-2.5, 4, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd8e8ff, 0.8);
    fill.position.set(3, 1.5, -2);
    scene.add(fill);

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(src, (gltf) => {
      if (disposed) return;
      avatar = gltf.userData.vrm as VRM | undefined;
      if (!avatar) {
        return;
      }
      VRMUtils.rotateVRM0(avatar);
      const bounds = new THREE.Box3().setFromObject(avatar.scene);
      const height = Math.max(bounds.max.y - bounds.min.y, 0.01);
      const scale = 2.05 / height;
      const center = bounds.getCenter(new THREE.Vector3());
      avatar.scene.scale.setScalar(scale);
      avatar.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      scene.add(avatar.scene);
      setLoaded(true);
    }, undefined, () => undefined);

    const clock = new THREE.Clock();
    let elapsed = 0;
    const render = () => {
      frameId = window.requestAnimationFrame(render);
      const delta = clock.getDelta();
      elapsed += delta;
      if (avatar) {
        avatar.update(delta);
        avatar.scene.rotation.y = Math.sin(elapsed * 0.35) * 0.045;
        avatar.expressionManager?.setValue('aa', speakingRef.current ? 0.13 + Math.max(0, Math.sin(elapsed * 12)) * 0.32 : 0);
      }
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      if (avatar) VRMUtils.deepDispose(avatar.scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src]);

  return <div ref={hostRef} className={`vrm-avatar ${loaded ? 'vrm-ready' : ''}`} aria-label="Animated 3D tutor" />;
}
