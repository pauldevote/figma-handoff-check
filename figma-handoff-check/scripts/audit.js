// Figma handoff audit — READ-ONLY. Paste into use_figma after replacing the two
// values below. It never changes the file: no setters, no create/delete calls.
const ROOT_ID = '__ROOT_ID__';          // frame, section or page id, e.g. '1282:5640' or '0:1'
const OPTS = {
  allowedFonts: null,                   // family + style the website loads, e.g. ['DIN 2014 Regular', 'DIN 2014 Bold', 'Exo ExtraBold']; null = don't check
  openInstances: false,                 // true = also check inside every component instance (bigger, slower result)
  spacingStep: 4,                       // spacing values should be multiples of this
  nearPx: 4,                            // sizes this close (but not equal) count as "almost the same"
  maxExamples: 12,                      // examples returned per check
};

// ---------- setup ----------
let root = await figma.getNodeByIdAsync(ROOT_ID);
if (!root) return { error: `No node with id ${ROOT_ID}. Check the link's node-id (use ':' not '-').` };
let page = root;
while (page && page.type !== 'PAGE') page = page.parent;
if (page) await figma.setCurrentPageAsync(page);
root = await figma.getNodeByIdAsync(ROOT_ID);

const issues = {};
const add = (key, node, detail) => {
  (issues[key] = issues[key] || { count: 0, examples: [] });
  issues[key].count++;
  if (issues[key].examples.length < OPTS.maxExamples)
    issues[key].examples.push({ id: node.id, name: cut(node.name), path: pathOf(node), ...detail });
};
const pathOf = (n) => {
  const parts = [];
  let p = n.parent;
  while (p && p !== root.parent && p.type !== 'PAGE') { parts.unshift(p.name); p = p.parent; }
  return parts.slice(-3).join(' › ');
};
const cut = (t, k = 50) => (t.length > k ? t.slice(0, k) + '…' : t);
const r1 = (v) => Math.round(v * 100) / 100;
const hex = (c) => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const isMixed = (v) => typeof v === 'symbol';
const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Image|Union|Subtract|Intersect|Exclude|Component|Instance|Text|Section|Container|Layer|Mask group)( \d+)?$/i;

// Walk the tree; stop at instances (their insides belong to the main component),
// unless the audit root itself is an instance. Hidden layers are listed but not entered.
const opens = (n) => n === root || n.type !== 'INSTANCE' || OPTS.openInstances;
// big instances that were not opened, so the agent can audit them on their own
const skippedInstances = [];
const own = [];
(function walk(n) {
  own.push(n);
  if (n !== root && n.visible === false) return;
  if (n.type === 'INSTANCE' && !opens(n) && n.width >= 200 && n.height >= 150 && skippedInstances.length < 25)
    skippedInstances.push({ id: n.id, name: cut(n.name), w: r1(n.width), h: r1(n.height) });
  if ('children' in n && opens(n)) for (const c of n.children) walk(c);
})(root);

const styleUse = {};
const inv = { fonts: {}, fontSizes: {}, lineHeights: {}, looseColours: {}, styledColours: 0, spacing: {} };

