/* Shared feed loader + renderers. Reads latest/index.json, latest/<id>.json, history/<id>.json, daily/<id>.json. */
(() => {
  const $ = (t, attrs = {}, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
  const pct = (pips) => `${(pips / 10000).toFixed(2)}%`;
  const ago = (iso) => { const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000); return s < 90 ? `${Math.round(s)}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`; };
  const fmtMin = (m) => (m < 60 ? `${m}m` : m < 2880 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.round(m / 1440)}d`);
  const get = async (u) => { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
  const explorerFor = (chainId) => (chainId === 4663 ? "https://robinhoodchain.blockscout.com" : chainId === 46630 ? "https://explorer.testnet.chain.robinhood.com" : null);

  async function loadFeed() {
    const idx = await get("latest/index.json");
    const ids = Object.keys(idx);
    const pools = await Promise.all(ids.map(async (id) => {
      let rec = null, hist = [], day = null;
      try { rec = await get(`latest/${id}.json`); } catch {}
      try { hist = await get(`history/${id}.json`); } catch {}
      try { day = await get(`daily/${id}.json`); } catch {}
      return { id, e: idx[id], rec, hist, day };
    }));
    pools.sort((a, b) => a.e.ticker.localeCompare(b.e.ticker));
    return pools;
  }

  function marketLine(m) {
    if (!m) return "";
    if (m.phase === "open") return `open · ${m.minutesToClose}m to close`;
    return `${m.phase}${m.minutesToOpen != null ? ` · ${fmtMin(m.minutesToOpen)} to open` : ""}`;
  }

  function sparkline(h) {
    const W = 800, H = 110, padL = 44, padR = 8, padT = 8, padB = 18;
    const xs = h.map((p) => Date.parse(p.t));
    const ys = h.map((p) => p.feePips / 10000);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(0.5, ...ys) * 1.1;
    const X = (x) => padL + ((x - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);
    const Y = (y) => padT + (1 - y / y1) * (H - padT - padB);
    let d = "";
    h.forEach((p, k) => { d += `${k ? "L" : "M"}${X(xs[k]).toFixed(1)},${Y(ys[k]).toFixed(1)} `; });
    let shade = "";
    for (let k = 0; k < h.length - 1; k++) if (h[k].phase !== "open") shade += `<rect x="${X(xs[k]).toFixed(1)}" y="${padT}" width="${Math.max(1, X(xs[k + 1]) - X(xs[k])).toFixed(1)}" height="${H - padT - padB}" fill="currentColor" opacity=".07"/>`;
    const ticks = [0, y1 / 2, y1].map((v) => `<text class="axis" x="2" y="${(Y(v) + 3).toFixed(1)}">${v.toFixed(2)}%</text>`).join("");
    const span = (x1 - x0) / 3600000;
    const label = span < 1 ? `${Math.max(1, Math.round(span * 60))}m` : span < 48 ? `${span.toFixed(0)}h` : `${(span / 24).toFixed(0)}d`;
    const wrap = document.createElement("div");
    wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${shade}${ticks}<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text class="axis" x="${padL}" y="${H - 4}">fee, last ${label} · shaded = market closed</text></svg>`;
    return wrap.firstElementChild;
  }

  function card(p, detailed) {
    const { id, e, rec, hist, day } = p;
    const mode = e.observe ? "observe" : e.shadow ? "shadow" : "live";
    const i = rec?.inputs ?? {};
    const c = $("article", { class: "card reveal" },
      $("div", { class: "row" }, $("span", { class: "fee num" }, e.feePct), $("span", { class: `tag ${mode}` }, mode === "observe" ? "observed pool" : mode)),
      $("div", { class: "pair" }, `${e.ticker}/USDG · decided ${ago(e.decidedAt)}`),
      $("p", { class: "reason" }, rec?.reason ?? ""),
    );
    const meta = $("div", { class: "meta" });
    if (i.market) meta.append($("span", {}, marketLine(i.market)));
    if (i.gapPct != null) meta.append($("span", {}, `gap ${i.gapPct >= 0 ? "+" : ""}${i.gapPct}%`));
    if (i.pool?.priceUsd != null) meta.append($("span", {}, `pool $${i.pool.priceUsd}`));
    if (i.reference?.priceUsd != null) meta.append($("span", {}, `ref $${i.reference.priceUsd}`));
    c.append(meta);
    if (detailed && rec) {
      const explorer = explorerFor(rec.chainId);
      const dl = $("dl");
      const add = (k, v) => { if (v !== undefined && v !== null && v !== "") dl.append($("dt", {}, k), $("dd", {}, String(v))); };
      add("swaps", i.swapsLastWindow ? `${i.swapsLastWindow.count} in ${i.swapsLastWindow.windowMinutes}m · $${i.swapsLastWindow.volumeUsd} · largest $${i.swapsLastWindow.largestUsd}` : null);
      add("reference", i.reference?.priceUsd != null ? `$${i.reference.priceUsd} via ${i.reference.source}, ${Math.round((i.reference.ageSeconds ?? 0) / 60)}m old` : `none (${i.reference?.source ?? "?"})`);
      add("moved since close", i.referenceMoveSinceClosePct != null ? `${i.referenceMoveSinceClosePct >= 0 ? "+" : ""}${i.referenceMoveSinceClosePct}%` : null);
      add("control pool", i.controlPool?.priceUsd != null ? `$${i.controlPool.priceUsd}` : null);
      add("realized vol", i.realizedVolPct?.h24 != null ? `${i.realizedVolPct.h24}% (24h)` : null);
      add("earnings", i.earnings?.next ? `${i.earnings.next} (${i.earnings.hoursUntil}h)` : null);
      add("split", `LP ${pct(rec.lpPips)} + treasury ${pct(rec.treasuryPips)}`);
      add("on-chain", rec.onchain ? `effective ${pct(rec.onchain.effectiveFeePips)}, cached ${pct(rec.onchain.cachedFeePips)}${rec.onchain.cachedExpiry ? ` until ${new Date(rec.onchain.cachedExpiry * 1000).toUTCString()}` : ""}, nonce ${rec.onchain.lastNonce}` : null);
      add("bounds", i.fee ? `${pct(i.fee.minPips)} to ${pct(i.fee.maxPips)}, default ${pct(i.fee.defaultPips)}` : null);
      add("decider", rec.decider);
      if (rec.update) add("signed", `nonce ${rec.update.nonce}, expires ${new Date(Number(rec.update.expiry) * 1000).toUTCString()}`);
      if (rec.refresh) {
        const dd = $("dd", {}, `${rec.refresh.applied ? "applied" : `rejected (reason ${rec.refresh.rejectReason})`}, ${Number(rec.refresh.gasUsed).toLocaleString()} gas `);
        if (explorer) dd.append($("a", { href: `${explorer}/tx/${rec.refresh.txHash}`, target: "_blank", rel: "noopener" }, "tx"));
        dl.append($("dt", {}, "refresh"), dd);
      }
      const raw = $("dd", {}, $("a", { href: `latest/${id}.json` }, "latest"), " · ", $("a", { href: `history/${id}.json` }, "history"));
      if (explorer && rec.hook && rec.hook !== "0x0000000000000000000000000000000000000000") raw.append(" · ", $("a", { href: `${explorer}/address/${rec.hook}`, target: "_blank", rel: "noopener" }, "hook"));
      raw.append(" · ", $("span", {}, `pool ${id.slice(0, 10)}…`));
      dl.append($("dt", {}, "raw"), raw);
      c.append(dl);
      if (day?.gap) {
        const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
        const line = (p) => `${p.label}: ${p.swaps} swaps, $${p.volumeUsd.toFixed(0)}, fees ${usd(p.lpFeesUsd)}${p.lpLossUsd == null ? "" : `, lost ${usd(p.lpLossUsd)} to informed flow (${p.markoutBps.toFixed(1)}bp), kept ${usd(p.lpFeesUsd - p.lpLossUsd)}`}`;
        const box = $("div", { class: "meta" }, $("span", {}, `last ${day.windowHours}h (${ago(day.at)}): ${line(day.gap)}`));
        if (day.control) box.append($("span", {}, line(day.control)));
        c.append(box);
      }
    }
    if (hist.length > 1) c.append(sparkline(hist));
    return c;
  }

  async function renderCards(el, detailed) {
    try {
      const pools = await loadFeed();
      el.replaceChildren();
      if (!pools.length) { el.append($("div", { class: "empty" }, "Nothing published yet. Margin is not running.")); return pools; }
      for (const p of pools) el.append(card(p, detailed));
      return pools;
    } catch (err) {
      el.replaceChildren($("div", { class: "empty" }, `feed unavailable (${err.message})`));
      return [];
    }
  }

  function renderClock(el, pools) {
    const m = pools.find((p) => p.rec?.inputs?.market)?.rec.inputs.market;
    if (!m) { el.replaceChildren($("span", { class: "phase" }, "no data")); return; }
    const big = m.phase === "open" ? `${m.minutesToClose}m` : m.minutesToOpen != null ? fmtMin(m.minutesToOpen) : "–";
    const what = m.phase === "open" ? "to the close" : "to the open";
    el.replaceChildren(
      $("span", { class: "phase" }, `NYSE ${m.phase}${m.earlyClose ? " · early close" : ""}`),
      $("span", { class: "big num" }, big),
      $("span", {}, what),
      $("span", {}, m.nowEt ?? ""),
    );
  }

  function renderTape(el, pools) {
    const items = pools.filter((p) => p.rec?.reason).map((p) => $("span", {}, $("b", {}, `${p.e.ticker} ${p.e.feePct}`), ` ${p.rec.reason}`));
    if (!items.length) { el.hidden = true; return; }
    const track = $("div", { class: "track" }, ...items, ...items.map((i) => i.cloneNode(true)));
    el.replaceChildren(track);
  }

  window.GapFee = { renderCards, renderClock, renderTape };
})();
