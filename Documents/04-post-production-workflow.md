# Post-Production Workflow

Post-Production is the final stage where you mix audio and video timelines and export the final product.

## Objectives

- View the combined audio and video timelines.
- Adjust clip properties: start time, track, trimming, and volume.
- Real-time preview of the synchronized product.
- Mix and export to MP3 (Audio only) or MP4 (Video).

## Recommended Workflow

1. **Synchronize Timelines**
   - From the Audio Studio, rendering audio automatically populates the audio timeline.
   - From the Video Studio, clicking "Add to Timeline" populates the video timeline.
   - Switch to Post-Production to view both timelines simultaneously.

2. **Inspect the Timeline**
   - Play the timeline from the beginning.
   - Verify that every audio line is in its correct chronological position.
   - Verify that video clips align perfectly with their corresponding audio dialogue.
   - Use the timeline zoom controls to make fine-grained adjustments.

3. **Adjust Audio**
   - Select an audio clip on the timeline.
   - Adjust the clip's volume if necessary.
   - Drag the clip to adjust its timing.
   - Only use the "Clear Audio" function if you intend to completely wipe the audio timeline.

4. **Adjust Video**
   - Select a video clip on the timeline.
   - Adjust the start time, duration, and trim values.
   - Manage video tracks (V1/V2) to overlay clips or prevent unwanted overlapping.
   - If "Keep Sound" is enabled on a generated video, listen closely—its original audio might clash with your narration.

5. **Preview**
   - Ensure the preview frame matches the project's aspect ratio.
   - `16:9` will display as a standard landscape frame.
   - `9:16` will display as a vertical mobile frame.
   - If the preview is distorted or using the wrong frame, check your `videoAspectRatio` setting in the Video Studio.

6. **Mix & Export**
   - If your timeline only contains audio, you can export it as an MP3.
   - If your timeline contains video clips, export it as an MP4.
   - For `9:16` projects, the output resolution will be vertical (`720x1280`).
   - For `16:9` projects, the output resolution will be landscape (`1280x720`).

## Technical Fixes to Note

- Portrait (9:16) export handling has been fixed:
  - The frontend sends the correct `aspect_ratio` via the mix WebSocket.
  - The backend FFmpeg utilizes canvas scaling/padding based on the ratio.
  - Videos are intelligently scaled and padded to prevent stretching or distortion.
  - The Post-Production preview dynamically updates its UI frame to match the ratio.

## Pre-Export Checklist

- The audio timeline contains all necessary dialogue and narration clips.
- The video timeline contains all necessary scenes (if exporting MP4).
- The aspect ratio correctly aligns with your target platform (e.g., YouTube vs. TikTok).
- The visual preview perfectly fits the frame without distortion.
- There are no glaring timing misalignments between audio and video tracks.
- For vertical videos, optionally verify the final dimensions using a video player or `ffprobe` after export.