// ---------- checks ----------
for (const n of own) {
  // hidden leftovers
  if (n !== root && n.visible === false) { add('hiddenLayers', n, {}); continue; }

  // default layer names (only for containers and images — loose vectors are noise)
  if (n !== root && ['FRAME', 'GROUP', 'RECTANGLE', 'INSTANCE', 'COMPONENT'].includes(n.type) && DEFAULT_NAME.test(n.name.trim()))
    add('defaultNames', n, { type: n.type });

  // groups used as layout containers
  if (n.type === 'GROUP' && n.children.length > 1) add('groupsAsLayout', n, { children: n.children.length });

  // fractional sizes / positions
  if ('width' in n && n !== root) {
    const vals = { x: n.x, y: n.y, w: n.width, h: n.height };
    const frac = Object.entries(vals).filter(([, v]) => Math.abs(v - Math.round(v)) > 0.01);
    // groups and vectors take their size from their artwork, so only boxes count
    if (frac.length && ['FRAME', 'RECTANGLE', 'INSTANCE', 'COMPONENT', 'ELLIPSE'].includes(n.type))
      add('fractionalPixels', n, Object.fromEntries(frac.map(([k, v]) => [k, r1(v)])));
  }

  // frames with 2+ children but no auto layout
  if ((n.type === 'FRAME' || n.type === 'COMPONENT' || n === root) && 'layoutMode' in n && n.layoutMode === 'NONE' && n.children.filter(c => c.visible).length >= 2)
    add('noAutoLayout', n, { children: n.children.length, w: r1(n.width), h: r1(n.height) });

  // auto layout spacing values
  if ('layoutMode' in n && n.layoutMode && n.layoutMode !== 'NONE') {
    const sp = { gap: n.itemSpacing, top: n.paddingTop, right: n.paddingRight, bottom: n.paddingBottom, left: n.paddingLeft };
    for (const [k, v] of Object.entries(sp)) {
      if (v == null || isMixed(v)) continue;
      inv.spacing[v] = (inv.spacing[v] || 0) + 1;
      if (v > 2 && Math.abs(v % OPTS.spacingStep) > 0.01) add('offScaleSpacing', n, { [k]: r1(v) });
    }
    if (n.itemSpacing < 0) add('negativeGap', n, { gap: n.itemSpacing });
    for (const c of n.children) if (c.layoutPositioning === 'ABSOLUTE' && c.visible) add('absoluteInAutoLayout', c, {});
  }

  // children overflowing / clipped by their frame
  if ('children' in n && opens(n) && n.absoluteBoundingBox && n.type !== 'GROUP') {
    const b = n.absoluteBoundingBox;
    for (const c of n.children) {
      if (!c.visible || !c.absoluteBoundingBox || c.layoutPositioning === 'ABSOLUTE') continue;
      const cb = c.absoluteBoundingBox;
      const over = Math.max(b.x - cb.x, b.y - cb.y, (cb.x + cb.width) - (b.x + b.width), (cb.y + cb.height) - (b.y + b.height));
      if (over > 1) add(n.clipsContent ? 'clippedContent' : 'spillsOutside', c, { frame: n.name, overBy: Math.round(over) });
    }
  }

  // overlapping siblings in frames without auto layout
  if ('children' in n && opens(n) && (n.layoutMode === 'NONE' || n.type === 'GROUP')) {
    const kids = n.children.filter(c => c.visible && c.absoluteBoundingBox);
    const pb = n.absoluteBoundingBox;
    const isBackground = (c) => pb && c.absoluteBoundingBox.width * c.absoluteBoundingBox.height >= 0.85 * pb.width * pb.height;
    // icon and logo artwork is built from overlapping shapes on purpose
    const SHAPES = ['VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'LINE', 'STAR', 'POLYGON', 'RECTANGLE'];
    const isIcon = pb && pb.width <= 64 && pb.height <= 64;
    if (!isIcon && kids.length <= 60) for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i], z = kids[j];
      if (isBackground(a) || isBackground(z)) continue;
      if (SHAPES.includes(a.type) && SHAPES.includes(z.type) && a.type !== 'RECTANGLE') continue;
      const A = a.absoluteBoundingBox, Z = z.absoluteBoundingBox;
      const ix = Math.min(A.x + A.width, Z.x + Z.width) - Math.max(A.x, Z.x);
      const iy = Math.min(A.y + A.height, Z.y + Z.height) - Math.max(A.y, Z.y);
      if (ix > 2 && iy > 2) add('overlaps', a, { with: cut(z.name), withId: z.id, overlap: `${Math.round(ix)}×${Math.round(iy)}` });
    }
  }

  // colours not from a style or variable
  if ('fills' in n && !isMixed(n.fills) && n.type !== 'TEXT') {
    const solid = n.fills.filter(f => f.type === 'SOLID' && f.visible !== false);
    const bound = n.boundVariables && n.boundVariables.fills && n.boundVariables.fills.length;
    if (solid.length) {
      if (n.fillStyleId || bound) inv.styledColours++;
      else for (const f of solid) { const h = hex(f.color); inv.looseColours[h] = (inv.looseColours[h] || 0) + 1; }
    }
  }

  // text
  if (n.type === 'TEXT') {
    let segs = [];
    try { segs = n.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'textStyleId', 'fills', 'letterSpacing', 'textCase']); } catch (e) { segs = []; }
    for (const s of segs) {
      const font = `${s.fontName.family} ${s.fontName.style}`;
      inv.fonts[font] = (inv.fonts[font] || 0) + 1;
      inv.fontSizes[s.fontSize] = (inv.fontSizes[s.fontSize] || 0) + 1;
      const lh = s.lineHeight.unit === 'AUTO' ? 'Auto' : s.lineHeight.unit === 'PERCENT' ? `${r1(s.lineHeight.value)}%` : `${r1(s.lineHeight.value)}px`;
      inv.lineHeights[lh] = (inv.lineHeights[lh] || 0) + 1;
      if (!s.textStyleId) add('textNoStyle', n, { font, size: s.fontSize, lineHeight: lh, text: s.characters.slice(0, 40) });
      if (s.lineHeight.unit === 'AUTO') add('lineHeightAuto', n, { font, size: s.fontSize, text: s.characters.slice(0, 40) });
      const lhPx = s.lineHeight.unit === 'PIXELS' ? s.lineHeight.value : s.lineHeight.unit === 'PERCENT' ? s.lineHeight.value / 100 * s.fontSize : null;
      if (lhPx != null && lhPx <= s.fontSize + 0.01 && s.fontSize >= 20) add('tightHeadingLineHeight', n, { size: s.fontSize, lineHeight: lh, text: s.characters.slice(0, 40) });
      if (OPTS.allowedFonts && !OPTS.allowedFonts.includes(font)) add('weightNotOnSite', n, { font, text: s.characters.slice(0, 40) });
      if (s.textStyleId) { const t = (styleUse[s.textStyleId] = styleUse[s.textStyleId] || { font, size: s.fontSize, lineHeight: lh, uses: 0 }); t.uses++; }
      if (s.characters.trim() && s.characters.trim() === s.characters.trim().toUpperCase() && /[a-z]/i.test(s.characters) && s.textCase === 'ORIGINAL' && s.characters.trim().length > 3)
        add('typedInCaps', n, { text: s.characters.slice(0, 40) });
      const bound = n.boundVariables && n.boundVariables.fills;
      for (const f of s.fills) if (f.type === 'SOLID' && !n.fillStyleId && !bound) {
        const h = hex(f.color); inv.looseColours[h] = (inv.looseColours[h] || 0) + 1;
      }
    }
    if (n.textAutoResize === 'NONE') add('fixedSizeTextBox', n, { w: r1(n.width), h: r1(n.height), text: n.characters.slice(0, 40) });
    if (/^\s*([•\-–*·]|\d+[.)])\s/m.test(n.characters) && n.characters.includes('\n')) add('fakeList', n, { text: n.characters.slice(0, 60) });
  }
}

