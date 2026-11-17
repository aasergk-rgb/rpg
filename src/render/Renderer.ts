import * as THREE from 'three';

export type Quality = 'low' | 'mid' | 'high';

/** レンダラー：PBR・トーンマッピング・プレイヤー追従シャドウ・動的解像度 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private pixelRatio = 1;
  private maxPixelRatio = 2;
  private minPixelRatio = 0.6;
  private frameAvg = 1 / 60;
  private adjustCooldown = 0;
  quality: Quality;
  targetFps = 60;

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = quality === 'high' ? 2 : quality === 'mid' ? 1.5 : 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);

    this.scene.background = new THREE.Color(0x07060a);
    this.scene.fog = new THREE.FogExp2(0x0a0810, 0.028);

    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);

    this.hemi = new THREE.HemisphereLight(0x8a9ad0, 0x2a1a14, 0.95);
    this.scene.add(this.hemi);
    const amb = new THREE.AmbientLight(0x3a3040, 0.7);
    this.scene.add(amb);

    this.sun = new THREE.DirectionalLight(0xffd8b0, 1.4);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const s = 14;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 影をプレイヤー周辺のみに限定して追従させる */
  followShadow(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 10, focus.y + 22, focus.z - 8);
    this.sun.target.position.copy(focus);
  }

  /** フレーム時間から解像度スケールを自動調整し 60fps を維持する */
  adapt(frameDt: number): void {
    this.frameAvg = this.frameAvg * 0.95 + frameDt * 0.05;
    this.adjustCooldown -= frameDt;
    if (this.adjustCooldown > 0) return;
    const budget = 1 / this.targetFps;
    if (this.frameAvg > budget * 1.18 && this.pixelRatio > this.minPixelRatio) {
      this.pixelRatio = Math.max(this.minPixelRatio, this.pixelRatio - 0.1);
      this.resize();
      this.adjustCooldown = 1.5;
    } else if (this.frameAvg < budget * 0.8 && this.pixelRatio < Math.min(window.devicePixelRatio || 1, this.maxPixelRatio)) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.05);
      this.resize();
      this.adjustCooldown = 3;
    }
  }

  get fps(): number {
    return 1 / this.frameAvg;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
