# Flower-field background asset

- Original: **Serene Field of Blooming Pink Wildflowers** by **대정 김**, Pexels video 30601426.
- Source page: https://www.pexels.com/video/serene-field-of-blooming-pink-wildflowers-30601426/
- Original 720p download: https://videos.pexels.com/video-files/30601426/13102474_1280_720_30fps.mp4
- License: https://www.pexels.com/license/ (retrieved 19 October 2026). The Pexels license allows website use and modification. No people or brands are presented as endorsing LoveLetta.
- Adaptation: selected 16 seconds beginning at 2 seconds; 1280 × 720 at 24 fps, H.264, no audio, slightly softened saturation and brightness; MP4 fast-start metadata. A matching JPEG frame provides the static fallback.
- Hosted privately in the project's R2 bucket, with metadata in D1 and publication-aware media access. Source footage is not redistributed as a stock download.

Reproduce the optimized background from the source file with:

```bash
ffmpeg -ss 2 -i source.mp4 -t 16 -an -vf 'scale=1280:-2,fps=24,eq=saturation=0.82:brightness=0.025' -c:v libx264 -preset fast -crf 27 -pix_fmt yuv420p -movflags +faststart flower-field.mp4
ffmpeg -ss 4 -i flower-field.mp4 -frames:v 1 flower-field-poster.jpg
```

Upload the resulting media through the editor; asset identifiers are deployment-specific and are kept in configuration rather than source code.
