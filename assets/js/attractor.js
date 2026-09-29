// Background decoration: a strange attractor, integrated with RK4 and drawn
// as a faint rotating trace, with a live "current state" moving along it.
(function () {
  "use strict";

  const SYSTEMS = {
    lorenz: {
      params: { rho: [14, 40, 28], sigma: [6, 16, 10] },
      f: ([x, y, z], k) => [k.sigma * (y - x), x * (k.rho - z) - y, x * y - (8 / 3) * z],
      starts: [[1, 1, 1]],
      dt: 0.005,
      transient: 1000,
      steps: 9000,
      speed: 3,
      sway: true,
    },
    rossler: {
      params: { c: [2.5, 8, 5.7], a: [0.1, 0.3, 0.2] },
      f: ([x, y, z], k) => [-y - z, x + k.a * y, 0.2 + z * (x - k.c)],
      starts: [[1, 1, 0]],
      dt: 0.02,
      transient: 500,
      steps: 9000,
      speed: 2,
    },
    aizawa: {
      params: { a: [0.6, 1.05, 0.95], d: [2, 5, 3.5] },
      f: ([x, y, z], k) => [
        (z - 0.7) * x - k.d * y,
        k.d * x + (z - 0.7) * y,
        0.6 + k.a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x,
      ],
      starts: [[0.1, 0, 0]],
      dt: 0.01,
      transient: 1000,
      steps: 7000,
      speed: 2,
    },
    vanderpol: {
      params: { mu: [0.2, 4, 1.2] },
      f: ([x, y], k) => [y, k.mu * (1 - x * x) * y - x, 0],
      starts: [
        [0.05, 0, 0],
        [-3.2, 0, 0],
        [3.2, 0, 0],
      ],
      dt: 0.01,
      transient: 0,
      steps: 2600,
      speed: 2,
      planar: true,
    },
  };

  function rk4(f, p, h, k) {
    const k1 = f(p, k);
    const k2 = f(p.map((v, i) => v + (h / 2) * k1[i]), k);
    const k3 = f(p.map((v, i) => v + (h / 2) * k2[i]), k);
    const k4 = f(p.map((v, i) => v + h * k3[i]), k);
    return p.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }

  function trajectory(sys, start) {
    let p = start.slice();
    for (let i = 0; i < sys.transient; i++) p = rk4(sys.f, p, sys.dt, sys.k);
    const pts = [p];
    for (let i = 0; i < sys.steps; i++) pts.push((p = rk4(sys.f, p, sys.dt, sys.k)));
    return pts;
  }

  function init(root) {
    const sys = SYSTEMS[root.dataset.system];
    if (!sys) return;
    sys.k = {};
    Object.entries(sys.params).forEach(([name, [, , v]]) => (sys.k[name] = v));

    const [back, front] = root.querySelectorAll("canvas");

    let paths = sys.starts.map((s) => trajectory(sys, s));
    const all = paths.flat();

    // Bounds used to fit the figure: rotation happens around the vertical axis
    let cx = 0, cy = 0, zmin = Infinity, zmax = -Infinity;
    all.forEach(([x, y, z]) => {
      cx += x;
      cy += y;
      zmin = Math.min(zmin, z);
      zmax = Math.max(zmax, z);
    });
    cx /= all.length;
    cy /= all.length;
    const cz = (zmin + zmax) / 2;
    let rx = 0, ry = 0;
    all.forEach(([x, y]) => {
      if (sys.planar) {
        rx = Math.max(rx, Math.abs(x - cx));
        ry = Math.max(ry, Math.abs(y - cy));
      } else {
        rx = Math.max(rx, Math.hypot(x - cx, y - cy));
      }
    });
    if (!sys.planar) ry = (zmax - zmin) / 2;

    const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tilt = 0.28;
    let W = 0, H = 0, scale = 1, ox = 0, oy = 0, theta = sys.sway ? 0 : 0.6, clock = 0;
    let colors = {};

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      colors = { ink: cs.getPropertyValue("--ink").trim(), warm: cs.getPropertyValue("--warm").trim() };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = root.clientWidth;
      H = root.clientHeight;
      [back, front].forEach((c) => {
        c.width = W * dpr;
        c.height = H * dpr;
        c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      });
      const fx = parseFloat(root.dataset.x || "0.5");
      const size = parseFloat(root.dataset.size || "0.3");
      scale = Math.min((W * 0.4) / rx, (H * size) / ry);
      ox = W * fx;
      oy = H * parseFloat(root.dataset.y || "0.5");
    }

    function project([x, y, z]) {
      if (sys.planar) return [ox + (x - cx) * scale, oy - (y - cy) * scale];
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const c = Math.cos(theta), s = Math.sin(theta);
      const u = dx * c - dy * s;
      const depth = dx * s + dy * c;
      return [ox + u * scale, oy - (dz * Math.cos(tilt) - depth * Math.sin(tilt)) * scale];
    }

    function drawBack() {
      const ctx = back.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 0.8;
      ctx.lineJoin = "round";
      paths.forEach((pts) => {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const [X, Y] = project(p);
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        });
        ctx.stroke();
      });
    }

    // The live state keeps being integrated, so the comet never jumps
    let state = paths[0][paths[0].length - 1];
    const trail = paths[0].slice(-260);

    function drawFront() {
      const ctx = front.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      const proj = trail.map(project);
      ctx.strokeStyle = colors.warm;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      const chunks = 26, n = proj.length, step = Math.ceil(n / chunks);
      for (let k = 0; k < n - 1; k += step) {
        ctx.globalAlpha = Math.pow((k + step) / n, 2) * 0.9;
        ctx.beginPath();
        ctx.moveTo(...proj[k]);
        for (let i = k + 1; i <= Math.min(k + step, n - 1); i++) ctx.lineTo(...proj[i]);
        ctx.stroke();
      }
      const [hx, hy] = proj[n - 1];
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.warm;
      ctx.shadowColor = colors.warm;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    let running = false, last = 0;
    function frame(t) {
      if (!running) return;
      const elapsed = last ? Math.min(t - last, 50) : 16;
      last = t;
      clock += elapsed;
      // Lorenz is shown swaying around its butterfly view, others turn fully
      if (sys.sway) theta = 0.55 * Math.sin(clock * 0.00012);
      else if (!sys.planar) theta += elapsed * 0.00005;
      for (let i = 0; i < sys.speed; i++) {
        state = rk4(sys.f, state, sys.dt, sys.k);
        trail.push(state);
      }
      trail.splice(0, trail.length - 260);
      if (!sys.planar) drawBack();
      drawFront();
      requestAnimationFrame(frame);
    }

    function start() {
      if (running || !motion) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }

    function redraw() {
      readColors();
      resize();
      drawBack();
      drawFront();
    }

    // Unlabelled sliders on the hidden parameters; the fit stays the one of
    // the default values, so the figure visibly grows, shrinks or collapses.
    const knobs = document.querySelector(".knobs");
    if (knobs) {
      let pending = false;
      const rebuild = () => {
        pending = false;
        paths = sys.starts.map((s) => trajectory(sys, s));
        drawBack();
        if (!running) drawFront();
      };
      Object.entries(sys.params).forEach(([name, [min, max, value]]) => {
        const input = document.createElement("input");
        Object.assign(input, { type: "range", min, max, value, step: (max - min) / 200 });
        input.setAttribute("aria-label", "Parameter " + name);
        input.addEventListener("input", () => {
          sys.k[name] = parseFloat(input.value);
          if (!pending) {
            pending = true;
            requestAnimationFrame(rebuild);
          }
        });
        input.addEventListener("dblclick", () => {
          input.value = value;
          input.dispatchEvent(new Event("input"));
        });
        knobs.appendChild(input);
      });
    }

    redraw();
    root.classList.add("is-ready");
    new ResizeObserver(() => {
      resize();
      drawBack();
      drawFront();
    }).observe(root);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);

    if (motion) {
      let visible = true;
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        visible && !document.hidden ? start() : (running = false);
      }).observe(root);
      document.addEventListener("visibilitychange", () => {
        visible && !document.hidden ? start() : (running = false);
      });
      start();
    }
  }

  document.querySelectorAll(".flow[data-system]").forEach(init);
})();
