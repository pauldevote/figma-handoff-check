# Fix mode

Fix mode lets Claude make the mechanical fixes for the designer, so they can spend their time on the
ones that need a decision. It runs `scripts/fix.js` twice: once to plan (read-only), once to apply
what the designer agreed to.

## What it fixes, and what it never touches

| Fix (`OPTS.fixes` key) | What it does | What it leaves alone |
| --- | --- | --- |
| `roundPixels` | Rounds half-pixel x, y, width and height on frames, rectangles, ellipses, components and instances (362.25 → 362). | Sizes set by *Fill* or *Hug* (it lists them: the cause is inside or around them); positions inside auto layout; groups and vectors. |
| `lineHeights` | Replaces *Auto* line height with a real value. One-line text keeps exactly the height it has now (in px). Multi-line text gets the guide's value (120% headings, 150% body), which changes its height, so the plan says so. Text styles with Auto are fixed in the style, once. | Library styles (they're fixed in the library file). |
| `textStyles` | Applies a text style to hand-set text when exactly one style has the same font, weight, size, line height, letter spacing and case. Nothing about the text changes except that it now uses the style. | Text that matches no style or several (it lists the several). |
| `colours` | Links a loose hex fill to the colour style or variable with exactly that colour and opacity. | Near matches (#3C3C3B vs #3C3C3C: that's the designer's call), colours that match several styles (unless `colourChoice` picks one), layers with more than one fill, strokes. |
| `names` | Renames default-named frames, groups, rectangles and instances: an instance gets its component's name, an image rectangle "Image", a 1–2px rectangle "Divider", a full-size one "Background", a frame its first text ("Add to cart"). | Icon insides (parent 64px or smaller). Layers it can't name are listed so you can suggest a name. |
| `hiddenLayers` | Deletes hidden layers. | Layers shown by a component property (those are states), layers inside instances. |

Everything skips locked layers, layers inside instances (ids starting with `I`: tell the designer to fix
them in the main component), and anything in `skipIds`.

Never fixes, even when asked to "fix everything": almost-equal widths, clipped or spilling content,
overlaps, missing auto layout, groups as layout, section frames, font weights the site doesn't load,
fixed-size text boxes, off-scale spacing, repeated items, fake lists, text typed in caps. Each needs a
decision only the designer can make (which width is right, should the frame grow or the content go,
which weight replaces Demi). Say that plainly. If the designer gives the decision ("make all four
rows Fill container", "the 488 one is right"), you can make that one change as a one-off: say exactly
which layers you'll change, wait for a yes, use `use_figma`, then re-run the audit on that frame.

## The flow

1. **Check access.** Fix mode needs edit access to the file. If `use_figma` reports the file is
   view-only, stop and say so.
2. **Plan.** Copy `scripts/fix.js`, set `ROOT_ID` (the same frame as the audit), keep `MODE = 'plan'`,
   set `OPTS.fixes` to what the designer asked for (all six if they said "fix the safe ones"). It
   returns `counts`, `plan` (each change with the layer and the before → after) and `leftAlone` (what
   it skipped, and why).
3. **Fill the gaps.** For `names`, read the suggestions: a frame named after its first text is
   sometimes wrong ("$129.00" is a price row, not a name). Put better names in `renames` and re-run the
   plan. For colours that match several styles, ask which one, or leave them.
4. **Show the plan.** In plain words, grouped by fix, with counts, a few examples each, and links to
   the layers (`https://www.figma.com/design/<fileKey>?node-id=1645-453`). Call out anything that
   changes how the design looks (multi-line text getting the guide line height, a style change that
   reaches the rest of the file). Then ask two things:
   - which fixes to go ahead with (all, some, or "all except these layers": those ids go in `skipIds`);
   - to save a version first: *File → Save to version history* (⌥⌘S on Mac, Ctrl+Alt+S on Windows),
     named e.g. "Before handoff fixes". That's how they undo it all at once. Plugins can't save
     versions, so the designer has to do this; the script won't apply without `versionSaved: true`.
5. **Apply.** Same script, `MODE = 'apply'`, the same `OPTS` as the final plan, `versionSaved: true`,
   and `expect` set to that plan's `counts`. If the file changed since the plan, the counts differ and
   it changes nothing: plan again and show the new plan. If it returns `remaining` above 0, run apply
   again (with a fresh plan's counts as `expect`) until it's 0. Report `failed` items by name.
6. **Re-check.** Run the audit again on the same frame and show before and after counts for every
   problem type, including the ones fix mode doesn't touch, so the designer sees what's left for them.

## Example plan message

> Here's what I can fix for you in **Product page / Desktop 1440**. Nothing has changed yet.
>
> - **Half-pixel sizes (14 layers):** e.g. the gallery frame 362.25 × 349.9 → 362 × 350.
> - **Auto line heights (9):** 8 one-line labels keep exactly the height they have now; the
>   description paragraph goes to 150%, which makes it 10px taller.
> - **Text styles (6):** hand-set text that exactly matches *Body/16* gets the style.
> - **Layer names (11):** e.g. Frame 488 → "Add to cart", Rectangle 59 → "Image".
> - **Hidden layers (3):** "Old banner" and 2 more get deleted.
>
> Not touched: the 493 / 490 / 489 / 488 rows, the clipped gallery and the Demi weights. Those need
> your call (see the report).
>
> Before I go ahead, save a version (File → Save to version history) so you can roll all of this back
> in one step. Then tell me which of these to do: all, or all except some.
