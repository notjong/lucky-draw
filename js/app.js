(function () {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const app = {
    state: null,
    setup: { labels: [], prizes: [{ name: "", count: 1 }] },
    spinning: false,
    pendingResult: null,
  };

  const screens = ["resume", "setup", "draw", "result"];
  function show(name) {
    screens.forEach((s) => ($("screen-" + s).hidden = s !== name));
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "onclick" || k === "oninput") node[k] = v;
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.append(c));
    return node;
  }

  function setMsg(id, text, warn) {
    const node = $(id);
    node.textContent = text;
    node.classList.toggle("warn", !!warn);
  }

  const sound = (() => {
    let ctx = null;
    const toggle = $("sound-toggle");
    function beep(freq, ms, vol) {
      if (!toggle.checked) return;
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
    }
    return {
      tick: () => beep(900, 25, 0.04),
      win: () => {
        beep(660, 140, 0.08);
        setTimeout(() => beep(880, 220, 0.08), 150);
      },
      lose: () => beep(220, 300, 0.08),
    };
  })();

  function persist() {
    if (!Store.save(app.state)) $("storage-notice").hidden = false;
  }

  // ---------- 준비 화면 ----------

  function uniqueLabels(parsed) {
    const taken = new Set(app.setup.labels);
    const out = [];
    parsed.forEach((label) => {
      let candidate = label;
      let n = 2;
      while (taken.has(candidate)) candidate = `${label}(${n++})`;
      taken.add(candidate);
      out.push(candidate);
    });
    return out;
  }

  function renderParticipants() {
    const list = $("participant-list");
    list.replaceChildren(
      ...app.setup.labels.map((label, i) =>
        el("li", {}, label, el("button", {
          "aria-label": `${label} 삭제`,
          onclick: () => {
            app.setup.labels.splice(i, 1);
            renderParticipants();
          },
        }, "×"))
      )
    );
    $("participant-count").textContent = app.setup.labels.length;
    updatePrizeWarning();
  }

  function addLabels(raw, duplicates) {
    const added = uniqueLabels(raw);
    app.setup.labels.push(...added);
    renderParticipants();
    if (duplicates && duplicates.length) {
      setMsg("participant-msg", `같은 이름이 있어 번호를 붙였습니다: ${duplicates.join(", ")}`, true);
    } else {
      setMsg("participant-msg", `${added.length}명 등록했습니다.`);
    }
  }

  function prizeTotal() {
    return app.setup.prizes.reduce((sum, p) => sum + (Number.isInteger(p.count) && p.count > 0 ? p.count : 0), 0);
  }

  function updatePrizeWarning() {
    const total = prizeTotal();
    const people = app.setup.labels.length;
    if (people > 0 && total > people) {
      setMsg("prize-msg", `경품 ${total}개가 참가자 ${people}명보다 많습니다.`, true);
    } else {
      setMsg("prize-msg", "");
    }
  }

  function renderPrizes() {
    const wrap = $("prize-rows");
    const rows = app.setup.prizes;
    wrap.replaceChildren(
      ...rows.map((p, i) => {
        const name = el("input", { type: "text", "aria-label": "경품 이름", placeholder: "경품 이름", value: p.name });
        name.oninput = () => {
          p.name = name.value;
        };
        const count = el("input", { type: "number", "aria-label": "수량", min: 1, value: p.count });
        count.oninput = () => {
          p.count = Number(count.value);
          updatePrizeWarning();
        };
        const move = (to) => () => {
          const [item] = rows.splice(i, 1);
          rows.splice(to, 0, item);
          renderPrizes();
        };
        const up = el("button", { "aria-label": "위로" }, "↑");
        const down = el("button", { "aria-label": "아래로" }, "↓");
        up.onclick = move(i - 1);
        down.onclick = move(i + 1);
        up.disabled = i === 0;
        down.disabled = i === rows.length - 1;
        const del = el("button", { "aria-label": "삭제" }, "×");
        del.onclick = () => {
          rows.splice(i, 1);
          if (!rows.length) rows.push({ name: "", count: 1 });
          renderPrizes();
        };
        return el("div", { class: "prize-row" }, name, count, up, down, del);
      })
    );
    updatePrizeWarning();
  }

  function selectTab(which) {
    const names = which === "names";
    $("tab-names").setAttribute("aria-selected", names);
    $("tab-range").setAttribute("aria-selected", !names);
    $("pane-names").hidden = !names;
    $("pane-range").hidden = names;
  }

  function startDraw() {
    const prizes = app.setup.prizes.map((p) => ({ name: p.name.trim(), count: p.count }));
    if (!app.setup.labels.length) return setMsg("start-msg", "참가자를 먼저 등록해 주세요.", true);
    if (prizes.some((p) => !p.name)) return setMsg("start-msg", "이름이 비어 있는 경품이 있습니다.", true);
    if (prizes.some((p) => !Number.isInteger(p.count) || p.count < 1)) {
      return setMsg("start-msg", "수량은 1 이상의 정수로 넣어 주세요.", true);
    }
    setMsg("start-msg", "");
    const options = {
      order: document.querySelector('input[name="order"]:checked').value,
      loseRule: document.querySelector('input[name="loseRule"]:checked').value,
    };
    app.state = Core.createState(app.setup.labels, prizes, options);
    persist();
    enterCurrent();
  }

  // ---------- 추첨 화면 ----------

  const wheel = Wheel.create($("wheel"));

  function prizeLabel(prizeId) {
    return app.state.prizes.find((p) => p.id === prizeId).name;
  }

  function renderSide() {
    const s = app.state;
    const cur = s.phase === "drawing" ? Core.currentParticipant(s) : null;
    $("current-name").textContent = cur ? cur.label : "-";
    $("left-participants").textContent = s.queue.length;
    $("prize-left").replaceChildren(
      ...Core.remainingPrizes(s).map((p) =>
        el("li", {}, el("span", {}, Wheel.ellipsis(p.name, 20)), el("span", { class: "num" }, `×${p.left}`))
      )
    );
    const many = s.slots.length > Wheel.NUMBER_ONLY_OVER;
    $("legend-box").hidden = !many;
    if (many) {
      $("legend").replaceChildren(
        ...s.slots.map((slot, i) => {
          const name = slot.type === "lose" ? "꽝" : prizeLabel(slot.prizeId);
          const left = slot.type === "lose" ? "" : `×${s.prizes.find((p) => p.id === slot.prizeId).left}`;
          return el("li", {}, el("span", {}, `${i + 1}. ${name}`), el("span", { class: "num" }, left));
        })
      );
    }
    syncButtons();
  }

  function syncButtons() {
    const drawing = app.state && app.state.phase === "drawing";
    $("btn-spin").disabled = app.spinning || !drawing;
    $("btn-skip").disabled = app.spinning || !drawing;
    $("btn-undo").disabled = app.spinning || !app.state || !app.state.undo;
    $("btn-back-setup").disabled = app.spinning;
  }

  function enterCurrent() {
    if (app.state.phase === "done") return enterResult();
    show("draw");
    wheel.resize();
    wheel.setModel(app.state.slots, app.state.prizes);
    renderSide();
  }

  async function spin() {
    if (app.spinning || !app.state || app.state.phase !== "drawing") return;
    app.spinning = true;
    syncButtons();

    const before = app.state;
    const who = Core.currentParticipant(before);
    const slotIndex = Core.decideSlot(before);
    const slot = before.slots[slotIndex];
    const duration = reducedMotion.matches ? 800 : 4000 + Core.randomInt(2001);
    const turns = reducedMotion.matches ? 1 : 4 + Core.randomInt(3);

    await wheel.spinTo(slotIndex, { duration, turns, onTick: sound.tick });

    app.state = Core.applySpin(before, slotIndex);
    persist();
    app.spinning = false;

    const won = slot.type === "prize";
    const what = won ? prizeLabel(slot.prizeId) : "꽝";
    app.pendingResult = { won };
    $("result-who").textContent = who.label;
    $("result-what").textContent = what;
    $("live").textContent = won ? `${who.label}님, ${what} 당첨입니다.` : `${who.label}님, 꽝입니다.`;
    (won ? sound.win : sound.lose)();
    $("result-dialog").showModal();
  }

  function afterResult() {
    const pending = app.pendingResult;
    if (!pending) return;
    app.pendingResult = null;
    if (app.state.phase === "done") return enterResult();
    if (pending.won) wheel.transitionTo(app.state.slots, app.state.prizes);
    else wheel.clearHighlight();
    renderSide();
  }

  function skip() {
    if (app.spinning || app.state.phase !== "drawing") return;
    const cur = Core.currentParticipant(app.state);
    if (!confirm(`${cur.label}님을 불참 처리할까요?`)) return;
    app.state = Core.applySkip(app.state);
    persist();
    enterCurrent();
  }

  function undo() {
    if (app.spinning || !app.state || !app.state.undo) return;
    app.state = Core.applyUndo(app.state);
    persist();
    enterCurrent();
  }

  function backToSetup() {
    if (app.spinning) return;
    if (!confirm("준비 화면으로 돌아가면 지금까지의 추첨 기록이 사라집니다. 돌아갈까요?")) return;
    const s = app.state;
    app.setup = {
      labels: s.participants.map((p) => p.label),
      prizes: s.prizes.map((p) => ({ name: p.name, count: p.total })),
    };
    app.state = null;
    Store.clear();
    enterSetup();
  }

  // ---------- 결과 화면 ----------

  function enterResult() {
    show("result");
    const s = app.state;
    const { winners, others } = Export.rows(s);
    const fill = (id, rows) => {
      $(id).querySelector("tbody").replaceChildren(
        ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", {}, String(c)))))
      );
    };
    fill("table-winners", winners);
    fill("table-others", others);
    const left = Core.remainingPrizes(s);
    const leftCount = left.reduce((sum, p) => sum + p.left, 0);
    $("end-note").textContent = leftCount
      ? `참가자가 모두 돌렸습니다. 남은 경품은 ${leftCount}개입니다.`
      : "경품이 다 나갔습니다.";
    $("unclaimed").hidden = !leftCount;
    $("unclaimed-list").replaceChildren(
      ...left.map((p) => el("li", {}, `${p.name} ×${p.left}`))
    );
    $("btn-undo-result").disabled = !s.undo;
    setMsg("result-msg", "");
  }

  function selectResultTab(winners) {
    $("tab-winners").setAttribute("aria-selected", winners);
    $("tab-others").setAttribute("aria-selected", !winners);
    $("table-winners").hidden = !winners;
    $("table-others").hidden = winners;
  }

  async function copyAll() {
    const text = Export.toTsv(app.state);
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const t = el("textarea", {});
      t.value = text;
      document.body.append(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setMsg("result-msg", "당첨자 명단을 복사했습니다.");
  }

  function resetAll() {
    if (!confirm("모든 입력과 추첨 기록을 지웁니다. 계속할까요?")) return;
    Store.clear();
    app.state = null;
    app.setup = { labels: [], prizes: [{ name: "", count: 1 }] };
    enterSetup();
  }

  function enterSetup() {
    show("setup");
    renderParticipants();
    renderPrizes();
    setMsg("participant-msg", "");
    setMsg("start-msg", "");
  }

  // ---------- 이벤트 연결 ----------

  $("tab-names").onclick = () => selectTab("names");
  $("tab-range").onclick = () => selectTab("range");
  $("btn-add-names").onclick = () => {
    const { labels, duplicates } = Core.parseNames($("names-input").value);
    if (!labels.length) return setMsg("participant-msg", "등록할 이름이 없습니다.", true);
    addLabels(labels, duplicates);
    $("names-input").value = "";
  };
  $("btn-add-range").onclick = () => {
    const labels = Core.rangeLabels(Number($("range-start").value), Number($("range-end").value));
    if (!labels.length) return setMsg("participant-msg", "시작 번호가 끝 번호보다 클 수 없습니다.", true);
    addLabels(labels);
  };
  $("btn-clear-participants").onclick = () => {
    app.setup.labels = [];
    renderParticipants();
    setMsg("participant-msg", "");
  };
  $("btn-add-prize").onclick = () => {
    app.setup.prizes.push({ name: "", count: 1 });
    renderPrizes();
  };
  $("btn-start").onclick = startDraw;

  $("btn-spin").onclick = spin;
  $("btn-skip").onclick = skip;
  $("btn-undo").onclick = undo;
  $("btn-undo-result").onclick = undo;
  $("btn-back-setup").onclick = backToSetup;
  $("btn-next").onclick = () => $("result-dialog").close();
  $("result-dialog").addEventListener("close", afterResult);

  $("tab-winners").onclick = () => selectResultTab(true);
  $("tab-others").onclick = () => selectResultTab(false);
  $("btn-csv").onclick = () => Export.downloadCsv(app.state);
  $("btn-copy").onclick = copyAll;
  $("btn-reset").onclick = resetAll;

  $("btn-resume").onclick = () => enterCurrent();
  $("btn-fresh").onclick = () => {
    Store.clear();
    app.state = null;
    enterSetup();
  };

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    if ($("screen-draw").hidden || $("result-dialog").open) return;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    spin();
  });

  // ---------- 시작 ----------

  if (!Store.available()) $("storage-notice").hidden = false;
  const saved = Store.available() ? Store.load() : null;
  if (saved && saved.participants && (saved.phase === "drawing" || saved.phase === "done")) {
    app.state = saved;
    const won = saved.history.filter((h) => h.result !== "lose" && h.result !== "absent").length;
    const leftCount = Core.remainingPrizes(saved).reduce((sum, p) => sum + p.left, 0);
    $("resume-summary").textContent =
      `당첨 ${won}명, 남은 참가자 ${saved.queue.length}명, 남은 경품 ${leftCount}개.`;
    show("resume");
  } else {
    enterSetup();
  }
})();
