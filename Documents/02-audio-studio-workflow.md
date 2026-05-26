# Audio Studio Workflow

The Audio Studio is the hub for scripting, voice casting, and rendering audio for the timeline.

## Objectives

- Create and edit script lines.
- Assign speakers to individual lines.
- Configure voice parameters for each speaker.
- Render audio for specific lines or the entire script.
- Add audio clips to the timeline to provide timing references for Post-Production and Video Studio.

## Recommended Workflow

1. **Import or Create Script**
   - Use the project/script import feature if you already have a Markdown file.
   - If creating manually, add script lines one by one.
   - Ensure every line has a clearly assigned speaker.

2. **Standardize Speakers**
   - Use consistent speaker names, as voice casting is strictly bound to the speaker's ID.
   - Examples: `narration`, `kael`, `elara`.
   - Avoid mixing cases (e.g., `Kent` vs `kent`), as this may lead to cache or voice mismatches.

3. **Edit Line Content**
   - The text in each line is the direct source for the audio rendering.
   - Acting notes or directions inside parentheses might be processed or filtered out by the backend before rendering.
   - If you need to leave instructions for the video scene, use the "Director Notes" in the Video Studio instead of cramming them into the audio text.

4. **Configure Voice Casting**
   - Open the Voice Casting panel on the right.
   - Select the gender, age, and pitch for each speaker.
   - Upload a voice reference file if you have a real audio sample.
   - Click "Create Synthetic Voice" (Lock Voice) to generate a permanent AI voice profile.
   - Save the voice configuration.

5. **Render Audio**
   - Select the specific lines you want to render, or clear selection to render all.
   - Click "Render Audio".
   - As each line finishes rendering, an audio clip will automatically appear on the timeline.
   - If you re-render a line, the old clip on the timeline will be seamlessly replaced by the new one.

6. **Verify the Timeline**
   - Click on a script line to automatically scroll the timeline to the corresponding clip.
   - Play the timeline to review the pacing and audio quality.
   - Move to Post-Production when you are ready to mix or export.

## Key Functions & Buttons

- `+ Add Line`: Inserts a new script line.
- `Sort`: Toggles the line sorting mode.
- `Voice Casting`: Opens the voice configuration panel.
- `Create Synthetic Voice / Lock Voice`: Generates and locks a synthetic voice profile for the speaker.
- `Change Voice Reference`: Allows uploading a custom voice reference.
- `Go to Video Studio`: Quickly switches to the Video Studio to create visuals for the selected script line.

## Pre-Video Studio Checklist

- The script is logically divided into lines.
- Speaker names are consistent and standardized.
- Voice configurations for key speakers are locked or saved.
- Audio clips are successfully rendered and present on the timeline.
- The audio pacing and timing sound correct.
