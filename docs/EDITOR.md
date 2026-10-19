# Your LoveLetta studio

Start at https://loveletta-studio.digital-world-9896a4.workers.dev.

## Make it personal

Open **Love letters**. Change the welcome headline, recipient, sender, envelope label, and opening note. Select a letter, write in the rich-text area, and use its toolbar for bold, italic, underline, highlight, headings, and quotations. Enter a signature and postscript. Create additional letters and select which opens first.

**Theme & typography** includes Rose garden, Peony blush, Champagne, Rose at dusk, Lavender rose, and Porcelain presets. Customize all palette colors, paper, textures, background image, heading/body/letter fonts, font sizes, paper width, radius, shadow, border, spacing, and button style. Dark and white appearances are available.

**Flowers & motion** controls floral visibility, peony/rose/cherry treatments, tints (in Theme), decorative position, size, sway, bloom, hearts, petal count, speed, opacity, and drift. Gentle performance mode limits petals to eight. Visitors who request reduced motion receive a static experience automatically.

## Add photographs and songs

For the quickest route, open **Photo gallery** and use the photo upload box to select or drop several photos. They are saved to R2 and added directly to your draft gallery. Add captions and dates, then Publish to display them in Our moments on the main site. The gallery chapter is enabled automatically when you upload. You can also choose existing photos from your Media library.

Open **Media library**, choose a folder, and select or drop files. Images are optimized in the browser before uploading into R2. Search by filename or folder. Organize renames a file or moves it to another virtual folder; Replace uploads a new asset and changes its references in the current draft.

Use **Add to gallery** or **Add to music** on an uploaded item, or select the file from the corresponding chapter editor. Gallery memories have captions and dates and can be reordered with arrow buttons. Photographs open in an accessible dialog on the public site.

In **Music**, select the opening song and set the starting time in seconds. For example, `75.5` starts at 1 minute 15.5 seconds. Set volume, looping, start behavior, and player appearance. Browsers can refuse audible autoplay; the player then asks the recipient to tap Play. A timestamp past the end of the selected song produces an explanatory player message.

## Arrange the journey

Use **Our timeline** for dates, titles, and memories. **Little surprises** holds labels and hidden messages that unfold when tapped. **Page layout** controls chapter order, visibility, alignment, spacing, backgrounds, reveal animations, desktop width, and mobile gallery columns. Drag to reorder, or use the up/down buttons. Quotation chapters can be added independently.

The live preview shows unsaved changes without altering the public website. Switch between desktop and mobile widths. Opening the preview in a separate tab shows the latest saved draft. Audio is not requested automatically in preview.

## Publish and restore

**Save draft** keeps changes private. **Publish** saves and applies them to the public site. Existing open browser tabs display the version loaded when they opened; refreshing fetches the new publication.

**Publishing history** lists saved publications. Restore loads one into the draft. Publish the restored draft when it is ready to become public again. You can delete an earlier archived publication to release its media references; the current publication is protected from archive deletion.

## Privacy and backups

In **Settings & security**, set an optional visitor password of at least eight characters. The password immediately gates content and media. Rotating or removing it invalidates earlier visitor sessions. Change the editor password using the current password and a new password of at least 14 characters.

Maintenance mode hides the public content after publishing. The editor remains usable. Configure the website title, description, favicon, and social sharing image here as well. Social platforms may cache earlier sharing metadata.

Download configuration backups before major changes. Backups contain text, layout, and settings; they exclude passwords and media files. Restore them into this project, where the referenced R2 objects still exist. Reset to default creates an unsaved example draft and does not erase the live publication or history.

Keep the setup invitation, editor password, and private backups to yourself. Share only the public website URL with your recipient.

## Flower-field video background

Under **Theme & typography → Flower-field video background**, enable a transparent page and select your uploaded video, or upload an MP4/WebM directly (up to 20 MB). The video is saved to R2 and appears in the live preview. Save draft and Publish when ready.

Customize video visibility, the soft palette-colored overlay, blur, playback speed, starting timestamp, looping, autoplay, sizing, framing, mobile playback, and translucent letter/photo paper. Choose a poster image for loading, reduced motion, unavailable videos, and data-saving modes. Video sound is always muted, keeping your chosen music independent. Visitors have a pause/play background control.

The supplied pink cosmos footage is a 16-second, 720p H.264 loop with a matching still image. Its source and license are documented in ASSETS.md. Full-screen video is streamed from R2 using byte ranges. Disable or replace it at any time; replacing the current background leaves earlier publications' media available for rollback.

## Floating playlist and song excerpts

Open **Music** and upload one or several audio files directly into your playlist, or add songs already in the Media library. Each song has an independent **Start playing at** and **Stop playing at** field. Enter `0:45` and `1:30` to play only that excerpt, for example. Seconds (`45`), minutes and seconds (`1:15.5`), or hours (`1:02:03`) are accepted. Leave Stop playing at blank to use the natural ending. The end must be after the start; an end beyond the actual duration stops at the song's natural ending. A start beyond the recording's duration displays a player error instead of playing from the wrong position.

Select the opening song and reorder the collection with the arrow buttons. Enable **Loop the selected excerpt** to repeat just the chosen range. With looping off, **Continue with the next song** optionally advances through the playlist; otherwise the player stops at the selected end. The default starting-time field applies when adding new songs and supports older configurations.

The main site's floating player has play/pause, previous/next, a song chooser, volume, and a seek bar bounded to the selected excerpt. The time labels show positions in the original recording. Playback restarts at the configured start after an excerpt finishes. Existing autoplay restrictions still apply, with a tap-to-play fallback.

Save draft and Publish to update the live playlist. Until songs have been added, the enabled floating player displays a gentle empty state. Music uploads remain authenticated editor actions; visitors select and play the published songs.
