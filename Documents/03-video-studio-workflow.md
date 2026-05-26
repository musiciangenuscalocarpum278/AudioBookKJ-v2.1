# Video Studio Workflow

The Video Studio is where you create visual assets, construct the scene graph, and generate video scenes using FlowKit/Veo.

## Objectives

- Manage Visual Assets (characters, locations).
- Create character reference images to maintain visual consistency.
- Generate scenes based on the script and audio timing.
- Generate initial keyframes for scenes.
- Generate full videos for scenes.
- Add completed video clips to the Post-Production timeline.

## Prerequisites

- Your script should already be finalized in the Audio Studio.
- The audio timeline should be populated with clips to ensure accurate timing for your video scenes.
- The FlowKit extension must be connected.
- Select your target Aspect Ratio before generating multiple videos:
  - `16:9` for landscape.
  - `9:16` for vertical/mobile videos.

## Recommended Workflow

1. **Configure Style & Video Settings**
   - Choose a global art style.
   - Select the target aspect ratio.
   - Set the default video duration.
   - Ensure the FlowKit status indicator shows "Connected".

2. **Create Visual Assets**
   - Create distinct assets for important characters, locations, or objects.
   - Fill in the name, description, and image prompt.
   - Upload a reference image if you have one.
   - Generate an asset image using AI if you need a new concept.
   - Mark a specific variation as the "Official/Reference" image to lock in character consistency.

3. **Create Scenes from Script**
   - Use the AI Director or the Scene Graph to break script lines into visual scenes.
   - Each scene should ideally be linked to a script line, or created manually for B-roll/establishing shots.
   - Ensure each scene references the correct character assets.

4. **Write Prompts and Director Notes**
   - Write the "User Intent" to describe what you want to happen in the scene.
   - The AI will automatically generate the English AI Prompt based on your intent and context.
   - Use "Director Notes" for specific camera angles, lighting, or actions that aren't obvious from the dialogue.
   - If you have a perfected prompt, you can use Direct Mode to bypass AI generation.

5. **Generate Frames**
   - Always generate a frame before generating the full video.
   - The keyframe acts as the visual anchor for the video generation.
   - For continuous scenes, you can use the last frame of the previous clip to maintain seamless continuity.

6. **Generate Video**
   - Only generate the video once the prompt, frame, and references look perfect.
   - Monitor the status (Pending / Generating / Success / Error).
   - If a generation fails, read the error message and try regenerating or adjusting the prompt.

7. **Add to Timeline**
   - Once a video generation is successful, click "Add to Timeline".
   - The clip will be placed on the video track in Post-Production.
   - Double-check that the video start time aligns properly with the corresponding audio.

## Important Notes

- While Video Studio generates the video files, the Post-Production view is the ultimate place for mixing and exporting.
- If you change the aspect ratio *after* generating a clip, the old clip may not fit the new output frame.
- Manage Visual Assets carefully; bad reference images will ruin the consistency of the entire video.
- Do not manually delete media files from the filesystem if clips or entities are still referencing them.

## Pre-Post-Production Checklist

- All necessary video clips have been successfully generated.
- All important clips have been added to the timeline.
- The aspect ratio matches your final export goal.
- No critical scenes are left in a pending or error state.
