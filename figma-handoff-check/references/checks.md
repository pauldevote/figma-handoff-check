# What each check means

Each key below is something `scripts/audit.js` can return under `issues`. For each one there's what it
means in a designer's words, why the build goes wrong, how to fix it in Figma, and which section of the
Handoff Guide covers it. Use these words in the report rather than the key names.

Severity:
- **Fix before handoff**: the build will come out different from the design.
- **Should fix**: the build will probably be right, but someone has to guess, and guesses drift.
- **Tidy-up**: doesn't change the build. It makes the file quicker to read and hand over.

---

## Fix before handoff

### siblingsAlmostSameWidth / almostSameSize
**Means:** layers that should be the same size aren't. They're 1–4px apart, e.g. rows in one column at
493 / 490 / 489 / 488, or three cards at 68 / 67 / 63.
**Why:** the builder copies the numbers exactly, so the site ends up with three sizes. Nobody can tell
which one was meant.
**Fix:** give the parent auto layout and set the children to *Fill container*, or make them instances of
one component. Then every copy is the same size by rule, not by eye.
**Guide:** Frames and widths · Lists and repeated items.
**Check before reporting:** a small difference can be deliberate, like an image that's meant to be
narrower than the text. If the screenshot shows clearly different sizes, leave it out.

### clippedContent
**Means:** a frame is shorter or narrower than what's inside it, and *Clip content* hides the rest, e.g.
a frame 1088 tall holding 1428px of content.
**Why:** the builder reads the frame's size and the content's size and gets two different answers. The
hidden part may also be missing from the build altogether.
**Fix:** let the frame hug its content (auto layout, *Hug*), or delete what's hidden if it's not meant to
be there.
**Guide:** Common problems · Frames and widths.

### spillsOutside
**Means:** a layer sticks out past the edge of its frame, and *Clip content* is off.
**Why:** the browser either clips it or makes the page scroll sideways. Either way it won't look like
the design.
**Fix:** resize the frame, or move the layer inside it. If it's meant to overlap the edge (a badge on a
card corner), say so in a note.
**Guide:** Frames and widths.

### overlaps
**Means:** two layers sit on top of each other inside a frame with no auto layout.
**Why:** unless it's deliberate, the build either stacks them (and the layout grows) or overlaps them
too (and text becomes unreadable).
**Fix:** put them in auto layout so they stack with a set gap. If the overlap is deliberate (text over a
photo, a badge on an image), keep it and leave a note.
**Guide:** Common problems · Spacing and auto layout.
**Check before reporting:** look at the screenshot. A text block on top of a background image, or an
"Add" button on a product thumbnail, is a design choice, not a problem. Only report overlaps that look
accidental: text on text, a row on a row, an item poking into its neighbour.

### weightNotOnSite (only when the website's fonts were given)
**Means:** text uses a font weight the website doesn't load, e.g. Demi or Light when the site only has
Regular and Bold.
**Why:** the browser swaps in the closest weight it has, so the text comes out heavier or lighter, and
often wider or narrower too, which changes wrapping.
**Fix:** change the *text style* to a weight the site loads (the `textStyles` table shows which styles cause it), and every layer updates at once. Or ask the developer to add that weight first.
**Guide:** Text styles · Lessons from a real build.

### lineHeightAuto
**Means:** text with line height set to *Auto*.
**Why:** Auto means something different in every font and browser, so line spacing and box heights won't
match.
**Fix:** set a real value in the text style: about 110–120% for headings, 140–160% for body text.
**Guide:** Text styles.

### textNoStyle
**Means:** text that isn't using a text style; its font, size and spacing were set by hand.
**Why:** the builder can't tell whether it's a new style or a mistake, so near-identical text drifts
apart across pages.
**Fix:** apply the matching text style. If none fits, add one to the type scale.
**Guide:** Text styles.

### noAutoLayout (page and section frames especially)
**Means:** a frame with several layers placed by hand rather than stacked with auto layout.
**Why:** the gaps between things aren't set anywhere, so the builder has to measure them, and they
come out uneven. Nothing says what happens when text gets longer.
**Fix:** select the layers and add auto layout (Shift+A), then set the gap and padding.
**Guide:** Spacing and auto layout · Build the page in sections.
**Note:** small icon frames without auto layout are fine. Only report frames that hold content (text,
cards, rows, sections).

### sections (page structure)
**Means:** what's directly inside the page frame. The audit reports how many children it has, which
ones aren't full page width, how many aren't named `Section / …`, and whether the page frame uses auto
layout.
**Why:** if the page isn't split into full-width section frames, it can't be built and checked one
section at a time, and the gaps between sections aren't set anywhere.
**Fix:** wrap each band in a full-width frame named `Section / Hero`, `Section / Product grid` and so on,
and stack them with auto layout in the page frame. Loose bits like a breadcrumb go inside a section.
**Guide:** Build the page in sections.
**Note:** only report this when the audited frame is a whole page (about 1440 / 1280 / 390 wide). For a
single component or section it doesn't apply.

---

## Should fix

