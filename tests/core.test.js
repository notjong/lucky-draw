const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

const names = (n) => Array.from({ length: n }, (_, i) => `참가자${i + 1}`);
const prizeOf = (state, name) => state.prizes.find((p) => p.name === name);
const slotIndexOf = (state, pred) => state.slots.findIndex(pred);

test("F-01/F-03/F-04 이름 파싱과 중복 표시", () => {
  const r = C.parseNames(" 김민수 ,이영희\n\n김민수\n  박철수  ");
  assert.deepEqual(r.labels, ["김민수", "이영희", "김민수(2)", "박철수"]);
  assert.deepEqual(r.duplicates, ["김민수"]);
});

test("F-02 번호 범위", () => {
  assert.equal(C.rangeLabels(1, 120).length, 120);
  assert.deepEqual(C.rangeLabels(5, 3), []);
});

test("T-01 경품 3종 참가자 10명이면 4칸", () => {
  const s = C.createState(names(10), [
    { name: "A", count: 1 }, { name: "B", count: 2 }, { name: "C", count: 3 },
  ]);
  assert.equal(s.slots.length, 4);
  assert.equal(s.slots.filter((x) => x.type === "lose").length, 1);
});

test("T-02 수량 1 경품 당첨 시 칸 제거", () => {
  const s = C.createState(names(10), [
    { name: "A", count: 1 }, { name: "B", count: 2 }, { name: "C", count: 3 },
  ]);
  const a = prizeOf(s, "A");
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.prizeId === a.id));
  assert.equal(next.slots.length, 3);
  assert.equal(prizeOf(next, "A").left, 0);
  assert.equal(next.participants[0].status, "won");
});

test("T-03 수량 3 경품 당첨 시 칸 유지, 수량 2", () => {
  const s = C.createState(names(10), [{ name: "A", count: 1 }, { name: "C", count: 3 }]);
  const c = prizeOf(s, "C");
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.prizeId === c.id));
  assert.equal(next.slots.length, 3);
  assert.equal(prizeOf(next, "C").left, 2);
});

test("T-04 꽝이면 칸, 순서, 수량 변화 없음", () => {
  const s = C.createState(names(5), [{ name: "A", count: 2 }, { name: "B", count: 1 }]);
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.type === "lose"));
  assert.deepEqual(next.slots, s.slots);
  assert.deepEqual(next.prizes, s.prizes);
  assert.equal(next.participants[0].status, "lost");
});

test("T-05 당첨자는 대기열에서 빠진다", () => {
  const s = C.createState(names(3), [{ name: "A", count: 2 }]);
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.type === "prize"));
  assert.ok(!next.queue.includes(1));
});

test("T-06 마지막 경품이 나가면 종료", () => {
  const s = C.createState(names(3), [{ name: "A", count: 1 }]);
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.type === "prize"));
  assert.equal(next.phase, "done");
});

test("T-07 마지막 참가자가 꽝이면 종료, 남은 경품 있음", () => {
  let s = C.createState(names(1), [{ name: "A", count: 2 }]);
  s = C.applySpin(s, slotIndexOf(s, (x) => x.type === "lose"));
  assert.equal(s.phase, "done");
  assert.equal(C.remainingPrizes(s).length, 1);
});

test("F-32 B: 꽝이면 대기열 맨 뒤로", () => {
  const s = C.createState(names(3), [{ name: "A", count: 1 }], { loseRule: "requeue" });
  const next = C.applySpin(s, slotIndexOf(s, (x) => x.type === "lose"));
  assert.deepEqual(next.queue, [2, 3, 1]);
  assert.equal(next.participants[0].status, "waiting");
});

test("F-36 불참 처리", () => {
  const s = C.createState(names(3), [{ name: "A", count: 1 }]);
  const next = C.applySkip(s);
  assert.equal(next.participants[0].status, "absent");
  assert.equal(next.history[0].result, "absent");
  assert.deepEqual(next.queue, [2, 3]);
});

test("T-10 되돌리기는 모든 상태를 복원", () => {
  const s = C.createState(names(5), [{ name: "A", count: 1 }, { name: "B", count: 2 }]);
  const after = C.applySpin(s, slotIndexOf(s, (x) => x.type === "prize"));
  const back = C.applyUndo(after);
  assert.deepEqual(back, s);
  assert.equal(C.applyUndo(back), back);
});

test("F-17 무작위 순서도 모든 참가자를 포함", () => {
  const s = C.createState(names(20), [{ name: "A", count: 1 }], { order: "random" });
  assert.deepEqual([...s.queue].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

test("F-29 이미 당첨된 사람은 다시 당첨되지 않는다", () => {
  const s = C.createState(names(2), [{ name: "A", count: 2 }]);
  s.participants[0].status = "won";
  assert.throws(() => C.applySpin(s, slotIndexOf(s, (x) => x.type === "prize")));
});

test("T-12 칸 4개 10,000회 비율 25% ± 1.5%p", () => {
  const s = C.createState(names(5), [
    { name: "A", count: 1 }, { name: "B", count: 1 }, { name: "C", count: 1 },
  ]);
  const hits = [0, 0, 0, 0];
  for (let i = 0; i < 10000; i++) hits[C.decideSlot(s)]++;
  for (const h of hits) assert.ok(Math.abs(h / 10000 - 0.25) <= 0.015, `비율 ${h / 100}%`);
});

test("전체 진행이 항상 종료된다", () => {
  for (let run = 0; run < 200; run++) {
    let s = C.createState(names(30), [
      { name: "A", count: 3 }, { name: "B", count: 5 }, { name: "C", count: 1 },
    ], { loseRule: run % 2 ? "requeue" : "consume" });
    let guard = 0;
    while (s.phase === "drawing" && guard++ < 10000) s = C.applySpin(s, C.decideSlot(s));
    assert.equal(s.phase, "done");
    assert.equal(new Set(s.history.filter((h) => h.result !== "lose" && h.result !== "absent").map((h) => h.participantId)).size,
      s.history.filter((h) => h.result !== "lose" && h.result !== "absent").length);
  }
});
