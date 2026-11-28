import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

import { avatarMotionSettings } from '../data/avatarMotionSettings';
import createPreviewFigure from './createPreviewFigure';
import createVrmModelCache, { type LoadedVrm } from './vrmModelCache';

const noPreloads: string[] = [];

type VrmAvatarProps = {
  src?: string;
  previewId?: string;
  preloadSources?: string[];
  onPreviewReady?: (id: string) => void;
  pickerRotation?: RefObject<number>;
  framing?: 'call';
  mouth?: RefObject<number>;
};

/** Loads a local VRM and renders an animated tutor into its host element. */
export default function VrmAvatar({
  src,
  previewId,
  preloadSources = noPreloads,
  onPreviewReady,
  pickerRotation,
  framing,
  mouth,
}: VrmAvatarProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewer = useRef<{
    subject: THREE.Group;
    cache: ReturnType<typeof createVrmModelCache>;
    prepare?: (avatar: VRM) => void;
    draw: () => void;
    resize: () => void;
    model?: LoadedVrm;
    source?: string;
    fallback?: THREE.Group;
  } | null>(null);
  const inPicker = Boolean(previewId);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || window.location.protocol === 'file:') return;
    let frameId = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
    camera.position.set(0, 1.35, 3.7);
    camera.lookAt(0, 1.15, 0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setUnavailable(true);
      return;
    }
    const subject = new THREE.Group();
    const warmupTarget = inPicker ? new THREE.WebGLRenderTarget(1, 1) : undefined;
    const warmed = new WeakSet<VRM>();
    const state = {
      subject,
      cache: createVrmModelCache(inPicker),
      draw: () => renderer.render(scene, camera),
      resize,
      prepare: warmupTarget
        ? (avatar: VRM) => {
            if (warmed.has(avatar)) return;
            // Upload textures and geometry on the same renderer, off the visible canvas.
            subject.visible = false;
            scene.add(avatar.scene);
            const previousTarget = renderer.getRenderTarget();
            try {
              renderer.setRenderTarget(warmupTarget);
              renderer.render(scene, camera);
              warmed.add(avatar);
            } finally {
              renderer.setRenderTarget(previousTarget);
              scene.remove(avatar.scene);
              subject.visible = true;
            }
          }
        : undefined,
    };
    viewer.current = state;
    scene.add(subject);
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

    function resize() {
      if (!host || !host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      if (inPicker) {
        const distance = Math.max(4.65, 1.85 / camera.aspect);
        camera.position.set(0, 1.16, distance);
        camera.lookAt(0, 1.03, 0);
      } else if (framing === 'call') {
        const avatar = viewer.current?.model?.avatar;
        const head = avatar?.humanoid.getNormalizedBoneNode('head');
        const hips = avatar?.humanoid.getNormalizedBoneNode('hips');
        const headHeight = head?.getWorldPosition(new THREE.Vector3()).y ?? 1.7;
        const hipHeight = hips?.getWorldPosition(new THREE.Vector3()).y ?? 0.91;
        const top = Math.max(headHeight + 0.22, 2.11);
        const bottom = Math.min(hipHeight - 0.04, top - 0.94);
        const target = (top + bottom) / 2;
        const fit = Math.max((top - bottom) / 2, 0.44 / camera.aspect);
        const distance = fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 0.22;
        camera.position.set(0, target, distance);
        camera.lookAt(0, target, 0);
      }
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight, false);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const clock = new THREE.Clock();
    let elapsed = 0;
    let pickerElapsed = 0;
    let lastModel: LoadedVrm | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const { pickerAngleDegrees, amplitudeDegrees, periodSeconds } = avatarMotionSettings.stageTurn;
    const baseAngle = inPicker ? THREE.MathUtils.degToRad(pickerAngleDegrees) : 0;
    const swayAngle = THREE.MathUtils.degToRad(amplitudeDegrees);
    const radiansPerSecond = periodSeconds > 0 ? (2 * Math.PI) / periodSeconds : 0;
    const render = () => {
      frameId = window.requestAnimationFrame(render);
      const frameDelta = clock.getDelta();
      const delta = inPicker ? Math.min(frameDelta, 0.05) : frameDelta;
      elapsed += delta;
      subject.rotation.y = inPicker
        ? baseAngle + (pickerRotation?.current ?? 0)
        : Math.sin(elapsed * radiansPerSecond) * swayAngle;
      const model = viewer.current?.model;
      pickerElapsed = model === lastModel && !reducedMotion.matches ? pickerElapsed + delta : 0;
      lastModel = model;
      model?.updateMotion(inPicker ? pickerElapsed : elapsed, delta, mouth?.current ?? 0);
      state.draw();
    };
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      if (viewer.current?.fallback) VRMUtils.deepDispose(viewer.current.fallback);
      viewer.current = null;
      subject.clear();
      state.cache.retain([]);
      warmupTarget?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [inPicker, pickerRotation, framing, mouth]);

  useEffect(() => {
    const state = viewer.current;
    if (!state) {
      if (previewId) onPreviewReady?.(previewId);
      return;
    }
    const { subject, cache } = state;
    let cancelled = false;
    const warmupTimers: number[] = [];
    cache.retain([state.source, src, ...preloadSources]);

    const showTutor = async () => {
      const model = src ? await cache.get(src) : undefined;
      if (cancelled) return;

      subject.clear();
      if (state.fallback) VRMUtils.deepDispose(state.fallback);
      state.fallback = model || !previewId ? undefined : createPreviewFigure(previewId);
      state.model = model;
      state.source = model ? src : undefined;
      if (model) {
        subject.add(model.avatar.scene);
        if (inPicker) model.updateMotion(0, 0, 0);
        if (framing === 'call') state.resize();
      }
      if (state.fallback) subject.add(state.fallback);
      if (previewId) {
        if (pickerRotation) pickerRotation.current = 0;
        subject.rotation.y = THREE.MathUtils.degToRad(avatarMotionSettings.stageTurn.pickerAngleDegrees);
        state.draw();
      }
      setLoaded(Boolean(model || state.fallback));
      if (previewId) onPreviewReady?.(previewId);

      cache.retain([src, ...preloadSources]);
      const warmAfter = performance.now() + 300;
      for (const neighbor of preloadSources) {
        if (cancelled) break;
        const upcoming = await cache.get(neighbor);
        if (!cancelled && upcoming && upcoming !== state.model) {
          // Keep background GPU uploads outside the visible tutor reveal.
          const delay = Math.max(0, warmAfter - performance.now()) + warmupTimers.length * 32;
          warmupTimers.push(window.setTimeout(() => state.prepare?.(upcoming.avatar), delay));
        }
      }
    };

    void showTutor();
    return () => {
      cancelled = true;
      warmupTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [src, previewId, preloadSources, onPreviewReady, inPicker, pickerRotation, framing]);

  return (
    <div
      ref={hostRef}
      className={`vrm-avatar ${loaded ? 'vrm-ready' : ''} ${unavailable ? 'vrm-unavailable' : ''}`}
      aria-label="Animated 3D tutor"
    />
  );
}