// near-identical sizes: same name (or same main component), sizes 1–nearPx apart
const groups = {};
for (const n of own) {
  if (n === root || n.visible === false || !['FRAME', 'INSTANCE', 'RECTANGLE', 'COMPONENT'].includes(n.type) || DEFAULT_NAME.test(n.name.trim())) continue;
  (groups[n.type + '|' + n.name] = groups[n.type + '|' + n.name] || []).push(n);
}
for (const [key, list] of Object.entries(groups)) {
  if (list.length < 2) continue;
  for (const dim of ['width', 'height']) {
    const vals = [...new Set(list.map(n => Math.round(n[dim] * 10) / 10))].sort((a, b) => a - b);
    if (vals.length > 1 && vals[vals.length - 1] - vals[0] <= OPTS.nearPx && vals[vals.length - 1] - vals[0] > 0.01) {
      // only flag if the shape doesn't legitimately stretch (FILL in auto layout gives equal sizes anyway)
      add('almostSameSize', list[0], { layer: key.split('|')[1], dimension: dim, values: vals, copies: list.length, ids: list.slice(0, 6).map(n => n.id) });
    }
  }
}

// siblings almost the same width (a column of rows at 493 / 490 / 489)
for (const n of own) {
  if (!('children' in n) || !opens(n) || n.visible === false) continue;
  const kids = n.children.filter(c => c.visible && c.width >= 40 && ['FRAME', 'GROUP', 'INSTANCE', 'RECTANGLE', 'TEXT'].includes(c.type)
    && !(c.type === 'TEXT' && c.textAutoResize === 'WIDTH_AND_HEIGHT'));
  const widths = [...new Set(kids.map(c => Math.round(c.width * 10) / 10))].sort((a, b) => a - b);
  for (let i = 1; i < widths.length; i++) {
    const d = widths[i] - widths[i - 1];
    if (d > 0.01 && d <= OPTS.nearPx) {
      const hit = kids.filter(c => [widths[i - 1], widths[i]].includes(Math.round(c.width * 10) / 10));
      add('siblingsAlmostSameWidth', n, { widths: [widths[i - 1], widths[i]], layers: hit.slice(0, 5).map(c => `${cut(c.name, 30)} (${Math.round(c.width * 10) / 10})`) });
    }
  }
}

