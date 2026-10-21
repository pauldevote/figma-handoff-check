# Figma handoff check

A Claude skill that checks a Figma frame before it goes to a developer, so the build can match the design.
Paste a Figma link into Claude and ask "Is this ready for handoff?". You get a plain-language list of what
to fix, with a link to each layer. The check only reads your file. Fix mode can make the safe fixes for you,
but only after you've seen exactly what it will change and said yes.

It checks for:
- layers that should match but are 1–4px apart, and half-pixel sizes
- content hidden by clipping, layers sticking out of their frame, accidental overlaps
- frames with no auto layout, and groups used as layout
- text without a text style, Auto line height, font weights the website doesn't load, fixed-size text boxes
- spacing off the scale, repeated items that aren't components, colours not from a style
- whether the page is split into full-width `Section / Name` frames

## Install (Claude web or desktop app)

1. Download **figma-handoff-check.zip** from the [latest release](../../releases/latest).
2. In Claude, open **Settings → Capabilities → Skills** and upload the zip.
3. In **Settings → Connectors**, connect **Figma**.

## Use

1. In Figma, right-click the page frame and choose **Copy link to selection**.
2. Paste the link into a new Claude chat and ask: *"Is this ready for handoff?"*
3. Fix what it lists, then paste the link again and ask it to *"check again"*.

Check desktop and mobile frames separately.

## Fix mode

After a check, ask Claude to *"fix the safe ones"*. It can:
- round half-pixel sizes
- replace Auto line heights (one-line text keeps exactly the height it has now)
- apply a text style or colour style where the text or colour matches it exactly
- rename layers still called Frame 45 or Rectangle 59
- delete hidden layers (not the ones a component property shows)

Claude shows you the full list first and asks you to save a version (**File → Save to version history**),
so you can undo it all in one step. You need edit access to the file. It never touches widths, clipping,
overlaps, auto layout, sections or font weights. Those need your decision, so they stay in the report.

## Changes

- **v1.1**: fix mode.
- **v1.0**: the check.
