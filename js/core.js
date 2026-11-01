(function (root) {
  function randomInt(n) {
    // 나머지 연산 편향을 피하려고 범위를 넘는 값은 버리고 다시 뽑는다
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % n;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseNames(text) {
    const labels = text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Map();
    const duplicates = [];
    const result = labels.map((name) => {
      const n = (seen.get(name) || 0) + 1;
      seen.set(name, n);
      if (n === 2) duplicates.push(name);
      return n === 1 ? name : `${name}(${n})`;
    });
    return { labels: result, duplicates };
  }

  function rangeLabels(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return [];
    const out = [];
    for (let i = start; i <= end; i++) out.push(String(i));
    return out;
  }

  function buildSlots(prizes) {
    const slots = prizes.filter((p) => p.left > 0).map((p) => ({ type: "prize", prizeId: p.id }));
    slots.push({ type: "lose" });
    return shuffle(slots);
  }

  function createState(labels, prizeInputs, options) {
    const opts = Object.assign({ order: "input", loseRule: "consume" }, options);
    const participants = labels.map((label, i) => ({ id: i + 1, label, status: "waiting" }));
    const prizes = prizeInputs.map((p, i) => ({
      id: i + 1,
      name: p.name,
      total: p.count,
      left: p.count,
    }));
    const ids = participants.map((p) => p.id);
    const state = {
      phase: "drawing",
      options: opts,
      participants,
      queue: opts.order === "random" ? shuffle(ids) : ids,
      prizes,
      slots: buildSlots(prizes),
      history: [],
      undo: null,
    };
    return finishIfNeeded(state);
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function snapshot(state) {
    const s = clone(state);
    s.undo = null;
    return s;
  }

  function finishIfNeeded(state) {
    const prizesLeft = state.prizes.some((p) => p.left > 0);
    if (!prizesLeft || state.queue.length === 0) state.phase = "done";
    return state;
  }

  function currentParticipant(state) {
    return state.participants.find((p) => p.id === state.queue[0]);
  }

  function decideSlot(state) {
    return randomInt(state.slots.length);
  }

  function pushHistory(state, participantId, result, at) {
    state.history.push({ seq: state.history.length + 1, participantId, result, at });
  }

  function applySpin(state, slotIndex, at = Date.now()) {
    if (state.phase !== "drawing") throw new Error("추첨 중이 아닙니다");
    const slot = state.slots[slotIndex];
    if (!slot) throw new Error("없는 칸입니다");
    const next = clone(state);
    next.undo = snapshot(state);

    const id = next.queue.shift();
    const who = next.participants.find((p) => p.id === id);

    if (slot.type === "lose") {
      pushHistory(next, id, "lose", at);
      if (next.options.loseRule === "requeue") {
        next.queue.push(id);
      } else {
        who.status = "lost";
      }
      return finishIfNeeded(next);
    }

    if (who.status === "won") throw new Error("이미 당첨된 사람입니다");
    const prize = next.prizes.find((p) => p.id === slot.prizeId);
    prize.left -= 1;
    who.status = "won";
    pushHistory(next, id, prize.id, at);
    next.slots = buildSlots(next.prizes);
    return finishIfNeeded(next);
  }

  function applySkip(state, at = Date.now()) {
    if (state.phase !== "drawing") throw new Error("추첨 중이 아닙니다");
    const next = clone(state);
    next.undo = snapshot(state);
    const id = next.queue.shift();
    next.participants.find((p) => p.id === id).status = "absent";
    pushHistory(next, id, "absent", at);
    return finishIfNeeded(next);
  }

  function applyUndo(state) {
    if (!state.undo) return state;
    return clone(state.undo);
  }

  function remainingPrizes(state) {
    return state.prizes.filter((p) => p.left > 0);
  }

  const api = {
    randomInt, shuffle, parseNames, rangeLabels, buildSlots, createState,
    currentParticipant, decideSlot, applySpin, applySkip, applyUndo, remainingPrizes,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Core = api;
})(typeof window !== "undefined" ? window : globalThis);
