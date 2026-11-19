# Arena promo video

- `arena-promo.mp4` — 33 s, 1080p, with a generated placeholder music bed
- `arena-promo-silent.mp4` — same video without audio

## Re-render
`source/promo.html` draws every frame on a canvas (`draw(t)`); `source/render.cjs` captures the frames with Playwright.

```
cd promo/source
node render.cjs frames 30
ffmpeg -framerate 30 -i frames/f%05d.png -c:v libx264 -crf 18 -pix_fmt yuv420p ../arena-promo-silent.mp4
```

Fonts: Cinzel, Plus Jakarta Sans (SIL Open Font License, via Fontsource).
