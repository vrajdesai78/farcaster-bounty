# Generate the concept diagrams

The guide uses static SVGs generated with [Mermaid](https://mermaid.js.org/). No diagram library runs in a visitor’s browser. This tool is optional for editing the guide; it is not part of node or client setup.

Edit the `.mmd` sources in `site/diagrams/`. Each topic has a desktop diagram and a vertical mobile version. Keep the numbered steps, accessible title/description and private-key boundaries consistent.

From the repository root, with Node.js 22.12+ and the client’s development dependencies already installed:

```sh
npm ci --prefix scripts/diagrams --ignore-scripts
DIAGRAM_BROWSER_CHANNEL=chrome node scripts/diagrams/render.mjs
```

This uses installed Google Chrome through the client’s Playwright dependency. To use an already-installed Playwright Chromium instead, omit `DIAGRAM_BROWSER_CHANNEL`. It starts no cloud resources and needs no account, API key or diagram service.

Outputs go to `site/assets/diagrams/`. The generator uses Mermaid’s strict security mode, SVG text labels, embedded licensed Instrument Sans and no remote image resources. It rejects script elements, HTML foreign objects and HTTP resource references. Commit the sources and generated SVGs together.

Preview with `python3 scripts/serve-site.py`. Check every topic on desktop and a phone-sized viewport, including full-size links, text alternatives, tab keys and arrows. The page itself needs no Node.js install or build step on Vercel.
