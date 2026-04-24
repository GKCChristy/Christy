# /public/icons — Logo Placeholder Folder

When your Cura Community Connections logo is ready, generate and drop
these PNG files into this folder. All references in manifest.json and
layout.jsx are already wired up and waiting.

## Files needed

| File                  | Size     | Used for                              |
|-----------------------|----------|---------------------------------------|
| icon-48x48.png        | 48x48    | Browser favicon (small)               |
| icon-72x72.png        | 72x72    | Android home screen (low density)     |
| icon-96x96.png        | 96x96    | Browser favicon (large) + shortcut    |
| icon-128x128.png      | 128x128  | Chrome Web Store                      |
| icon-144x144.png      | 144x144  | Windows tile                          |
| icon-152x152.png      | 152x152  | Apple touch icon (iPad)               |
| icon-192x192.png      | 192x192  | Android home screen (required)        |
| icon-384x384.png      | 384x384  | Android splash screen                 |
| icon-512x512.png      | 512x512  | Android home screen (high res)        |

## How to generate

1. Start with a high-resolution square PNG of your logo (1024x1024 minimum)
2. Use https://realfavicongenerator.net or https://favicon.io to generate all sizes
3. Download the ZIP, extract, and rename files to match the names above
4. Drop into this /public/icons folder
5. Redeploy to Vercel — done

## Brand colors for reference

- Burgundy:   #7B2442  (theme color, background color in manifest)
- Royal Blue: #1A4DBF  (accent)
