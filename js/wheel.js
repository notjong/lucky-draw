(function (root) {
  const TAU = Math.PI * 2;
  const NUMBER_ONLY_OVER = 20;
  const MAX_LABEL = 12;
  // 채도와 명도를 맞추고 색상만 달리한 팔레트. 흰 글자 대비 4.5 이상
  const HUES = [14, 38, 88, 150, 178, 205, 340, 62];

  function ellipsis(text, max = MAX_LABEL) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function slotColor(index, slot) {
    if (slot.type === "lose") return { fill: "#bdbab2", text: "#1d1d1b" };
    return { fill: `hsl(${HUES[index % HUES.length]} 52% 33%)`, text: "#ffffff" };
  }

  function create(canvas) {
    const ctx = canvas.getContext("2d");
    let model = { slots: [], prizes: [] };
    let rotation = 0;
    let highlight = -1;
    let fade = 1;
    let size = 0;
    let rafId = 0;

    function resize() {
      const box = canvas.parentElement.getBoundingClientRect();
      const side = Math.max(240, Math.floor(Math.min(box.width, box.height || box.width)));
      const dpr = window.devicePixelRatio || 1;
      size = side;
      canvas.style.width = side + "px";
      canvas.style.height = side + "px";
      canvas.width = Math.round(side * dpr);
      canvas.height = Math.round(side * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function slotText(slot, index) {
      if (slot.type === "lose") return "꽝";
      const prize = model.prizes.find((p) => p.id === slot.prizeId);
      if (model.slots.length > NUMBER_ONLY_OVER) return String(index + 1);
      return `${ellipsis(prize.name)} ×${prize.left}`;
    }

    function draw() {
      if (!size) return;
      const n = model.slots.length;
      const c = size / 2;
      const r = c - 6;
      ctx.clearRect(0, 0, size, size);
      if (!n) return;
      const arc = TAU / n;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(c, c);
      ctx.rotate(rotation - Math.PI / 2);

      model.slots.forEach((slot, i) => {
        const col = slotColor(i, slot);
        const dim = highlight >= 0 && highlight !== i;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, i * arc, (i + 1) * arc);
        ctx.closePath();
        ctx.fillStyle = col.fill;
        ctx.fill();
        if (dim) {
          ctx.fillStyle = "rgba(244,239,230,0.55)";
          ctx.fill();
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#f4efe6";
        ctx.stroke();

        ctx.save();
        const center = i * arc + arc / 2;
        ctx.rotate(center);
        // 화면 왼쪽 절반은 글자가 뒤집혀 보이므로 180도 돌려 읽히게 한다
        const flip = Math.cos(rotation - Math.PI / 2 + center) < 0;
        if (flip) ctx.rotate(Math.PI);
        ctx.fillStyle = col.text;
        ctx.textAlign = flip ? "left" : "right";
        ctx.textBaseline = "middle";
        const fontPx = Math.max(11, Math.min(r * 0.085, (r * arc) * 0.5));
        ctx.font = `600 ${fontPx}px "Pretendard","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
        ctx.fillText(slotText(slot, i), flip ? -(r - 14) : r - 14, 0, r * 0.7);
        ctx.restore();
      });

      if (highlight >= 0) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, highlight * arc, (highlight + 1) * arc);
        ctx.closePath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#1d1d1b";
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.07, 0, TAU);
      ctx.fillStyle = "#1d1d1b";
      ctx.fill();
      ctx.restore();
    }

    function setModel(slots, prizes) {
      model = { slots, prizes };
      highlight = -1;
      draw();
    }

    // 0.5초 안팎으로 새 배치가 나타나게 한다
    function transitionTo(slots, prizes, ms = 500) {
      model = { slots, prizes };
      highlight = -1;
      const start = performance.now();
      cancelAnimationFrame(rafId);
      function frame(now) {
        const t = Math.min(1, (now - start) / ms);
        fade = t;
        rotation += (1 - t) * 0.02;
        draw();
        if (t < 1) rafId = requestAnimationFrame(frame);
      }
      rafId = requestAnimationFrame(frame);
    }

    // 포인터는 위쪽 고정. 해당 칸 중앙 근처에서 멈추도록 목표 각도를 계산한다
    function spinTo(slotIndex, { duration, turns, onTick }) {
      return new Promise((resolve) => {
        cancelAnimationFrame(rafId);
        fade = 1;
        highlight = -1;
        const n = model.slots.length;
        const arc = TAU / n;
        const jitter = (Core.randomInt(61) - 30) / 100;
        const targetMod = (((-(slotIndex + 0.5 + jitter) * arc) % TAU) + TAU) % TAU;
        const startRot = ((rotation % TAU) + TAU) % TAU;
        let delta = targetMod - startRot;
        if (delta < 0) delta += TAU;
        const total = delta + turns * TAU;
        const from = startRot;
        const t0 = performance.now();
        let lastSlot = -1;
        function frame(now) {
          const t = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          rotation = from + total * eased;
          const under = Math.floor((((-rotation / arc) % n) + n) % n);
          if (under !== lastSlot) {
            lastSlot = under;
            if (onTick) onTick();
          }
          draw();
          if (t < 1) rafId = requestAnimationFrame(frame);
          else {
            rotation = rotation % TAU;
            highlight = slotIndex;
            draw();
            resolve();
          }
        }
        rafId = requestAnimationFrame(frame);
      });
    }

    function clearHighlight() {
      highlight = -1;
      draw();
    }

    window.addEventListener("resize", resize);
    return { resize, setModel, transitionTo, spinTo, clearHighlight };
  }

  root.Wheel = { create, ellipsis, NUMBER_ONLY_OVER };
})(window);
