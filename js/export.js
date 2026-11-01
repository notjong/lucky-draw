(function (root) {
  const pad = (n) => String(n).padStart(2, "0");

  function formatTime(at) {
    const d = new Date(at);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function rows(state) {
    const who = (id) => state.participants.find((p) => p.id === id).label;
    const prizeName = (id) => state.prizes.find((p) => p.id === id).name;
    const winners = [];
    const others = [];
    state.history.forEach((h) => {
      const time = formatTime(h.at);
      if (h.result === "lose") others.push([h.seq, who(h.participantId), "꽝", time]);
      else if (h.result === "absent") others.push([h.seq, who(h.participantId), "불참", time]);
      else winners.push([h.seq, who(h.participantId), prizeName(h.result), time]);
    });
    return { winners, others };
  }

  function csvCell(v) {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(state) {
    const { winners, others } = rows(state);
    const lines = [["순번", "참가자", "경품", "시각"], ...winners];
    if (others.length) {
      lines.push([], ["순번", "참가자", "구분", "시각"], ...others);
    }
    // 엑셀이 UTF-8로 인식하도록 BOM을 붙인다
    return "﻿" + lines.map((r) => r.map(csvCell).join(",")).join("\r\n");
  }

  function toTsv(state) {
    const { winners } = rows(state);
    return [["순번", "참가자", "경품", "시각"], ...winners].map((r) => r.join("\t")).join("\n");
  }

  function downloadCsv(state) {
    const blob = new Blob([toCsv(state)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "추첨결과.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  root.Export = { rows, toCsv, toTsv, downloadCsv, formatTime };
})(window);
