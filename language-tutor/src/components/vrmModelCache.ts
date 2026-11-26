import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

type CacheEntry = {
  controller: AbortController;
  model: Promise<VRM | undefined>;
};

// One cache per viewer. Keeping parsed models also preserves their textures
// and geometry when a tutor leaves and then returns to the stage.
export default function createVrmModelCache() {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const entries = new Map<string, CacheEntry>();

  async function load(src: string, signal: AbortSignal) {
    const url = new URL(src, document.baseURI);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not load VRM (${response.status})`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();

    const gltf = await loader.parseAsync(bytes, new URL('.', url).href);
    const avatar = gltf.userData.vrm as VRM | undefined;
    if (signal.aborted || !avatar) {
      VRMUtils.deepDispose(gltf.scene);
      return;
    }

    VRMUtils.rotateVRM0(avatar);
    const bounds = new Box3().setFromObject(avatar.scene);
    const height = Math.max(bounds.max.y - bounds.min.y, 0.01);
    const scale = 2.05 / height;
    const center = bounds.getCenter(new Vector3());
    avatar.scene.scale.setScalar(scale);
    avatar.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    return avatar;
  }

  function get(src: string) {
    const cached = entries.get(src);
    if (cached) return cached.model;

    const controller = new AbortController();
    const model = load(src, controller.signal)
      .catch(() => undefined)
      .then((avatar) => {
        if (!avatar && entries.get(src)?.controller === controller) entries.delete(src);
        return avatar;
      });
    entries.set(src, { controller, model });
    return model;
  }

  function retain(sources: (string | undefined)[]) {
    const retained = new Set(sources);
    for (const [src, entry] of entries) {
      if (retained.has(src)) continue;
      entries.delete(src);
      entry.controller.abort();
      void entry.model.then((avatar) => {
        if (avatar) VRMUtils.deepDispose(avatar.scene);
      });
    }
  }

  return { get, retain };
}
