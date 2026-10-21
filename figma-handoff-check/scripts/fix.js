// Figma handoff fixes — only the safe, mechanical ones. Paste into use_figma after
// setting the values below. MODE 'plan' only reads and lists what it would change;
// MODE 'apply' makes those changes, once the designer has saved a version to roll back to.
const ROOT_ID = '__ROOT_ID__';          // same frame the audit ran on, e.g. '1282:5640'
const MODE = 'plan';                    // 'plan' (read-only) or 'apply'
const OPTS = {
  fixes: ['roundPixels', 'lineHeights', 'textStyles', 'colours', 'names', 'hiddenLayers'], // the ones the designer said yes to
  skipIds: [],                          // layers the designer wants left alone, e.g. ['1645:453']
  renames: {},                          // { '<layer id>': 'Better name' }: overrides the suggested names
  colourChoice: {},                     // { '#3C3C3B': '<style or variable id>' }: when a colour matches several
  headingFrom: 20,                      // text this size or larger counts as a heading
  headingLineHeight: 120,               // % used when the current Auto height can't be measured
  bodyLineHeight: 150,                  // % used when the current Auto height can't be measured
  expect: null,                         // apply only: the plan's `counts`; nothing changes if they differ
  versionSaved: false,                  // apply only: true once the designer says they saved a version (File → Save to version history)
  maxChanges: 400,                      // per run; run again for the rest
  maxList: 60,                          // planned items listed per fix (counts are always complete)
};

// ---------- setup ----------
let root = await figma.getNodeByIdAsync(ROOT_ID);
if (!root) return { error: `No node with id ${ROOT_ID}. Check the link's node-id (use ':' not '-').` };
let page = root;
while (page && page.type !== 'PAGE') page = page.parent;
if (page) await figma.setCurrentPageAsync(page);
root = await figma.getNodeByIdAsync(ROOT_ID);

const cut = (t, k = 40) => (t.length > k ? t.slice(0, k) + '…' : t);
const r2 = (v) => Math.round(v * 100) / 100;
const isMixed = (v) => typeof v === 'symbol';
const hex = (c) => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const alpha = (p) => Math.round(((p.opacity ?? 1) * (p.color.a ?? 1)) * 100) / 100;
const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Image|Union|Subtract|Intersect|Exclude|Component|Instance|Text|Section|Container|Layer|Mask group)( \d+)?$/i;
const want = new Set(OPTS.fixes);
const skip = new Set(OPTS.skipIds);
// layers inside an instance belong to the main component; locked layers were locked on purpose
const inInstance = (n) => n.id.startsWith('I');
const locked = (n) => { for (let p = n; p && p.type !== 'PAGE'; p = p.parent) if (p.locked) return true; return false; };
const untouchable = (n) => n !== root && (skip.has(n.id) || inInstance(n) || locked(n));

// same walk as the audit: stop at instances, list hidden layers without entering them
const own = [];
(function walk(n) {
  own.push(n);
  if (n !== root && n.visible === false) return;
  if ('children' in n && (n === root || n.type !== 'INSTANCE')) for (const c of n.children) walk(c);
})(root);

const plan = {};
const leftAlone = [];
const add = (fix, n, change, run) => { (plan[fix] = plan[fix] || []).push({ id: n.id, name: cut(n.name), change, run }); };
const note = (fix, n, why) => { if (leftAlone.length < 40) leftAlone.push({ fix, id: n.id, name: cut(n.name), why }); };

