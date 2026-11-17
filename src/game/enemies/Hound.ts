import * as THREE from 'three';
import { Enemy } from '../Enemy';
import { M } from '../../render/Materials';
import { makePart } from '../Parts';
import { buildGraftMesh } from '../GraftModels';
import type { Game } from '../Game';
import type { EnemyAttack } from '../Enemy';

/** 火喰い猟犬：四足獣。火袋の顎から火炎を吐く */
export class Hound extends Enemy {
  readonly type = 'hound' as const;
  readonly name = '火喰い猟犬';
  private body = new THREE.Group();
  private headG = new THREE.Group();
  private jaw: THREE.Group;
  private legs: THREE.Group[] = [];
  private tail = new THREE.Group();

  constructor(game: Game) {
    super(game);
    this.hp = this.hpMax = 160;
    this.poise = this.poiseMax = 30;
    this.stunMax = 50;
    this.speed = 5.2;
    this.radius = 0.7;
    this.height = 1.4;
    this.aggroRange = 15;
    const hide = M.houndHide();
    this.group.add(this.body);
    this.body.position.y = 0.95;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 1.4), hide);
    this.body.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), hide);
    chest.position.set(0, 0.05, 0.55);
    this.body.add(chest);
    // 背中の燃える瘤
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), M.ember());
      s.position.set(0, 0.33, 0.4 - i * 0.3);
      this.body.add(s);
    }
    this.headG.position.set(0, 0.2, 0.9);
    this.body.add(this.headG);
    this.jaw = buildGraftMesh('jaw', 1.1);
    this.jaw.rotation.x = 0;
    this.jaw.position.set(0, 0, 0.25);
    this.headG.add(this.jaw);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), M.eye());
    eye.position.set(0.14, 0.12, 0.1);
    this.headG.add(eye, eye.clone().translateX(-0.28));
    for (const [x, z] of [[0.25, 0.5], [-0.25, 0.5], [0.25, -0.55], [-0.25, -0.55]]) {
      const leg = new THREE.Group();
      leg.position.set(x, -0.2, z);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.5, 6), hide);
      upper.position.y = -0.25;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.45, 6), M.bone());
      lower.position.set(0, -0.62, 0.05);
      leg.add(upper, lower);
      this.body.add(leg);
      this.legs.push(leg);
    }
    this.tail.position.set(0, 0.15, -0.7);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 6), hide);
    t.rotation.x = -Math.PI / 2 - 0.4;
    t.position.z = -0.35;
    this.tail.add(t);
    this.body.add(this.tail);

    const anchor = (p: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      p.add(o);
      return o;
    };
    this.parts = {
      body: makePart({ id: 'body', name: '胴体', hp: 9999, radius: 0.6 }),
      jaw: makePart({ id: 'jaw', name: '頭部（火袋の顎）', hp: 50, weak: 1.6, severable: true, graft: 'jaw', radius: 0.4 }),
      legs: makePart({ id: 'legs', name: '前脚', hp: 55, radius: 0.35 }),
    };
    this.partOrder = ['body', 'jaw', 'legs'];
    this.partNodes = { body: anchor(this.body, 0, 0, 0), jaw: anchor(this.headG, 0, 0, 0.25), legs: anchor(this.legs[0], -0.25, -0.4, 0) };
    this.partVisuals = { jaw: [this.headG], legs: [this.legs[0], this.legs[1]] };

    this.patterns = [
      { id: 'bite', name: '噛みつき', anim: 'bite', windup: 0.42, active: 0.14, recovery: 0.5, damage: 22, range: 1.9, arc: 70, weight: 3, requires: ['jaw'], lunge: 3 },
      { id: 'claw', name: '前脚払い', anim: 'claw', windup: 0.45, active: 0.14, recovery: 0.5, damage: 18, range: 1.7, arc: 100, weight: 1.5 },
      { id: 'breath', name: '火炎ブレス', anim: 'breath', windup: 0.75, active: 1.2, recovery: 0.6, damage: 8, hits: 7, range: 6, arc: 40, fire: true, weight: 2.5, minRange: 1.5, requires: ['jaw'], track: 1.2 },
      { id: 'pounce', name: '咆哮の跳躍', anim: 'pounce', windup: 0.8, active: 0.35, recovery: 0.8, damage: 36, range: 5.5, arc: 50, lunge: 13, red: true, heavy: true, knock: 7, weight: 1.5, minRange: 2.5, requires: ['legs'] },
    ];
    this.finalizeModel();
  }

  protected onAttackPulse(a: EnemyAttack): void {
    if (a.fire) this.game.sfx('fire');
  }

  protected onSever(partId: string): void {
    super.onSever(partId);
    if (partId === 'jaw') this.game.hud.toast('顎を失った猟犬はもう火を吐けない');
  }

  protected onBreak(partId: string): void {
    super.onBreak(partId);
    if (partId === 'legs') this.speed = 2.5;
  }

  animate(dt: number, time: number): void {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
    const phase = this.walkPhase * 1.4;
    const amt = Math.min(1, this.moveAmt);
    let bodyPitch = 0;
    let headPitch = 0;
    let bodyY = 0.95;
    switch (this.state) {
      case 'attack': {
        const a = this.attack!;
        const t = this.stateT;
        const wind = Math.min(1, t / a.windup);
        const act = t >= a.windup && t < a.windup + a.active;
        if (a.anim === 'breath') {
          headPitch = t < a.windup ? -0.5 * wind : 0.15;
          bodyPitch = t < a.windup ? 0.15 * wind : 0;
          if (act) {
            const mouth = this.headG.getWorldPosition(new THREE.Vector3());
            const f = new THREE.Vector3(Math.sin(this.facing), -0.08, Math.cos(this.facing));
            this.game.fx.fire(mouth.addScaledVector(f, 0.5), f, 4, 0.16, 12);
          } else if (t < a.windup) this.game.fx.fire(this.headG.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 1, 0.3, 1);
        } else if (a.anim === 'pounce') {
          bodyPitch = t < a.windup ? 0.35 * wind : act ? -0.3 : 0;
          bodyY = t < a.windup ? 0.95 - 0.3 * wind : act ? 1.4 : 0.95;
        } else {
          headPitch = t < a.windup ? -0.4 * wind : act ? 0.4 : 0;
          bodyPitch = t < a.windup ? 0.2 * wind : -0.1;
        }
        break;
      }
      case 'stagger':
      case 'flinch':
        bodyPitch = -0.3 * Math.sin(Math.min(1, this.stateT / 0.5) * Math.PI);
        break;
      case 'down':
        bodyY = 0.95 - Math.min(1, this.stateT * 4) * 0.55;
        this.group.rotation.z = Math.min(1, this.stateT * 4) * 1.2;
        break;
      case 'recover':
        bodyY = 0.4 + Math.min(1, this.stateT / 0.6) * 0.55;
        this.group.rotation.z = 1.2 * (1 - Math.min(1, this.stateT / 0.6));
        break;
      case 'dead':
        bodyY = 0.95 - Math.min(1, this.deadT * 3) * 0.6;
        this.group.rotation.z = Math.min(1, this.deadT * 3) * 1.5;
        if (this.deadT > 2.2) this.group.position.y -= (this.deadT - 2.2) * 0.8;
        break;
      default:
        this.group.rotation.z = 0;
    }
    if (this.state !== 'down' && this.state !== 'recover' && this.state !== 'dead') this.group.rotation.z = 0;
    this.body.position.y = bodyY + Math.abs(Math.sin(phase)) * 0.08 * amt;
    this.body.rotation.x = bodyPitch;
    this.headG.rotation.x = headPitch + Math.sin(time * 3) * 0.04;
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 * amt));
    this.tail.rotation.y = Math.sin(time * 5) * 0.4;
    this.updateVisualFx(time);
    void dt;
  }
}
