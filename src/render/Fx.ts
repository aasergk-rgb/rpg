import * as THREE from 'three';

const MAX = 1400;

interface Particle {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  max: number;
  scale: number;
}

/** パーティクル・閃光・神経ケーブル・衝撃波などのエフェクト管理 */
export class Fx {
  private parts: Particle[] = [];
  private geo = new THREE.BufferGeometry();
  private posArr = new Float32Array(MAX * 3);
  private colArr = new Float32Array(MAX * 3);
  private sizeArr = new Float32Array(MAX);
  private alphaArr = new Float32Array(MAX);
  private points: THREE.Points;
  private lights: { light: THREE.PointLight; t: number; max: number; base: number }[] = [];
  private rings: Ring[] = [];
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  private cables: { line: THREE.Line; from: () => THREE.Vector3; to: () => THREE.Vector3; t: number; max: number }[] = [];
  private cursor = 0;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) {
      this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1, color: new THREE.Color(), gravity: 0, drag: 0 });
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vColor * (1.0 + a), a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    window.addEventListener('resize', () => (mat.uniforms.uScale.value = window.innerHeight * 0.5));

    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffaa55, 0, 9, 2);
      scene.add(light);
      this.lights.push({ light, t: 0, max: 0, base: 0 });
    }
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, color: number | THREE.Color, size: number, life: number, gravity = 0, drag = 1): void {
    const q = this.parts[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    q.alive = true;
    q.p.copy(p);
    q.v.copy(v);
    q.color.set(color);
    q.size = size;
    q.life = life;
    q.max = life;
    q.gravity = gravity;
    q.drag = drag;
  }

  private rv(scale: number, upBias = 0): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2 + upBias, (Math.random() - 0.5) * 2).multiplyScalar(scale);
  }

  flash(p: THREE.Vector3, color: number, intensity: number, dur = 0.12): void {
    const l = this.lights.reduce((a, b) => (a.t / Math.max(a.max, 1e-3) > b.t / Math.max(b.max, 1e-3) ? a : b));
    l.light.position.copy(p);
    l.light.color.set(color);
    l.light.intensity = intensity;
    l.base = intensity;
    l.t = 0;
    l.max = dur;
  }

  /** 金属に弾かれた火花 */
  sparks(p: THREE.Vector3, n = 18, color = 0xffc070): void {
    for (let i = 0; i < n; i++) this.spawn(p, this.rv(7, 0.6), color, 0.08 + Math.random() * 0.06, 0.25 + Math.random() * 0.25, -14, 2.5);
    this.flash(p, 0xffb060, 6, 0.08);
  }

  /** 肉を断った血飛沫（暗い赤） */
  blood(p: THREE.Vector3, dir: THREE.Vector3, n = 22): void {
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(3 + Math.random() * 4).add(this.rv(2.5, 0.8));
      this.spawn(p, v, Math.random() < 0.5 ? 0x8a0a0a : 0x5a0505, 0.12 + Math.random() * 0.12, 0.45 + Math.random() * 0.3, -16, 1.2);
    }
  }

  /** 切断時の瘴気噴出 */
  severBurst(p: THREE.Vector3): void {
    for (let i = 0; i < 40; i++) this.spawn(p, this.rv(5, 0.5), i % 3 === 0 ? 0x66ccff : 0x8a0a0a, 0.18, 0.6 + Math.random() * 0.4, -6, 1.5);
    this.flash(p, 0x66ccff, 10, 0.25);
    this.ring(p, 0x66ccff, 3, 0.4);
  }

  ring(p: THREE.Vector3, color: number, scale: number, dur: number): void {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(p).setY(p.y + 0.05);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, max: dur, scale });
  }

  explosion(p: THREE.Vector3, radius: number): void {
    for (let i = 0; i < 90; i++) this.spawn(p, this.rv(radius * 3.2, 0.5), i % 2 ? 0xff7a20 : 0xffd060, 0.3 + Math.random() * 0.3, 0.5 + Math.random() * 0.4, -3, 2);
    for (let i = 0; i < 30; i++) this.spawn(p, this.rv(radius, 1), 0x332222, 0.6, 1.2, 1, 1);
    this.flash(p, 0xff8030, 30, 0.35);
    this.ring(p, 0xffa040, radius * 1.2, 0.45);
  }

  fire(p: THREE.Vector3, dir: THREE.Vector3, n = 4, spread = 0.25, speed = 10): void {
    for (let i = 0; i < n; i++) {
      const v = dir.clone().add(this.rv(spread)).normalize().multiplyScalar(speed * (0.7 + Math.random() * 0.5));
      this.spawn(p, v, Math.random() < 0.4 ? 0xffd060 : 0xff5010, 0.25 + Math.random() * 0.25, 0.35 + Math.random() * 0.2, 2, 2.5);
    }
  }

  steam(p: THREE.Vector3, n = 2): void {
    for (let i = 0; i < n; i++) this.spawn(p, this.rv(0.6, 1.5), 0x667080, 0.35, 0.6, 1, 1.5);
  }

  pulseMote(p: THREE.Vector3, color = 0x66ccff): void {
    this.spawn(p, this.rv(0.4, 1), color, 0.07, 0.6, 0.5, 1);
  }

  /** 左腕の義手ソケットから伸びる神経ケーブル */
  cable(from: () => THREE.Vector3, to: () => THREE.Vector3, dur: number): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x66e0ff, transparent: true, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.cables.push({ line, from, to, t: 0, max: dur });
  }

  update(dt: number, realDt: number): void {
    for (let i = 0; i < MAX; i++) {
      const q = this.parts[i];
      if (q.alive) {
        q.life -= dt;
        if (q.life <= 0) {
          q.alive = false;
        } else {
          q.v.y += q.gravity * dt;
          q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
          q.p.addScaledVector(q.v, dt);
        }
      }
      const k = q.alive ? q.life / q.max : 0;
      this.posArr[i * 3] = q.p.x;
      this.posArr[i * 3 + 1] = q.p.y;
      this.posArr[i * 3 + 2] = q.p.z;
      this.colArr[i * 3] = q.color.r;
      this.colArr[i * 3 + 1] = q.color.g;
      this.colArr[i * 3 + 2] = q.color.b;
      this.sizeArr[i] = q.alive ? q.size * (0.5 + k * 0.5) : 0;
      this.alphaArr[i] = k;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;

    for (const l of this.lights) {
      if (l.max <= 0) continue;
      l.t += realDt;
      const k = Math.max(0, 1 - l.t / l.max);
      l.light.intensity = l.base * k;
      if (k <= 0) l.max = 0;
    }
    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / r.max;
      r.mesh.scale.setScalar(0.2 + r.scale * k);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    this.cables = this.cables.filter((c) => {
      c.t += realDt;
      const a = c.from();
      const b = c.to();
      const attr = c.line.geometry.attributes.position as THREE.BufferAttribute;
      const k = Math.min(1, c.t / (c.max * 0.5));
      for (let i = 0; i < 24; i++) {
        const u = (i / 23) * k;
        const p = a.clone().lerp(b, u);
        const sag = Math.sin(u * Math.PI) * 0.6 * (1 - c.t / c.max);
        const wob = Math.sin(u * 30 + c.t * 40) * 0.05;
        p.y += sag + wob;
        attr.setXYZ(i, p.x, p.y, p.z);
      }
      attr.needsUpdate = true;
      (c.line.material as THREE.LineBasicMaterial).opacity = 1 - Math.max(0, (c.t - c.max * 0.7) / (c.max * 0.3));
      if (c.t >= c.max) {
        this.scene.remove(c.line);
        c.line.geometry.dispose();
        (c.line.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }
}