// ---------- style and variable candidates (local + already used in this frame) ----------
const textStyles = new Map(), paintStyles = new Map();
for (const s of await figma.getLocalTextStylesAsync()) textStyles.set(s.id, s);
for (const s of await figma.getLocalPaintStylesAsync()) paintStyles.set(s.id, s);
for (const n of own) {
  if (n.type === 'TEXT') {
    let segs = []; try { segs = n.getStyledTextSegments(['textStyleId']); } catch (e) {}
    for (const s of segs) if (s.textStyleId && !textStyles.has(s.textStyleId)) {
      try { const st = await figma.getStyleByIdAsync(s.textStyleId); if (st) textStyles.set(st.id, st); } catch (e) {}
    }
  }
  if ('fillStyleId' in n && typeof n.fillStyleId === 'string' && n.fillStyleId && !paintStyles.has(n.fillStyleId)) {
    try { const st = await figma.getStyleByIdAsync(n.fillStyleId); if (st) paintStyles.set(st.id, st); } catch (e) {}
  }
}
const colourTargets = {}; // '#HEX@alpha' → [{ kind, id, name }]
const addTarget = (key, t) => { (colourTargets[key] = colourTargets[key] || []).push(t); };
for (const s of paintStyles.values()) {
  const solid = s.paints.length === 1 && s.paints[0].type === 'SOLID' ? s.paints[0] : null;
  if (solid) addTarget(`${hex(solid.color)}@${alpha(solid)}`, { kind: 'style', id: s.id, name: s.name });
}
try {
  for (const v of await figma.variables.getLocalVariablesAsync('COLOR')) {
    const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    let val = v.valuesByMode[col.defaultModeId];
    if (val && val.type === 'VARIABLE_ALIAS') { const t = await figma.variables.getVariableByIdAsync(val.id); val = t && t.valuesByMode[Object.keys(t.valuesByMode)[0]]; }
    if (val && 'r' in val) addTarget(`${hex(val)}@${Math.round((val.a ?? 1) * 100) / 100}`, { kind: 'variable', id: v.id, name: `${col.name} / ${v.name}` });
  }
} catch (e) {}

const sameLH = (a, b) => a.unit === b.unit && (a.unit === 'AUTO' || Math.abs(a.value - b.value) < 0.01);
const sameLS = (a, b) => a.unit === b.unit && Math.abs(a.value - b.value) < 0.01;
const styleFor = (seg) => [...textStyles.values()].filter(s =>
  s.fontName.family === seg.fontName.family && s.fontName.style === seg.fontName.style && s.fontSize === seg.fontSize
  && sameLH(s.lineHeight, seg.lineHeight) && sameLS(s.letterSpacing, seg.letterSpacing) && s.textCase === seg.textCase);

// Auto line height as it renders now (px), when the box is one line tall; otherwise the guide's default (%)
const measuredLH = (n, size) => {
  const oneLine = !n.characters.includes('\n') && (n.textAutoResize === 'WIDTH_AND_HEIGHT' || (n.textAutoResize === 'HEIGHT' && n.height < size * 1.6));
  return oneLine && n.height > 0 ? { unit: 'PIXELS', value: Math.round(n.height) } : null;
};
const guideLH = (size) => ({ unit: 'PERCENT', value: size >= OPTS.headingFrom ? OPTS.headingLineHeight : OPTS.bodyLineHeight });
const lhText = (v) => v.unit === 'PIXELS' ? `${v.value}px` : `${v.value}%`;
const loadFonts = async (n) => { for (const f of n.getRangeAllFontNames(0, n.characters.length)) await figma.loadFontAsync(f); };

