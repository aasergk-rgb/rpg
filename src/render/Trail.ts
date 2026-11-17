import * as THREE from 'three';

const N = 14;

/** 武器の剣閃トレイル（根元と先端の軌跡をリボン状に描画） */
export class Trail {
  readonly mesh: THREE.Mesh;
  private base: THREE.Vector3[] = [];
  private tip: THREE.Vector3[] = [];
  private pos: Float32Array;
  private alpha: Float32Array;
  private fade = 0;
  active = false;

  constructor(scene: THREE.Scene, color: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.alpha = new Float32Array(N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor * 1.6, vA * uFade * 0.75); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setColor(c: number): void {
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.uColor.value as THREE.Color).set(c);
  }

  push(base: THREE.Vector3, tip: THREE.Vector3): void {
    if (!this.active) {
      this.base = [];
      this.tip = [];
      this.active = true;
    }
    this.base.unshift(base.clone());
    this.tip.unshift(tip.clone());
    if (this.base.length > N) {
      this.base.pop();
      this.tip.pop();
    }
    this.fade = 1;
  }

  stop(): void {
    this.active = false;
  }

  update(dt: number): void {
    if (!this.active) this.fade -= dt * 6;
    if (this.fade <= 0 || this.base.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    for (let i = 0; i < N; i++) {
      const b = this.base[Math.min(i, this.base.length - 1)];
      const t = this.tip[Math.min(i, this.tip.length - 1)];
      this.pos.set([b.x, b.y, b.z], i * 6);
      this.pos.set([t.x, t.y, t.z], i * 6 + 3);
      const a = i < this.base.length ? 1 - i / N : 0;
      this.alpha[i * 2] = a * 0.2;
      this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uFade.value = Math.max(0, this.fade);
  }
}
