---
name: figma-handoff-check
description: Audit a Figma design against the Figma Handoff Guide (Designing for Pixel-Accurate Builds) before it goes to a developer or to Claude for building, and give the designer a plain-language list of what to fix, with links to each layer. It checks near-equal widths, clipping and overlaps, auto layout, half-pixel sizes, text styles and line heights, font weights the site doesn't load, spacing, components, colours and section frames, and can fix the safe ones after the designer approves. Use this whenever a designer or developer shares a Figma link and asks whether it's ready for handoff or ready to build, asks to check, audit, review, QA or lint a Figma file or frame, asks "is my design set up right", or wants to know why a build won't match their Figma. Also use it before building from an unchecked Figma frame, and when the designer asks Claude to fix what the check found ("fix it for me", "tidy up my file").
compatibility: Needs the Figma connector (MCP) with use_figma, get_screenshot and create_session. The check is read-only. Fix mode edits the file only after the designer approves the exact list, and needs edit access.
---

# Figma handoff check

This skill checks a designer's Figma frame against Devote's **Figma Handoff Guide: Designing for
Pixel-Accurate Builds** (https://claude.ai/artifact/Q6U6UsXMoJebeRmiQurtLw). It tells them, in their own
language, what will make the build come out different from the design, and how to fix it in Figma.

The person reading the report is a designer, not a developer. Say "frame", "auto layout", "text style",
"Fill container", the words they see in Figma. Don't say JSON, node, DOM, CSS or script. The tone is a
helpful colleague checking a file before it goes out, not a grader.

The check only reads. Change the designer's file only in fix mode (section 6), only the safe fixes it
lists, and only after the designer has seen exactly what will change and said yes.

## 1. Get the frame

Ask for a Figma link to the frame to check, ideally one page at one width (e.g. *Product page / Desktop
1440*), plus its mobile frame if there is one. From the link:

- `figma.com/design/<fileKey>/<name>?node-id=1282-5640` → fileKey, node id `1282:5640` (swap `-` for `:`)
- `figma.com/design/<fileKey>/branch/<branchKey>/…` → use the branchKey as the file key
- no `node-id` → call `get_metadata` with no nodeId to list the pages, then ask which frame, or audit
  each top-level frame on the page one at a time. A whole page with many frames in one run is too slow
  and the report becomes unreadable.

Ask one question, if nobody has said already: **which font weights does the website load?** (The
developer knows; e.g. "DIN 2014 Regular and Bold only".) If they don't know, skip the weight check and
list the weights used under "confirm with your developer". Wrong weights were one of the costliest
problems on a real build, so it's worth the question.

## 2. Run the audit

1. Load the Figma `figma-use` guidance before the first `use_figma` call: the `/figma-use` skill, or the
   `skill://figma/figma-use/SKILL.md` resource from the Figma MCP server. If neither can be loaded, carry
   on. The audit script already follows its rules (read-only, top-level `await` and `return`, one page
   switch).
2. `create_session` with the file key and a short description ("Read-only handoff audit of …").
3. Read `scripts/audit.js`. Only the `ROOT_ID` line and the `OPTS` block change between runs; paste
   the rest exactly as it is. Set `ROOT_ID` to the node id, and fill in `OPTS`:
   - `allowedFonts`: family and style the site loads, exactly as Figma writes them, e.g.
     `['DIN 2014 Regular', 'DIN 2014 Bold', 'Exo ExtraBold']` (note Figma's spacing: "Extra Bold" vs
     "ExtraBold" differ by font), or `null`.
   - `openInstances`: leave `false`. The audit stops at component instances, because their insides
     belong to the main component.
   - `spacingStep`: 4 unless the file clearly works in another step (e.g. 5 or 8).
   - `nearPx`: keep at 4. `maxExamples`: 12, or lower it (5–6) on very large frames.
4. Pass the whole script as `code` to `use_figma` (with `skillNames: "figma-use"`, or
   `"resource:figma-use"` if it was loaded from the resource). It returns:
   - `counts`: how many of each problem;
   - `issues`: a few examples of each, with layer id, name and path;
   - `sections`: the page structure;
   - `inventory`: fonts, sizes, line heights, colours and spacing in use;
   - `textStyles`: each text style used, with its font, size, line height and how often it's used.
     When a style has a weight the site doesn't load, say "fix the style", not "fix 130 layers";
   - `skippedInstances`: large instances (product columns, headers, footers) that weren't checked
     inside. Run the audit again with each one's id as `ROOT_ID`, at least for the ones that are new in
     this design and not a shared header or footer, and merge the results. On a real product page the
     product info column was an instance, and its worst problems only showed up in that second run.
5. Screenshot what you're judging (`get_screenshot`). A tall page shrinks to an unreadable strip, so
   for anything taller than about 3000px, screenshot each top-level section instead. For the top few
   problems, a screenshot of that layer helps you judge whether it's real.

If the call times out or the result is cut off, run it on each direct child of the frame (each
section) instead and merge the counts.

## 3. Judge before reporting

The audit finds candidates; you decide what's real. `references/checks.md` explains every check: what
it means, why it breaks the build, how to fix it, which guide section covers it, and which ones need a
look before you report them. Read it before writing the report. The common false alarms:

- **Overlaps** that are design choices: text over a hero image, a badge or "Add" button on a
  thumbnail, a sticky bar. Look at the screenshot. Only report overlaps that look accidental.
- **Almost-same widths** where one is meant to be narrower.
- **No auto layout** on tiny icon frames. Only content frames matter.
- **Off-scale spacing** when the system simply uses another step. Re-run with that step.
- **Sections** on something that isn't a whole page. Loose text (a breadcrumb) directly on the page
  shows up as several "not full width" children; report it once, as "breadcrumb loose on the page".
- **Clipped carousels**: a review or image slider that runs past the frame on purpose. Move it to
  "Not checked automatically" and ask how it scrolls.

Layers inside an instance (ids that start with `I`, like `I1645:1458;1645:453`) belong to the
component. Tell the designer to fix them in the main component, which fixes every copy at once.

## 4. Write the report

Write it so the designer can work down it in Figma. Use this structure:

```
# Handoff check: <frame name>

<One or two sentences: overall, how ready it is and the 2–3 things that matter most.>

| | Problems |
| --- | --- |
| Fix before handoff | n |
| Should fix | n |
| Tidy-up | n |

## Fix before handoff
### <Problem in plain words>, <count> places
What's wrong, in one or two sentences, with real numbers from this file (e.g. "the rows in the
product info column are 493, 490, 489 and 488 wide").
Why it matters for the build: one sentence.
How to fix it: the Figma steps.
Where: up to ~5 layers as links, e.g. [Group 485](https://www.figma.com/design/<fileKey>?node-id=1645-453)
(use `-` in the link, not `:`)
Guide: <section name>

## Should fix
… same shape …

## Tidy-up
… shorter: one line each …

## What's in use
Fonts and weights · type sizes · spacing values · loose colours. Flag anything odd (a stray font, 20+
font sizes, a colour one digit off another).

## Not checked automatically
Things the audit can't see, for the designer to confirm themselves: hover, focus and active states,
behaviour notes (what's sticky, what opens, what scrolls), the mobile frame (if not audited), real
content lengths, which text the client edits, and a link to the exact frame for each section.
```

The counts in that table are problem types (headings below), not layers.

Group repeated findings: "the same issue in 31 places, mostly in the product info column" is better
than 31 lines. Lead with what will change the build most. Always use real numbers from the file,
because "1088 tall but holds 1428px of content" gets fixed, and "some frames clip" doesn't.

When the file is in good shape, say so plainly, list what's left, and keep the report short.

If any problems are ones fix mode can do (half-pixel sizes, Auto line heights, text that exactly
matches a style, hex colours that exactly match a colour style, default layer names, hidden layers),
end the report with one line offering it, e.g. "I can fix the 14 half-pixel sizes, 9 line heights and
11 layer names for you. Want me to show you exactly what I'd change?"

If the person asked in chat, give the report in chat. If they want something to share with the
design team, offer to publish it as a document.

## 5. Re-check

When the designer has fixed things, run the same audit on the same frame and show before and after
counts for each problem, so they can see it's done.

## 6. Fix mode

When the designer asks you to fix things, read `references/fix-mode.md` first. In short:

1. Run `scripts/fix.js` with `MODE = 'plan'`. It only reads, and lists every change it would make.
2. Show that list in plain words, flag anything that changes how the design looks, and ask the
   designer to save a version (*File → Save to version history*) so they can roll it all back.
3. Once they say yes, run it with `MODE = 'apply'`, `versionSaved: true` and `expect` set to the
   plan's counts (it refuses if the file changed in between).
4. Re-run the audit and show before and after.

Fix mode only does the safe, mechanical fixes. Almost-equal widths, clipping, overlaps, auto layout,
sections, font weights and the rest need the designer's decision. Say so, and point them at the
report.
