# Overall Web Application Workflow

AudioBook-KJ V2 is a comprehensive web application designed to transform audiobook scripts into complete multimedia products with audio, images, video scenes, and final exports.

The application is currently divided into 3 main views:

- **Audio Studio:** Write/edit scripts, configure voice casting, render audio, and create the audio timeline.
- **Video Studio:** Create visual assets, build scene graphs, generate frames/videos using FlowKit/Veo, and add videos to the timeline.
- **Post-Production:** Sync audio and video timelines, preview the product, adjust clips, and Mix & Export.

## Overall Workflow

1. **Project Preparation**
   - Create a new project or import an existing one.
   - Check the FlowKit status in the header if you need to generate images/videos.
   - Set the global art style, aspect ratio, and default video duration in the Video Studio.

2. **Script Processing in Audio Studio**
   - Import a script or manually add lines.
   - Assign a specific speaker or voice actor to each line.
   - Edit the text content line by line.
   - Configure Voice Casting (gender, age, pitch) for each speaker.
   - Render the audio for selected lines or the entire script.
   - Verify that the rendered audio clips appear on the timeline.

3. **Visual Creation in Video Studio**
   - Create or edit Visual Assets (characters, locations).
   - Upload or reference images if you need specific character consistency.
   - Generate AI asset images if needed.
   - Create visual scenes based on the script or audio.
   - Write prompts or director notes for each scene.
   - Generate keyframes first, then generate the full video.
   - Add the completed video clips to the Post-Production timeline.

4. **Mixing in Post-Production**
   - Review the audio and video tracks on the timeline.
   - Adjust the start time, duration, trimming, and track placement for clips.
   - Preview the synced timeline.
   - Mix & Export the final product.
   - Verify the output file (MP3 or MP4).

5. **Saving and Handoff**
   - Ensure the project state has auto-saved to the SQLite database.
   - If developing or planning, update `PROGRESS.md`.
   - If new bugs arise, create a new plan in the `planning/` directory.

## Working Principles

- **Audio before Video:** Always process audio first so that video scenes can be timed correctly.
- **Stable Line IDs:** Do not arbitrarily change `line.id`, as audio, video, and timeline clips are linked by these IDs.
- **Aspect Ratios:** Decide on the aspect ratio (e.g., 16:9 or 9:16) before generating videos in bulk.
- **FlowKit Dependency:** If FlowKit is offline, avoid generating frames, videos, or asset images.
- **Post-Production Purpose:** The Post-Production view is meant for mixing and exporting, not for generating new scenes.

## Current State & Reminders

- Core data is managed and persisted using SQLite.
- Audio/Video timelines and Video graphs are securely saved in SQLite.
- Media files are systematically routed to isolated project folders.
- Portrait (9:16) exports have been fully supported and fixed.
