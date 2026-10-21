# Figma handoff check

A Claude skill that checks a Figma frame before it goes to a developer, so the build can match the design.
Paste a Figma link into Claude and ask "Is this ready for handoff?". You get a plain-language list of what
to fix, with a link to each layer. It only reads your file. It never changes anything.

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