// repeated items that aren't components: 3+ siblings with the same name, none an instance
for (const n of own) {
  if (!('children' in n) || !opens(n) || n.visible === false) continue;
  const byName = {};
  for (const c of n.children) if (c.visible && (c.type === 'FRAME' || c.type === 'GROUP')) (byName[c.name] = byName[c.name] || []).push(c);
  for (const [name, list] of Object.entries(byName)) if (list.length >= 3) add('repeatsNotComponents', list[0], { parent: n.name, copies: list.length, layer: name });
  // repeated look-alike siblings with different names (structure signature)
  const sig = (c) => c.type + ':' + ('children' in c ? c.children.map(k => k.type).join(',') : '');
  const bySig = {};
  for (const c of n.children) if (c.visible && (c.type === 'FRAME' || c.type === 'GROUP') && 'children' in c && c.children.length >= 2) (bySig[sig(c)] = bySig[sig(c)] || []).push(c);
  for (const list of Object.values(bySig)) if (list.length >= 3 && new Set(list.map(c => c.name)).size > 1) add('repeatsNotComponents', list[0], { parent: n.name, copies: list.length, layer: list.map(c => c.name).slice(0, 4).join(' / ') });
}

// sections: is the root a page frame split into full-width sections?
let sections = null;
if (['FRAME', 'SECTION', 'INSTANCE', 'COMPONENT'].includes(root.type) && 'children' in root) {
  const kids = root.children.filter(c => c.visible);
  sections = {
    rootWidth: r1(root.width),
    rootAutoLayout: root.layoutMode || 'NONE',
    children: kids.length,
    notFullWidth: kids.filter(c => Math.abs(c.width - root.width) > 1).slice(0, OPTS.maxExamples).map(c => ({ id: c.id, name: cut(c.name), w: r1(c.width) })),
    notNamedSection: kids.filter(c => !/^section\s*\//i.test(c.name)).length,
    names: kids.slice(0, 30).map(c => cut(c.name, 30)),
  };
}

// which text style gives which font: fixing a style fixes every layer that uses it
const textStyles = [];
for (const [id, t] of Object.entries(styleUse)) {
  let name = '(library style)';
  try { const st = await figma.getStyleByIdAsync(id); if (st) name = st.name; } catch (e) {}
  textStyles.push({ style: name, font: t.font, size: t.size, lineHeight: t.lineHeight, uses: t.uses,
    ...(OPTS.allowedFonts ? { fontOnSite: OPTS.allowedFonts.includes(t.font) } : {}) });
}
textStyles.sort((a, b) => b.uses - a.uses);

const top = (o, k = 15) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
return {
  page: page && page.name,
  root: { id: root.id, name: root.name, type: root.type, w: root.width && r1(root.width), h: root.height && r1(root.height) },
  layersChecked: own.length,
  counts: Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.count])),
  issues,
  sections,
  skippedInstances,
  textStyles: textStyles.slice(0, 30),
  inventory: {
    fonts: top(inv.fonts), fontSizes: top(inv.fontSizes, 30), lineHeights: top(inv.lineHeights, 20),
    looseColours: top(inv.looseColours, 25), looseColourCount: Object.keys(inv.looseColours).length, styledColourLayers: inv.styledColours,
    spacingValues: top(inv.spacing, 30),
  },
};
