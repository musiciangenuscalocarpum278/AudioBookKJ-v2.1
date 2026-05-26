# Project and Media Workflow

This document describes how to manage projects and their associated media files in AudioBook-KJ V2 to ensure data isolation and safety.

## Media Architecture

The application systematically routes all generated media into isolated project workspaces. When a new project is created, a dedicated directory structure is instantiated to keep files cleanly separated.

### Expected Directory Structure

Each project is stored within `audiobook_builder/projects/<project-slug>-<id>/`.
Inside this workspace, the `media/` directory is structured as follows:

```text
MyAudiobookProject-1234abcd/
  media/
    audio/rendered-lines/      # AI-generated narration WAV files
    audio/previews/            # Temporary voice test previews
    video/generated-scenes/    # Final generated MP4 video scenes
    video/thumbnails/          # Extracted thumbnails for timeline display
    video/last-frames/         # Frames used for visual continuity
    images/assets/             # Character and location reference images
    voices/uploaded/           # User-uploaded voice reference files
    voices/synthetic/          # Permanent AI-generated voice profiles
    exports/audio/             # Final assembled MP3 outputs
    exports/video/             # Final rendered MP4 outputs
    cache/                     # Temporary scratch files and downloads
```

When you create a new project, the backend will automatically map all future media generation for that project into this specific folder.

## Media Management Principles

- **Do not manually delete files** from the `projects/` directory using File Explorer unless you are absolutely sure the project is abandoned. Clips on the timeline and entities in the database rely on these files.
- **Voice References:** The `voices/` directory holds your crucial voice casting files. If these are lost, characters will fail to render their specific voice profiles.
- **Visual References:** The `images/assets/` directory holds the reference images used by the AI Director to maintain character consistency.
- **Database Backup:** If you need to back up a project, you must back up both the `audiobook_builder/audiobook.db` SQLite database AND the corresponding project folder in `audiobook_builder/projects/`.

## Workflow for New Projects

1. Click **New Project** in the File Menu.
2. Enter a descriptive project name.
3. The application immediately provisions a new workspace folder and SQLite record.
4. All subsequent audio, video, images, voices, and exports will be automatically written into this isolated workspace.
5. To back up the project, simply copy its designated folder along with the database.

## Manual Backup Checklist

If you need to perform a complete manual backup of the entire system (all projects):
- Backup the SQLite database: `audiobook_builder/audiobook.db`.
- Backup the entire projects directory: `audiobook_builder/projects/`.
- If you are actively developing, backup `PROGRESS.md` and the `planning/` directory.
