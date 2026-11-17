import type { Pose } from '../render/Rig';
import type { SwingAnim } from './Types';

export const NEUTRAL: Pose = {
  shoulderR: [-0.35, -0.15, 0],
  elbowR: [-0.7, 0, 0],
  shoulderL: [-0.25, 0.1, 0.1],
  elbowL: [-0.6, 0, 0],
  torso: [0.08, 0, 0],
};

/** 武器グリップ角（0:刃を前方垂直, PI:腕の延長） */
export interface SwingDef {
  windup: Pose;
  strike: Pose;
  grip: number;
  spin?: boolean;
}

export const SWINGS: Record<SwingAnim, SwingDef> = {
  slashR: {
    windup: { shoulderR: [-1.45, -1.5, 0], elbowR: [-0.3, 0, 0], torso: [0.1, -0.6, 0], shoulderL: [-0.5, 0.3, 0] },
    strike: { shoulderR: [-1.45, 1.2, 0], elbowR: [-0.1, 0, 0], torso: [0.15, 0.7, 0], shoulderL: [-0.2, 0, 0.3] },
    grip: Math.PI * 0.95,
  },
  slashL: {
    windup: { shoulderR: [-1.5, 1.1, 0], elbowR: [-0.8, 0, 0], torso: [0.1, 0.6, 0] },
    strike: { shoulderR: [-1.3, -1.4, 0], elbowR: [-0.1, 0, 0], torso: [0.15, -0.7, 0] },
    grip: Math.PI * 0.95,
  },
  overhead: {
    windup: { shoulderR: [-3.0, -0.2, 0], elbowR: [-0.9, 0, 0], torso: [-0.2, -0.2, 0], shoulderL: [-2.6, 0.3, 0] },
    strike: { shoulderR: [-0.55, 0, 0], elbowR: [0, 0, 0], torso: [0.45, 0, 0], shoulderL: [-0.6, 0.3, 0] },
    grip: Math.PI,
  },
  thrust: {
    windup: { shoulderR: [-1.0, -0.4, 0], elbowR: [-1.9, 0, 0], torso: [0, -0.5, 0] },
    strike: { shoulderR: [-1.62, 0.05, 0], elbowR: [0, 0, 0], torso: [0.2, 0.35, 0], shoulderL: [-0.1, 0, 0.4] },
    grip: Math.PI,
  },
  rising: {
    windup: { shoulderR: [-0.1, -0.3, 0], elbowR: [-0.2, 0, 0], torso: [0.35, -0.3, 0] },
    strike: { shoulderR: [-3.1, 0.2, 0], elbowR: [0, 0, 0], torso: [-0.25, 0.25, 0] },
    grip: Math.PI,
  },
  spin: {
    windup: { shoulderR: [-1.5, -1.3, 0], elbowR: [-0.1, 0, 0], shoulderL: [-1.5, 1.3, 0], torso: [0.1, -0.4, 0] },
    strike: { shoulderR: [-1.5, -1.3, 0], elbowR: [-0.1, 0, 0], shoulderL: [-1.5, 1.3, 0], torso: [0.1, -0.4, 0] },
    grip: Math.PI,
    spin: true,
  },
  smash: {
    windup: { shoulderR: [-3.1, -0.1, 0], elbowR: [-0.6, 0, 0], shoulderL: [-3.0, 0.1, 0], elbowL: [-0.6, 0, 0], torso: [-0.3, 0, 0] },
    strike: { shoulderR: [-0.3, 0, 0], elbowR: [0, 0, 0], shoulderL: [-0.3, 0, 0], torso: [0.6, 0, 0], hipL: [-0.4, 0, 0], kneeL: [0.5, 0, 0] },
    grip: Math.PI,
  },
  whip: {
    windup: { shoulderR: [-1.2, -1.8, 0], elbowR: [-1.2, 0, 0], torso: [0.1, -0.8, 0] },
    strike: { shoulderR: [-1.5, 1.6, 0], elbowR: [0, 0, 0], torso: [0.2, 0.9, 0] },
    grip: Math.PI,
  },
  graftPunch: {
    windup: { shoulderL: [-1.0, 0.5, 0], elbowL: [-2.0, 0, 0], torso: [0, 0.5, 0], shoulderR: [-0.2, 0, -0.3] },
    strike: { shoulderL: [-1.62, -0.1, 0], elbowL: [0, 0, 0], torso: [0.15, -0.45, 0], shoulderR: [-0.1, 0, -0.4] },
    grip: Math.PI * 0.6,
  },
  graftBeam: {
    windup: { shoulderL: [-1.4, 0.2, 0], elbowL: [-0.4, 0, 0], torso: [0, -0.3, 0], shoulderR: [-1.0, 0.6, 0], elbowR: [-1.2, 0, 0] },
    strike: { shoulderL: [-1.55, 0, 0], elbowL: [0, 0, 0], torso: [0.1, -0.35, 0], shoulderR: [-1.0, 0.6, 0], elbowR: [-1.2, 0, 0] },
    grip: Math.PI * 0.6,
  },
  graftGuard: {
    windup: { shoulderL: [-1.3, -0.5, 0], elbowL: [-1.4, 0, 0], torso: [0.1, -0.2, 0], shoulderR: [-0.3, 0, -0.2] },
    strike: { shoulderL: [-1.6, 0, 0], elbowL: [-0.1, 0, 0], torso: [0.25, -0.4, 0], shoulderR: [-0.3, 0, -0.2] },
    grip: Math.PI * 0.6,
  },
};

export const STEP_POSE: Pose = { torso: [0.5, 0, 0], hipL: [-1.0, 0, 0], kneeL: [1.2, 0, 0], hipR: [-0.3, 0, 0], kneeR: [0.9, 0, 0], shoulderR: [-0.3, 0, -0.3], shoulderL: [-0.3, 0, 0.3] };
export const PARRY_POSE: Pose = { shoulderR: [-1.6, 0.9, 0], elbowR: [-1.2, 0, 0], torso: [-0.05, 0.4, 0], shoulderL: [-0.4, 0, 0.3] };
export const HURT_POSE: Pose = { torso: [-0.45, 0, 0.15], head: [-0.4, 0, 0], shoulderR: [0.2, 0, -0.6], shoulderL: [0.2, 0, 0.6] };
export const HEAL_POSE: Pose = { shoulderL: [-2.2, -0.6, 0], elbowL: [-1.9, 0, 0], head: [-0.3, 0, 0], torso: [-0.05, 0, 0] };
export const PURGE_POSE: Pose = { shoulderL: [-2.6, -0.5, 0.4], elbowL: [-1.4, 0, 0], torso: [-0.15, 0.6, 0], shoulderR: [-0.8, 0.5, 0] };
export const THROW_POSE: Pose = { shoulderL: [-1.3, -0.1, 0], elbowL: [0, 0, 0], torso: [0.3, -0.6, 0], shoulderR: [-0.3, 0, -0.4] };
export const GRAFT_POSE: Pose = { shoulderL: [-1.5, 0.6, 0], elbowL: [-0.2, 0, 0], torso: [0.1, -0.6, 0] };
export const DEAD_POSE: Pose = { torso: [0.9, 0, 0], head: [0.5, 0, 0], shoulderR: [0.3, 0, -0.4], shoulderL: [0.3, 0, 0.4], hipL: [-1.2, 0, 0], kneeL: [1.8, 0, 0], hipR: [-1.0, 0, 0], kneeR: [1.8, 0, 0] };
