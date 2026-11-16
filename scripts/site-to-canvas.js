// site-to-canvas.js — 把「使用者自己的網站」目前畫面量成 Job Pocket 自由畫布資料（照搬用）。
//
// 用法：在使用者的網站頁面（電腦版寬度，例如 1280）打開瀏覽器主控台或自動化工具，貼上整份檔案後執行：
//   await siteToCanvas({ sections: "section", width: 1000 })
// 回傳 { canvases: [...], assets: { key: { url } | { svg } } }。
// - 每個 section（或你給的選擇器）變成一塊畫布（太多圖層會自動切成上下兩塊）。
// - 位置、大小、字級、顏色都是瀏覽器實際畫出來的值，換算成寬 1000 的畫布單位。
// - 圖片和 CSS 背景圖記在 assets 裡（原圖網址；內嵌 SVG 存成文字），圖層的 image 是 "asset:<key>"，
//   上傳（upload_card_image）拿到 asset_id 後再換掉。
// - 文字逐行量：每一行一個文字圖層，換字型也不會整段重排。
// - 連結（<a href="https://...">）變成看不到的連結熱區（hotspot）。
// 只讀頁面，不改任何東西、不送出任何資料。
(function attach(global) {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK", "HEAD", "IFRAME", "VIDEO", "CANVAS", "AUDIO"]);
  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

  function parseRgba(text) {
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/u.exec(text || "");
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const hex = "#" + [m[1], m[2], m[3]].map((c) => Math.max(0, Math.min(255, Math.round(+c))).toString(16).padStart(2, "0")).join("");
    return { hex, a };
  }

  // 把 linear-gradient(...) 拆成 { angle, stops:[{color,at}] }；位置用 px 時照元素高度換算。
  function parseLinear(text, boxH) {
    const m = /^linear-gradient\((.*)\)$/u.exec(text.trim());
    if (!m) return null;
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of m[1]) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
    }
    parts.push(cur.trim());
    let angle = 180;
    if (/deg$|^to /u.test(parts[0])) {
      const first = parts.shift();
      const dirs = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 };
      angle = first.endsWith("deg") ? parseFloat(first) : dirs[first] ?? 180;
    }
    const stops = [];
    parts.forEach((part, i) => {
      const color = parseRgba(part);
      if (!color) return;
      const pos = /\)\s+([\d.]+)(px|%)/u.exec(part);
      let at = pos ? (pos[2] === "%" ? +pos[1] / 100 : +pos[1] / Math.max(1, boxH)) : null;
      if (at === null) at = parts.length === 1 ? 0 : i / (parts.length - 1);
      stops.push({ color: color.hex, at: Math.max(0, Math.min(1, at)), a: color.a });
    });
    if (stops.length < 2) return null;
    const out = { from: stops[0].color, to: stops.at(-1).color, angle: Math.round(((angle % 360) + 360) % 360) };
    const mid = stops.slice(1, -1).filter((s) => s.at > 0 && s.at < 1).map((s) => ({ color: s.color, at: round(s.at, 3) }));
    if (mid.length) out.stops = mid.slice(0, 6);
    out.alpha = Math.min(...stops.map((s) => s.a));
    return out;
  }

  function splitLayers(text) {
    const out = [];
    let depth = 0, cur = "";
    for (const ch of text) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  // 內嵌 SVG：把 currentColor 和算出來的 fill/stroke 寫死，序列化成獨立的 SVG 檔。
  function serializeSvg(svg) {
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll("*")];
    const dst = [clone, ...clone.querySelectorAll("*")];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const d = dst[i];
      for (const prop of ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin"]) {
        const v = cs.getPropertyValue(prop);
        if (v && v !== "normal") d.setAttribute(prop, v.replace(/currentcolor/giu, cs.color));
      }
      d.removeAttribute("class");
      d.removeAttribute("style");
    });
    const r = svg.getBoundingClientRect();
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(Math.round(r.width)));
    clone.setAttribute("height", String(Math.round(r.height)));
    return clone.outerHTML;
  }

  function fontKeyOf(family) {
    const f = family.toLowerCase();
    if (/press start|arcade/u.test(f)) return "arcade";
    if (/pixel|silkscreen|dotgothic/u.test(f)) return "pixel";
    if (/mono|code|courier/u.test(f)) return "mono";
    if (/serif/u.test(f) && !/sans/u.test(f)) return "serif";
    if (/inter\b/u.test(f)) return "inter";
    if (/grotesk/u.test(f)) return "grotesk";
    return "sans";
  }

  // overlays：疊在第一段上面的東西（sticky／fixed 的導覽列），選擇器，畫在第一塊畫布最上層。
  async function siteToCanvas({ sections = "section", width = 1000, maxNodes = 195, include = null, overlays = "" } = {}) {
    window.scrollTo(0, 0);
    await new Promise((ok) => setTimeout(ok, 400));
    // 圖片都先載完（lazy 的也載），動畫停住，量到的才是最後的位置。
    document.querySelectorAll("img[loading=lazy]").forEach((img) => { img.loading = "eager"; });
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; }))));
    await document.fonts?.ready;
    const assets = {};
    const assetKey = (desc) => {
      const key = "a" + (Object.keys(assets).length + 1);
      const found = Object.entries(assets).find(([, v]) => JSON.stringify(v) === JSON.stringify(desc));
      if (found) return found[0];
      assets[key] = desc;
      return key;
    };
    const roots = [...document.querySelectorAll(sections)].filter((el) => el.getBoundingClientRect().height > 0);
    const canvases = [];
    for (const root of roots) {
      const base = root.getBoundingClientRect();
      const s = width / base.width;
      const nodes = [];
      const X = (v) => round((v - base.left) * s);
      const Y = (v) => round((v - base.top) * s);
      const L = (v) => round(v * s);
      const H = round(base.height * s);
      const visible = (r) => r.width > 0.5 && r.height > 0.5 && r.right > base.left && r.left < base.right && r.bottom > base.top && r.top < base.bottom;

      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: X(r.left), y: Y(r.top), w: L(r.width), h: L(r.height), r };
      };

      function backgrounds(el, cs, opacity) {
        const b = box(el);
        if (!visible(b.r)) return;
        const radius = L(parseFloat(cs.borderTopLeftRadius) || 0);
        const ellipse = /50%/u.test(cs.borderTopLeftRadius) && Math.abs(b.w - b.h) < 2;
        // 實心硬陰影（像素風常用 box-shadow 畫外框）：沒有模糊的畫成墊在下面的方塊。
        for (const shadow of splitLayers(cs.boxShadow === "none" ? "" : cs.boxShadow)) {
          const color = parseRgba(shadow);
          const nums = shadow.replace(/rgba?\([^)]*\)/u, "").trim().split(/\s+/u).map(parseFloat).filter((n) => !Number.isNaN(n));
          if (color && /inset/u.test(shadow) && !nums[0] && !nums[1] && !(nums[2] > 1) && nums[3] > 0) {
            // inset 0 0 0 Npx：常被拿來畫外框線。
            nodes.push({ type: ellipse ? "ellipse" : "rect", x: b.x, y: b.y, w: b.w, h: b.h, radius, stroke: color.hex, strokeWidth: Math.max(0.5, L(nums[3])), opacity: round(color.a * opacity, 2) });
            continue;
          }
          if (!color || /inset/u.test(shadow) || nums.length < 2 || (nums[2] || 0) > 1) continue;
          const spread = nums[3] || 0;
          nodes.push({ type: "rect", x: round(b.x + L(nums[0] - spread)), y: round(b.y + L(nums[1] - spread)), w: round(b.w + L(spread * 2)), h: round(b.h + L(spread * 2)), fill: color.hex, radius, opacity: round(color.a * opacity, 2) });
        }
        const bg = parseRgba(cs.backgroundColor);
        const sides = ["Top", "Right", "Bottom", "Left"].map((side) => ({ side, w: cs[`border${side}Style`] === "none" ? 0 : parseFloat(cs[`border${side}Width`]) || 0, c: parseRgba(cs[`border${side}Color`]) }));
        const same = sides.every((x) => x.w === sides[0].w && x.c?.hex === sides[0].c?.hex);
        const borderW = same ? sides[0].w : 0;
        const border = borderW > 0 ? sides[0].c : null;
        if (!same) {
          // 只有某幾邊有框線（例如清單每列只有上框線）：每一邊畫成一條細長方塊。
          for (const x of sides) {
            if (!x.w || !x.c || x.c.a < 0.02) continue;
            const t = Math.max(0.5, L(x.w));
            const line = x.side === "Top" ? [b.x, b.y, b.w, t] : x.side === "Bottom" ? [b.x, round(b.y + b.h - t), b.w, t] : x.side === "Left" ? [b.x, b.y, t, b.h] : [round(b.x + b.w - t), b.y, t, b.h];
            nodes.push({ type: "rect", x: line[0], y: line[1], w: line[2], h: line[3], fill: x.c.hex, opacity: round(x.c.a * opacity, 2) });
          }
        }
        if ((bg && bg.a > 0.02) || (border && border.a > 0.02)) {
          nodes.push({
            type: ellipse ? "ellipse" : "rect", x: b.x, y: b.y, w: b.w, h: b.h, radius,
            ...(bg && bg.a > 0.02 ? { fill: bg.hex } : {}),
            ...(border && border.a > 0.02 ? { stroke: border.hex, strokeWidth: Math.max(0.5, L(borderW)) } : {}),
            opacity: round(Math.max(bg?.a || 0, border?.a || 0) * opacity, 2),
          });
        }
        if (cs.backgroundImage && cs.backgroundImage !== "none") {
          const layers = splitLayers(cs.backgroundImage).reverse();
          const sizes = splitLayers(cs.backgroundSize).reverse();
          const repeats = splitLayers(cs.backgroundRepeat).reverse();
          const positions = splitLayers(cs.backgroundPosition).reverse();
          layers.forEach((layer, i) => {
            if (layer.startsWith("linear-gradient")) {
              const g = parseLinear(layer, b.r.height);
              if (g) {
                const { alpha, ...gradient } = g;
                nodes.push({ type: "rect", x: b.x, y: b.y, w: b.w, h: b.h, radius, gradient, opacity: round(alpha * opacity, 2) });
              }
              return;
            }
            const url = /url\("?([^")]+)"?\)/u.exec(layer)?.[1];
            if (!url) return;
            const img = new Image();
            img.src = url;
            const natW = img.naturalWidth || 1;
            const natH = img.naturalHeight || 1;
            const size = (sizes[i] || "auto").split(/\s+/u);
            const parse = (v, total) => (v.endsWith("%") ? total * parseFloat(v) / 100 : v.endsWith("px") ? parseFloat(v) : null);
            let tw = size[0] === "cover" || size[0] === "contain" ? null : parse(size[0], b.r.width);
            let th = size[1] ? parse(size[1], b.r.height) : null;
            if (size[0] === "cover") { const k = Math.max(b.r.width / natW, b.r.height / natH); tw = natW * k; th = natH * k; }
            if (size[0] === "contain") { const k = Math.min(b.r.width / natW, b.r.height / natH); tw = natW * k; th = natH * k; }
            if (tw === null && th === null) { tw = natW; th = natH; }
            if (tw === null) tw = th * natW / natH;
            if (th === null) th = tw * natH / natW;
            const repeat = (repeats[i] || "repeat").trim();
            const key = assetKey({ url });
            const pos = (positions[i] || "0% 0%").split(/\s+/u);
            const offset = (v, free) => (v.endsWith("%") ? free * parseFloat(v) / 100 : parseFloat(v) || 0);
            const pixelated = cs.imageRendering === "pixelated" || cs.imageRendering === "crisp-edges";
            if (repeat === "no-repeat") {
              const left = b.r.left + offset(pos[0], b.r.width - tw);
              const top = b.r.top + offset(pos[1] || "50%", b.r.height - th);
              nodes.push({ type: "image", image: `asset:${key}`, x: X(left), y: Y(top), w: L(tw), h: L(th), fit: "fill", pixelated, opacity: round(opacity, 2) });
            } else {
              const dir = repeat === "repeat-x" ? "x" : repeat === "repeat-y" ? "y" : "both";
              nodes.push({ type: "image", image: `asset:${key}`, x: b.x, y: b.y, w: b.w, h: dir === "x" ? L(th) : b.h, repeat: dir, tile: L(tw), pixelated, fit: "fill", opacity: round(opacity, 2) });
            }
          });
        }
      }

      // 逐字量出每一行，回傳 [{ text, rect }]。
      // object-position → focus；mask-image 的 linear-gradient → fade（只看透明度）。
      function imageExtras(cs) {
        const out = {};
        const pos = (cs.objectPosition || "50% 50%").split(/\s+/u);
        const frac = (v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) === 0 ? 0 : 0.5);
        const focus = { x: frac(pos[0] || "50%"), y: frac(pos[1] || "50%") };
        if (focus.x !== 0.5 || focus.y !== 0.5) out.focus = focus;
        const mask = cs.maskImage && cs.maskImage !== "none" ? cs.maskImage : cs.webkitMaskImage;
        if (mask && mask.startsWith("linear-gradient")) {
          const g = parseLinear(mask, 1);
          if (g) {
            const inner = /^linear-gradient\((.*)\)$/u.exec(mask)[1];
            const parts = splitLayers(inner).filter((part) => parseRgba(part));
            const stops = parts.map((part, i) => { const c = parseRgba(part); const m = /\)\s+([\d.]+)%/u.exec(part); return { at: m ? +m[1] / 100 : i / Math.max(1, parts.length - 1), alpha: c.a }; });
            out.fade = { angle: g.angle, stops: stops.slice(0, 6) };
          }
        }
        return out;
      }

      function lines(textNode) {
        const out = [];
        const range = document.createRange();
        const text = textNode.data;
        let current = null;
        for (let i = 0; i < text.length; i += 1) {
          range.setStart(textNode, i);
          range.setEnd(textNode, i + 1);
          const rects = range.getClientRects();
          const r = rects[rects.length - 1];
          if (!r || r.width === 0) { if (current) current.text += text[i]; continue; }
          if (!current || Math.abs(r.top - current.top) > r.height * 0.5) {
            if (current) out.push(current);
            current = { text: "", top: r.top, left: r.left, right: r.right, bottom: r.bottom };
          }
          current.text += text[i];
          current.left = Math.min(current.left, r.left);
          current.right = Math.max(current.right, r.right);
          current.bottom = Math.max(current.bottom, r.bottom);
        }
        if (current) out.push(current);
        return out.map((line) => ({ ...line, text: line.text.replace(/\s+/gu, " ").trim() })).filter((line) => line.text);
      }

      function text(node, cs, opacity) {
        const color = parseRgba(cs.color) || { hex: "#111111", a: 1 };
        const size = parseFloat(cs.fontSize);
        const shadow = cs.textShadow && cs.textShadow !== "none" ? splitLayers(cs.textShadow)[0] : null;
        const sh = shadow && parseRgba(shadow);
        const shNums = shadow ? shadow.replace(/rgba?\([^)]*\)/u, "").trim().split(/\s+/u).map(parseFloat) : [];
        for (const line of lines(node)) {
          const r = { left: line.left, top: line.top, width: line.right - line.left, height: line.bottom - line.top, right: line.right, bottom: line.bottom };
          if (!visible(r)) continue;
          const lh = cs.lineHeight === "normal" ? 1.25 : parseFloat(cs.lineHeight) / size;
          // 文字框：寬多留 12% 防換字型後被擠到下一行；y 對齊這一行的行框。
          const lineBox = Math.max(r.height, size * lh);
          nodes.push({
            type: "text", text: cs.textTransform === "uppercase" ? line.text.toUpperCase() : line.text,
            x: X(r.left), y: Y(r.top + r.height / 2 - lineBox / 2), w: round(L(r.width) * 1.12 + 2), h: L(lineBox),
            size: L(size), weight: Math.round(parseFloat(cs.fontWeight) / 100) * 100 || 400, font: fontKeyOf(cs.fontFamily),
            color: color.hex, lineHeight: Math.min(2.4, Math.max(0.8, round(lh, 2))), letterSpacing: cs.letterSpacing === "normal" ? 0 : round(parseFloat(cs.letterSpacing) / size, 3),
            italic: cs.fontStyle === "italic", opacity: round(color.a * opacity, 2),
            ...(sh && sh.a > 0 ? { shadow: { color: sh.hex, x: L(shNums[0] || 0), y: L(shNums[1] || 0), blur: L(shNums[2] || 0) } } : {}),
          });
        }
      }

      function walk(el, opacity) {
        if (SKIP.has(el.tagName)) return;
        if (include && !include(el)) return;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return;
        const op = opacity * parseFloat(cs.opacity || "1");
        if (op < 0.02) return;
        if ((cs.position === "fixed" || cs.position === "sticky") && el !== root && !el.matches?.(overlays || ":not(*)")) return; // 導覽列另外用 overlays 處理
        backgrounds(el, cs, op);
        if (el.tagName === "IMG") {
          const b = box(el);
          // 被有圓角、overflow 裁切的外框包住時，圖片跟著用外框的圓角。
          let clipRadius = parseFloat(cs.borderTopLeftRadius) || 0;
          for (let up = el.parentElement; up && up !== root.parentElement; up = up.parentElement) {
            const ucs = getComputedStyle(up);
            if (ucs.overflow !== "visible" && parseFloat(ucs.borderTopLeftRadius) > 0) {
              const ur = up.getBoundingClientRect();
              const touches = Math.abs(ur.top - b.r.top) < 2 || Math.abs(ur.bottom - b.r.bottom) < 2 || Math.abs(ur.left - b.r.left) < 2 || Math.abs(ur.right - b.r.right) < 2;
              if (touches) clipRadius = Math.max(clipRadius, parseFloat(ucs.borderTopLeftRadius));
              break;
            }
          }
          if (visible(b.r) && el.currentSrc) {
            nodes.push({ type: "image", image: `asset:${assetKey({ url: el.currentSrc })}`, x: b.x, y: b.y, w: b.w, h: b.h, fit: ["contain", "fill"].includes(cs.objectFit) ? cs.objectFit : "cover", radius: L(clipRadius), pixelated: cs.imageRendering === "pixelated" || cs.imageRendering === "crisp-edges", alt: el.alt || "", opacity: round(op, 2), ...imageExtras(cs) });
          }
          return;
        }
        if (el.tagName.toLowerCase() === "svg") {
          const b = box(el);
          if (visible(b.r) && b.w >= 4) nodes.push({ type: "image", image: `asset:${assetKey({ svg: serializeSvg(el) })}`, x: b.x, y: b.y, w: b.w, h: b.h, fit: "contain", pixelated: false, opacity: round(op, 2) });
          return;
        }
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.data.trim()) text(child, cs, op);
          else if (child.nodeType === Node.ELEMENT_NODE) walk(child, op);
        }
        if (el.tagName === "A" && /^https:\/\//u.test(el.href)) {
          const b = box(el);
          if (visible(b.r)) nodes.push({ type: "hotspot", url: el.href, label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/gu, " ").trim().slice(0, 60), x: b.x, y: b.y, w: b.w, h: b.h });
        }
      }

      const rootCs = getComputedStyle(root);
      walk(root, 1);
      if (overlays && root === roots[0]) for (const el of document.querySelectorAll(overlays)) walk(el, 1);
      // 畫布底色：用這一段的背景色（沒有就白色），背景漸層已經變成最底下的方塊。
      const bg = parseRgba(rootCs.backgroundColor);
      const all = nodes.map((n) => ({ ...n, x: n.x, y: n.y }));
      // 圖層太多就切成上下幾塊（切在沒有文字跨過的位置附近）。
      const chunks = [];
      if (all.length <= maxNodes) chunks.push({ top: 0, bottom: H });
      else {
        const parts = Math.ceil(all.length / maxNodes) + 1;
        let top = 0;
        for (let i = 1; i <= parts; i += 1) {
          const bottom = i === parts ? H : round(H * i / parts);
          chunks.push({ top, bottom });
          top = bottom;
        }
      }
      for (const chunk of chunks) {
        const inside = all.filter((n) => n.y < chunk.bottom && n.y + n.h > chunk.top).map((n) => ({ ...n, y: round(n.y - chunk.top) }));
        // 切開時，跨過切線的大背景（天空、地面）兩塊都要有。
        canvases.push({ title: root.id || root.getAttribute("aria-label") || "", canvas: { height: round(chunk.bottom - chunk.top, 0), bg: bg && bg.a > 0.5 ? bg.hex : "#ffffff", nodes: inside } });
      }
    }
    return { canvases, assets };
  }

  global.siteToCanvas = siteToCanvas;
})(typeof window !== "undefined" ? window : globalThis);