### fractionalPixels
**Means:** boxes at half or quarter pixels, e.g. 362.25 × 349.9, or a section 1280.06 wide.
**Why:** browsers round these differently, which gives 1px gaps, blurry edges and widths that don't
add up.
**Fix:** round to whole pixels. Usually it comes from resizing a group with *Scale*, or from an
imported image.
**Guide:** Frames and widths.
**Note:** a section width like 1280.06 is worth calling out on its own, because it breaks the alignment of everything inside it.

### groupsAsLayout
**Means:** groups (Ctrl+G) used to hold rows, cards or blocks.
**Why:** a group has no gap, padding or resize rules, so its size is just wherever its layers happen to
be.
**Fix:** turn layout groups into frames with auto layout (*Frame selection*, then Shift+A). Groups are
fine for icon and logo artwork.
**Guide:** Spacing and auto layout · Common problems (layers panel).

### fixedSizeTextBox
**Means:** a text box set to *Fixed size*, so its height doesn't follow the text.
**Why:** if the text is longer on the site (and real content usually is), it overflows or gets cut off.
The box height also gives the builder a false number.
**Fix:** set the text to *Auto height* (or *Auto width* for one-line labels).
**Guide:** Text styles · Images and real content.

### offScaleSpacing
**Means:** gaps or padding that aren't on the spacing scale, e.g. 5, 7, 10, 15, 17 when the scale goes
up in 4s (4, 8, 12, 16, 24…).
**Why:** odd values are usually nudges by eye. The site ends up with many near-identical gaps instead of
a few deliberate ones.
**Fix:** snap each gap to the nearest scale value. If 10 really is the system, say so and the audit can
be run with that step.
**Guide:** Spacing and auto layout.
**Note:** the scale step is an assumption (4 by default). If the design system uses 5s, re-run with
`spacingStep: 5` before reporting this.

### repeatsNotComponents
**Means:** the same item drawn three or more times by hand (cards, menu buttons, rows) instead of using
instances of one component.
**Why:** hand copies drift: one gets a 1px nudge or a different padding, and the builder has to pick
one.
**Fix:** make one a component and swap the others for instances.
**Guide:** Lists and repeated items · Colours, components and states.

### tightHeadingLineHeight
**Means:** text 20px or larger with line height at or below 100% of the font size.
**Why:** if it wraps to two lines on a narrower screen, the lines touch or overlap.
**Fix:** 110–120% for headings. For a one-line label (a price, say) it can be fine; just make sure it
never wraps.
**Guide:** Text styles · Lessons from a real build.

### fakeList
**Means:** a list typed into one text box with •, - or 1. at the start of each line.
**Why:** the builder can't tell the bullet spacing, indent or wrap rule. It also may not be built as a
real list, which matters for screen readers.
**Fix:** use Figma's list formatting (bulleted or numbered), or build each item as a row with an icon
and text in auto layout.
**Guide:** Lists and repeated items.

### typedInCaps
**Means:** text typed in capitals instead of written normally with the style set to *Uppercase*.
**Why:** if the client edits that text in the CMS, it comes out however they type it. The style should
own the case.
**Fix:** retype in normal case and set *Case: Uppercase* in the text style.
**Guide:** Text styles · Content the client edits.

### looseColours (inventory)
**Means:** colours set by hex directly rather than from a colour style or variable. The audit reports how
many layers and which hex values.
**Why:** a hex that's one digit off a brand colour becomes a second colour on the site.
**Fix:** apply the matching colour style. Near-duplicate hex values (e.g. #3C3C3B and #3C3C3C) should
become one.
**Guide:** Colours, components and states.

### absoluteInAutoLayout / negativeGap
**Means:** a layer set to *Ignore auto layout* (absolute), or an auto layout gap below zero.
**Why:** both are positioned overlaps that need explaining. Without a note the builder guesses.
**Fix:** keep them if deliberate, but add a note saying what it is (a badge, a sticky button) and how it
should behave.
**Guide:** Behaviour a static frame can't show.

---

## Tidy-up

### defaultNames
**Means:** layers still called Frame 45, Group 488, Rectangle 59.
**Why:** the builder can't tell what a layer is from its name, so they have to click into every one.
**Fix:** name the layers that matter (sections, cards, rows, buttons) after what they are. Icon insides
can stay as they are.
**Guide:** Common problems (layers panel).

### hiddenLayers
**Means:** hidden layers left inside the frame.
**Why:** they're unclear: are they a state, an alternative, or junk? Hidden layers also inflate the
frame's size in some exports.
**Fix:** delete them, or move states into proper component variants.
**Guide:** Colours, components and states.

---

## Inventory (not problems on their own)

- **fonts**: every family and weight used. Compare it with what the website loads, and list any stray font
  (e.g. one Poppins layer in a DIN file).
- **fontSizes / lineHeights**: a tidy type scale has roughly 6–10 sizes. Twenty-plus sizes means text was
  set by hand.
- **spacingValues**: the gaps and paddings in use, most common first. A short list is a healthy sign.