// ---------- plan ----------
const styleLH = new Map(); // style id → { style, size, measured }
for (const n of own) {
  if (n === root) continue;

  // hidden leftovers: delete, unless a component property shows/hides them
  if (n.visible === false) {
    if (!want.has('hiddenLayers')) continue;
    if (untouchable(n)) { if (!skip.has(n.id)) note('hiddenLayers', n, inInstance(n) ? 'inside an instance: hide/delete it in the main component' : 'locked'); continue; }
    if (n.componentPropertyReferences && n.componentPropertyReferences.visible) { note('hiddenLayers', n, 'shown by a component property (a state), kept'); continue; }
    add('hiddenLayers', n, 'delete hidden layer', () => n.remove());
    continue;
  }
  if (untouchable(n)) continue;

  // half-pixel sizes and positions on boxes
  if (want.has('roundPixels') && ['FRAME', 'RECTANGLE', 'INSTANCE', 'COMPONENT', 'ELLIPSE'].includes(n.type)) {
    const inFlow = n.parent && 'layoutMode' in n.parent && n.parent.layoutMode !== 'NONE' && n.layoutPositioning !== 'ABSOLUTE';
    const frac = (v) => Math.abs(v - Math.round(v)) > 0.01;
    const sizedBy = (axis) => { const s = axis === 'w' ? n.layoutSizingHorizontal : n.layoutSizingVertical; return s === 'FILL' || s === 'HUG'; };
    const ch = {};
    if (!inFlow && frac(n.x)) ch.x = [r2(n.x), Math.round(n.x)];
    if (!inFlow && frac(n.y)) ch.y = [r2(n.y), Math.round(n.y)];
    if (frac(n.width) && !sizedBy('w')) ch.w = [r2(n.width), Math.max(1, Math.round(n.width))];
    if (frac(n.height) && !sizedBy('h')) ch.h = [r2(n.height), Math.max(1, Math.round(n.height))];
    if ((frac(n.width) && sizedBy('w')) || (frac(n.height) && sizedBy('h'))) note('roundPixels', n, 'size comes from Fill/Hug: round what is inside or around it');
    if (Object.keys(ch).length) add('roundPixels', n, Object.entries(ch).map(([k, [a, b]]) => `${k} ${a}→${b}`).join(', '), () => {
      if (ch.w || ch.h) n.resizeWithoutConstraints(ch.w ? ch.w[1] : n.width, ch.h ? ch.h[1] : n.height);
      if (ch.x) n.x = ch.x[1];
      if (ch.y) n.y = ch.y[1];
    });
  }

  // default names
  if (want.has('names') && ['FRAME', 'GROUP', 'RECTANGLE', 'INSTANCE', 'COMPONENT'].includes(n.type) && DEFAULT_NAME.test(n.name.trim())) {
    const p = n.parent;
    if (p && 'width' in p && p.width <= 64 && p.height <= 64) continue; // icon insides can stay
    let name = OPTS.renames[n.id] || null, context = '';
    if (!name && n.type === 'INSTANCE') {
      const main = await n.getMainComponentAsync();
      const src = main && (main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : main);
      if (src && !DEFAULT_NAME.test(src.name)) name = src.name;
    }
    if (!name && n.type === 'RECTANGLE') {
      const img = !isMixed(n.fills) && n.fills.some(f => f.type === 'IMAGE');
      if (img) name = 'Image';
      else if (Math.min(n.width, n.height) <= 2) name = 'Divider';
      else if (p && 'width' in p && n.width * n.height >= 0.85 * p.width * p.height) name = 'Background';
    }
    if ('findAll' in n) {
      const texts = n.findAll(c => c.type === 'TEXT' && c.visible).slice(0, 3).map(t => cut(t.characters.replace(/\s+/g, ' ').trim(), 30));
      context = `${n.type.toLowerCase()} ${Math.round(n.width)}×${Math.round(n.height)}${n.layoutMode && n.layoutMode !== 'NONE' ? ', ' + n.layoutMode.toLowerCase() : ''}${texts.length ? ', text: ' + texts.join(' | ') : ''}`;
      if (!name && texts.length) name = texts[0];
    }
    if (name) { const to = name; add('names', n, `rename to "${to}"${context ? ` (${context})` : ''}`, () => { n.name = to; }); }
    else note('names', n, `no good name found${context ? ` (${context})` : ''}: give one in renames`);
  }

  // text: matching style, Auto line height
  if (n.type === 'TEXT' && (want.has('textStyles') || want.has('lineHeights'))) {
    if (n.hasMissingFont) { note('textStyles', n, 'font not installed on this computer'); continue; }
    let segs = [];
    try { segs = n.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textCase', 'textStyleId']); } catch (e) {}
    for (const s of segs) {
      if (!s.textStyleId && want.has('textStyles')) {
        const m = styleFor(s);
        if (m.length === 1) {
          const st = m[0];
          add('textStyles', n, `apply text style "${st.name}" to "${cut(s.characters, 25)}"`, async () => {
            await figma.loadFontAsync(st.fontName);
            await n.setRangeTextStyleIdAsync(s.start, s.end, st.id);
          });
          continue; // the style now owns its line height
        }
        if (m.length > 1) note('textStyles', n, `matches several styles: ${m.map(x => x.name).join(', ')}`);
      }
      if (s.lineHeight.unit !== 'AUTO' || !want.has('lineHeights')) continue;
      if (s.textStyleId) {
        const st = textStyles.get(s.textStyleId);
        if (!st) continue;
        const e = styleLH.get(st.id) || { style: st, size: st.fontSize, measured: null, uses: 0 };
        e.uses++;
        if (e.measured == null && segs.length === 1) e.measured = measuredLH(n, s.fontSize);
        styleLH.set(st.id, e);
        continue;
      }
      const m = segs.length === 1 ? measuredLH(n, s.fontSize) : null;
      const v = m ?? guideLH(s.fontSize);
      add('lineHeights', n, `line height Auto → ${lhText(v)} on "${cut(s.characters, 25)}" (${s.fontSize}px)${m ? ', same look as now' : ', guide value: the text box will change height'}`, async () => {
        await loadFonts(n);
        n.setRangeLineHeight(s.start, s.end, v);
      });
    }
  }

  // colours: a loose solid fill that exactly matches one colour style or variable
  if (want.has('colours') && 'fills' in n && !isMixed(n.fills) && n.fills.length === 1) {
    const f = n.fills[0];
    const bound = n.boundVariables && n.boundVariables.fills && n.boundVariables.fills.length;
    if (f.type !== 'SOLID' || f.visible === false || n.fillStyleId || bound) continue;
    const key = `${hex(f.color)}@${alpha(f)}`;
    let targets = colourTargets[key] || [];
    const chosen = OPTS.colourChoice[hex(f.color)];
    if (chosen) targets = targets.filter(t => t.id === chosen);
    if (targets.length === 1) {
      const t = targets[0];
      add('colours', n, `${hex(f.color)} → ${t.kind} "${t.name}"`, async () => {
        if (t.kind === 'style') await n.setFillStyleIdAsync(t.id);
        else { const v = await figma.variables.getVariableByIdAsync(t.id); n.fills = [figma.variables.setBoundVariableForPaint(n.fills[0], 'color', v)]; }
      });
    } else if (targets.length > 1) note('colours', n, `${hex(f.color)} matches several: ${targets.map(t => t.name).join(', ')}: pick one in colourChoice`);
  }
}

// text styles with Auto line height: fix the style once (it changes every layer using it, in the whole file)
for (const [id, e] of styleLH) {
  const st = e.style;
  if (skip.has(id)) continue;
  if (st.remote) { note('lineHeights', { id, name: st.name }, 'library style: change it in the library file'); continue; }
  const v = e.measured ?? guideLH(e.size);
  add('lineHeights', { id, name: st.name }, `text style "${st.name}": line height Auto → ${lhText(v)} (used ${e.uses}× here, and anywhere else in the file that uses it)${e.measured ? ', same look as now' : ', guide value: text using it will change height'}`, async () => {
    await figma.loadFontAsync(st.fontName);
    st.lineHeight = v;
  });
}

const counts = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length]));
const listOf = () => Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.slice(0, OPTS.maxList).map(({ run, ...x }) => x)]));
if (MODE !== 'apply') return { mode: 'plan', root: { id: root.id, name: root.name }, counts, plan: listOf(), leftAlone };

