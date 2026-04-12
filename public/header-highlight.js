registerPaint(
  "header-highlight",
  class {
    static get contextOptions() {
      return { alpha: true };
    }

    static get inputProperties() {
      return ["--highlight-color", "--highlight-opacity", "--highlight-height", "--highlight-offset"];
    }

    seed(s) {
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }

    paint(ctx, size, properties) {
      const color =
        properties.get("--highlight-color").toString().trim() ||
        "#575bc7";
      const opacity =
        parseFloat(properties.get("--highlight-opacity").toString()) || 0.2;
      const heightRatio =
        parseFloat(properties.get("--highlight-height").toString()) || 0.45;

      const w = size.width;
      const h = size.height;
      const rand = this.seed(Math.round(w * 7 + h * 13));

      const offset =
        parseFloat(properties.get("--highlight-offset").toString()) || 0;
      const baseY = h * (1 - heightRatio) + h * offset;
      const strokeH = h * heightRatio;
      const bottomY = baseY + strokeH;
      const wobble = h * 0.06;

      const radius = Math.min(strokeH * 0.45, w * 0.03);

      // Denser steps for more granular, textured edges
      const steps = Math.max(10, Math.round(w / 16));
      const stepW = w / steps;

      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.beginPath();

      // Start at top-left after the rounded corner
      ctx.moveTo(radius, baseY + wobble * (rand() - 0.5));

      // Top edge - quadratic curves left to right
      for (let i = 1; i <= steps; i++) {
        const x = Math.min(i * stepW, w - radius);
        const cpX = (i - 0.5) * stepW;
        const cpY = baseY + wobble * (rand() - 0.5);
        const y = baseY + wobble * (rand() - 0.5);
        ctx.quadraticCurveTo(cpX, cpY, x, y);
      }

      // Top-right rounded corner
      ctx.quadraticCurveTo(
        w + radius * 0.2,
        baseY + wobble * (rand() - 0.5),
        w + radius * 0.1,
        baseY + radius + wobble * (rand() - 0.5),
      );

      // Right edge down
      ctx.lineTo(
        w + radius * 0.05,
        bottomY - radius + wobble * (rand() - 0.5),
      );

      // Bottom-right rounded corner
      ctx.quadraticCurveTo(
        w + radius * 0.15,
        bottomY + wobble * (rand() - 0.5),
        w - radius,
        bottomY + wobble * (rand() - 0.5),
      );

      // Bottom edge - quadratic curves right to left
      for (let i = steps - 1; i >= 0; i--) {
        const x = Math.max(i * stepW, radius);
        const cpX = (i + 0.5) * stepW;
        const cpY = bottomY + wobble * (rand() - 0.5);
        const y = bottomY + wobble * (rand() - 0.5);
        ctx.quadraticCurveTo(cpX, cpY, x, y);
      }

      // Bottom-left rounded corner
      ctx.quadraticCurveTo(
        -radius * 0.2,
        bottomY + wobble * (rand() - 0.5),
        -radius * 0.1,
        bottomY - radius + wobble * (rand() - 0.5),
      );

      // Left edge up
      ctx.lineTo(-radius * 0.05, baseY + radius + wobble * (rand() - 0.5));

      // Top-left rounded corner
      ctx.quadraticCurveTo(
        -radius * 0.15,
        baseY + wobble * (rand() - 0.5),
        radius,
        baseY + wobble * (rand() - 0.5),
      );

      ctx.closePath();
      ctx.fill();
    }
  },
);
