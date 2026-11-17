import * as THREE from 'three';

/**
 * PBR マテリアルにフレネル（リムライト）を注入する。
 * 暗いダンジョンでもシルエットと予備動作が視認できるようにするため。
 */
export function addRim(mat: THREE.MeshStandardMaterial, color = 0x88aaff, power = 2.5, strength = 0.6): THREE.MeshStandardMaterial {
  const rimColor = new THREE.Color(color);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * pow(rim, uRimPower) * uRimStrength;
}`,
      );
  };
  mat.customProgramCacheKey = () => `rim-${color}-${power}-${strength}`;
  return mat;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** 共有マテリアル（ドローコール・シェーダコンパイル削減） */
export function mat(
  key: string,
  opts: THREE.MeshStandardMaterialParameters & { rim?: number; rimPower?: number; rimStrength?: number },
): THREE.MeshStandardMaterial {
  let m = cache.get(key);
  if (m) return m;
  const { rim, rimPower, rimStrength, ...rest } = opts;
  m = new THREE.MeshStandardMaterial(rest);
  if (rim !== undefined) addRim(m, rim, rimPower ?? 2.5, rimStrength ?? 0.6);
  cache.set(key, m);
  return m;
}

export const M = {
  playerCloth: () => mat('pCloth', { color: 0x4a4038, roughness: 0.9, metalness: 0.0, rim: 0x88aaff, rimStrength: 0.9 }),
  playerLeather: () => mat('pLeather', { color: 0x5a4030, roughness: 0.7, metalness: 0.1, rim: 0x88aaff, rimStrength: 0.8 }),
  playerSkin: () => mat('pSkin', { color: 0x8a6f60, roughness: 0.6, rim: 0x6688ff, rimStrength: 0.3 }),
  graftMetal: () => mat('graftMetal', { color: 0x6a5a4a, roughness: 0.35, metalness: 0.9, emissive: 0x401000, emissiveIntensity: 0.6, rim: 0xffaa66, rimStrength: 0.5 }),
  steel: () => mat('steel', { color: 0xb8bcc4, roughness: 0.25, metalness: 1.0, rim: 0xaaccff, rimStrength: 0.4 }),
  darkSteel: () => mat('darkSteel', { color: 0x4a4c52, roughness: 0.35, metalness: 0.95, rim: 0xff6644, rimStrength: 0.55 }),
  rust: () => mat('rust', { color: 0x5a3a28, roughness: 0.75, metalness: 0.6, rim: 0xff6644, rimStrength: 0.5 }),
  flesh: () => mat('flesh', { color: 0x6e2a2a, roughness: 0.55, metalness: 0.0, rim: 0xff4040, rimStrength: 0.6 }),
  bone: () => mat('bone', { color: 0xb8ae98, roughness: 0.7, rim: 0xff5533, rimStrength: 0.5 }),
  ghoulSkin: () => mat('ghoulSkin', { color: 0x4a5244, roughness: 0.8, rim: 0xff5533, rimStrength: 0.65 }),
  houndHide: () => mat('houndHide', { color: 0x2c1e1a, roughness: 0.8, rim: 0xff7a33, rimStrength: 0.7 }),
  bruteHide: () => mat('bruteHide', { color: 0x5a4a3c, roughness: 0.85, rim: 0xff5533, rimStrength: 0.6 }),
  ember: () => mat('ember', { color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.6 }),
  eye: () => mat('eye', { color: 0x000000, emissive: 0xff2a10, emissiveIntensity: 3 }),
  stone: () => mat('stone', { color: 0x4a4744, roughness: 0.92, metalness: 0.0 }),
  stoneDark: () => mat('stoneDark', { color: 0x2e2c2a, roughness: 0.95 }),
  floor: () => mat('floor', { color: 0x37332f, roughness: 0.88 }),
  wood: () => mat('wood', { color: 0x3a2818, roughness: 0.85 }),
  iron: () => mat('iron', { color: 0x3c3a38, roughness: 0.5, metalness: 0.85 }),
  thorn: () => mat('thorn', { color: 0x1e2a12, roughness: 0.8, emissive: 0x2a4010, emissiveIntensity: 0.4, rim: 0x88ff44, rimStrength: 0.4 }),
  titanFlesh: () => mat('titanFlesh', { color: 0x3a1418, roughness: 0.5, emissive: 0x300508, emissiveIntensity: 0.5 }),
};

/** 破壊可能部位を示す魔力の脈動用マテリアル（個別インスタンス） */
export function pulseMaterial(base: THREE.MeshStandardMaterial, pulseColor = 0x66ccff): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  m.emissive = new THREE.Color(pulseColor);
  m.emissiveIntensity = 0;
  m.userData.pulse = true;
  return m;
}
