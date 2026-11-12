import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/characters';
import { initParams } from '../src/ml/mlp';
import { DEFAULT_LAYOUT } from '../src/ml/policy';
import { DEFAULT_ES, esUpdate, newEsState, perturb } from '../src/ml/es';
import { evaluate, EvalSpec, exam } from '../src/ml/evaluate';
import { Rng } from '../src/sim/world';
import { EPISODE_FRAMES } from '../src/ml/env';

describe('浏览器端 AI 训练', () => {
  it('进化若干代后,对脚本 AI 的表现明显提升', () => {
    const rng = new Rng(5);
    const st = newEsState(initParams(DEFAULT_LAYOUT, () => rng.next()));
    const cfg = { ...DEFAULT_ES, pairs: 16 };
    const spec: EvalSpec = { hero: 'kael', foe: 'kael', layout: DEFAULT_LAYOUT, seed: 1, scriptAggression: 0.6, pool: [] };
    const before = exam(ROSTER, st.theta, spec, 8);
    const tmp = new Float32Array(st.theta.length);
    const t0 = Date.now();
    const GENS = 25;
    for (let g = 0; g < GENS; g++) {
      spec.seed = 100 + g * 7;
      const seeds: number[] = [], pos: number[] = [], neg: number[] = [];
      for (let k = 0; k < cfg.pairs; k++) {
        const s = 1 + rng.int(2 ** 31 - 2);
        seeds.push(s);
        perturb(st.theta, s, cfg.sigma, 1, tmp); pos.push(evaluate(ROSTER, tmp, spec));
        perturb(st.theta, s, cfg.sigma, -1, tmp); neg.push(evaluate(ROSTER, tmp, spec));
      }
      esUpdate(st, cfg, seeds, pos, neg);
    }
    const secs = (Date.now() - t0) / 1000;
    const after = exam(ROSTER, st.theta, spec, 8);
    const maxSteps = GENS * cfg.pairs * 2 * 2 * EPISODE_FRAMES;
    console.log(JSON.stringify({ before, after, secs, upperBoundStepsPerSec: Math.round(maxSteps / secs) }));
    expect(after.dealt - after.taken).toBeGreaterThan(before.dealt - before.taken);
  }, 240000);
});
