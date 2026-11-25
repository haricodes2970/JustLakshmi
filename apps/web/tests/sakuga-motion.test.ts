import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAKUGA_SPRINGS, Spring, volumeSquash } from "../src/components/sakuga/motion-config";

describe("Sakuga spring physics and volume-preserving squash", () => {
  it("converges smoothly to target and settles without NaN or divergence", () => {
    const spring = new Spring(0, SAKUGA_SPRINGS.button);
    spring.to = 1;
    let peak = 0;

    for (let i = 0; i < 120; i++) {
      const x = spring.step(1 / 60);
      assert.ok(Number.isFinite(x));
      if (x > peak) peak = x;
      if (spring.isSettled()) break;
    }

    assert.ok(peak > 1, `expected spring overshoot above 1.0, got ${peak}`);
    assert.equal(spring.x, 1);
    assert.equal(spring.v, 0);
    assert.equal(spring.isSettled(), true);
  });

  it("preserves perceived volume when squashing and stretching", () => {
    const squashed = volumeSquash(0.85);
    assert.ok(squashed.sx > 1, "squashing vertically must widen horizontally");
    assert.ok(Math.abs(squashed.sx * squashed.sx * squashed.sy - 1) < 0.001);

    const stretched = volumeSquash(1.12);
    assert.ok(stretched.sx < 1, "stretching vertically must narrow horizontally");
    assert.ok(Math.abs(stretched.sx * stretched.sx * stretched.sy - 1) < 0.001);
  });

  it("clamps extreme scale factors safely", () => {
    const low = volumeSquash(0.1);
    const high = volumeSquash(5.0);
    assert.equal(low.sy, 0.65);
    assert.equal(high.sy, 1.35);
  });
});