// ---------- apply ----------
if (OPTS.expect) {
  const diff = Object.keys({ ...counts, ...OPTS.expect }).filter(k => (counts[k] || 0) !== (OPTS.expect[k] || 0));
  if (diff.length) return { mode: 'apply', changed: 0, error: 'The file changed since the plan. Nothing was changed: run the plan again and show it.', counts, expected: OPTS.expect };
}
// plugins can't save versions, so the designer saves one first and the fixes can be rolled back
if (!OPTS.versionSaved) return { mode: 'apply', changed: 0, error: 'Nothing was changed: ask the designer to save a version first (File → Save to version history), then run with versionSaved: true.' };

const done = {}, failed = [];
let changed = 0, remaining = 0;
// styles first, so line heights and names land on the final text
for (const fix of ['textStyles', 'colours', 'lineHeights', 'roundPixels', 'names', 'hiddenLayers']) {
  for (const item of plan[fix] || []) {
    if (changed >= OPTS.maxChanges) { remaining++; continue; }
    try { await item.run(); changed++; done[fix] = (done[fix] || 0) + 1; }
    catch (e) { failed.push({ fix, id: item.id, name: item.name, error: String(e.message || e).slice(0, 120) }); }
  }
}
return { mode: 'apply', changed, done, failed, remaining, leftAlone };
