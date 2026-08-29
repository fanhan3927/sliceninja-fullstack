/**
 * 粒子系统：果汁 / 火花，对象池复用，硬上限 PARTICLE_CAP（超出覆盖最旧）。
 */

import { PARTICLE_CAP } from "./constants";
import type { Particle } from "./types";

export class ParticleSystem {
  private particles: Particle[] = [];

  /** 喷发一组粒子（圆形随机方向 + 速度分布） */
  burst(
    x: number,
    y: number,
    color: string,
    count: number,
    speedMin: number,
    speedMax: number,
    gravityScale = 0.35
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const maxAge = 280 + Math.random() * 380;
      const p: Particle = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        size: 2 + Math.random() * 4,
        color,
        ageMs: 0,
        maxAgeMs: maxAge,
        gravityScale,
      };
      if (this.particles.length >= PARTICLE_CAP) {
        // 回收最旧粒子
        this.particles.shift();
      }
      this.particles.push(p);
    }
  }

  update(gravity: number, stepMs: number): void {
    const list = this.particles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.vy += gravity * p.gravityScale;
      p.x += p.vx;
      p.y += p.vy;
      p.ageMs += stepMs;
      if (p.ageMs >= p.maxAgeMs) {
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  clear(): void {
    this.particles = [];
  }

  get items(): readonly Particle[] {
    return this.particles;
  }
}
