import * as THREE from 'three';

// Original stand-ins for the picker while the corresponding VRM is unavailable.
const looks = {
  vita: { hair: '#362329', skin: '#f2bd9e', jacket: '#c74c42', pants: '#3c3e55', style: 'bun' },
  'victoria-rubin': { hair: '#5b3027', skin: '#c78e69', jacket: '#f1b64c', pants: '#50404d', style: 'curls' },
  'sendagaya-shino': { hair: '#242e40', skin: '#e9b395', jacket: '#5383ae', pants: '#374b5b', style: 'bob' },
  'sakurada-fumiriya': { hair: '#5e3c38', skin: '#f1c6a6', jacket: '#799b80', pants: '#354742', style: 'long' },
  'avatar-sample-b': { hair: '#39313f', skin: '#b98063', jacket: '#9784b6', pants: '#39374a', style: 'short' },
};

export default function createPreviewFigure(id: string) {
  const look = looks[id as keyof typeof looks] ?? looks.vita;
  const figure = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const materials = new Map<string, THREE.MeshStandardMaterial>();

  function oval(
    color: string, x: number, y: number, z: number,
    width: number, height: number, depth: number, tilt = 0,
  ) {
    let material = materials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
      materials.set(color, material);
    }
    const mesh = new THREE.Mesh(sphere, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.rotation.z = tilt;
    figure.add(mesh);
    return mesh;
  }

  const cream = '#fff1d4';
  const ink = '#34282e';
  for (const side of [-1, 1]) {
    oval(look.pants, side * 0.106, 0.37, 0, 0.104, 0.34, 0.106, -side * 0.035);
    oval(cream, side * 0.116, 0.095, 0.054, 0.115, 0.083, 0.163);
  }
  oval(look.jacket, 0, 0.88, 0, 0.256, 0.36, 0.178);
  oval(cream, 0, 0.98, 0.142, 0.097, 0.237, 0.038);
  oval(look.skin, 0, 1.22, 0.015, 0.094, 0.13, 0.09);
  for (const side of [-1, 1]) {
    oval(look.jacket, side * 0.247, 0.92, 0, 0.089, 0.238, 0.099, side * 0.16);
    oval(look.skin, side * 0.278, 0.70, 0.018, 0.069, 0.09, 0.074);
    oval(cream, side * 0.081, 1.163, 0.115, 0.053, 0.09, 0.038, -side * 0.62);
  }
  oval(look.hair, 0, 1.57, -0.056, 0.305, 0.356, 0.238);
  oval(look.skin, 0, 1.54, 0.039, 0.27, 0.30, 0.222);
  for (const side of [-1, 1]) {
    oval(look.skin, side * 0.269, 1.519, 0.035, 0.052, 0.073, 0.043);
    oval('#fff7eb', side * 0.108, 1.559, 0.235, 0.046, 0.054, 0.018);
    oval(ink, side * 0.107, 1.556, 0.25, 0.031, 0.044, 0.011);
    oval('#ffffff', side * 0.107 - 0.009, 1.574, 0.26, 0.009, 0.011, 0.005);
    oval(look.hair, side * 0.11, 1.633, 0.222, 0.051, 0.012, 0.014, side * 0.12);
    oval('#e6a18c', side * 0.165, 1.481, 0.208, 0.041, 0.018, 0.009);
  }
  oval(look.skin, 0, 1.501, 0.256, 0.033, 0.043, 0.034);
  const smile = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.046, 1.441, 0.243), new THREE.Vector3(0, 1.413, 0.251),
    new THREE.Vector3(0.046, 1.444, 0.243),
  );
  figure.add(new THREE.Mesh(new THREE.TubeGeometry(smile, 12, 0.006, 6, false), materials.get(ink)));

  oval(look.hair, -0.105, 1.746, 0.123, 0.198, 0.098, 0.131, 0.47);
  oval(look.hair, 0.13, 1.741, 0.103, 0.162, 0.098, 0.124, -0.61);
  switch (look.style) {
    case 'bun':
      oval(look.hair, 0.078, 1.924, -0.081, 0.159, 0.135, 0.147);
      break;
    case 'curls':
      for (let i = 0; i < 11; i++) {
        const angle = (i / 10) * Math.PI;
        oval(look.hair, 0.277 * Math.cos(angle), 1.43 + 0.389 * Math.sin(angle), -0.012, 0.117, 0.137, 0.144);
      }
      break;
    case 'long':
    case 'bob':
      for (const side of [-1, 1]) {
        const long = look.style === 'long';
        oval(look.hair, side * 0.244, long ? 1.41 : 1.53, -0.01, 0.079, long ? 0.285 : 0.192, 0.13, side * 0.08);
      }
      break;
    case 'short':
      for (const side of [-1, 1]) {
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.008, 8, 32), materials.get(ink));
        frame.position.set(side * 0.094, 1.559, 0.265);
        figure.add(frame);
      }
      oval(ink, 0, 1.566, 0.263, 0.033, 0.007, 0.007);
      break;
  }
  return figure;
}
