# Agent Handoff Workflow

This document outlines the standard operating procedure for AI agents (Claude, Gemini, Codex) or other developers when taking over or contributing to the project.

## Objectives

- Prevent multiple agents or developers from modifying the same scope blindly.
- Ensure that all completed work is properly logged.
- Guarantee that the user always knows what tasks are completed and what is pending.

## Before Writing Code

1. Read `PROGRESS.md` to understand the current state of the project.
2. Read any relevant plan files within the `planning/` directory.
3. Check the user's currently open or active files to understand their context.
4. Identify the specific Track or Task you are assigned to work on.
5. If the task has the potential to overlap with other systems, explicitly clarify the scope with the user before making modifications.

## While Coding

- Only modify files that are strictly within the scope of your assigned task.
- Do not perform massive, sweeping refactors if the task only requires a minor bug fix.
- Do not blindly revert changes made by other agents or developers.
- If you discover that a file has been modified unexpectedly, pause execution and inform the user.
- Regarding media or file storage: Never hard-delete actual physical files without explicit confirmation from the user.

## After Completing Code

You must update `PROGRESS.md`:
- Change the status of the task to `Done` or `[x]`.
- Add a detailed entry to the `Completed Log`.
- Explicitly list which files were modified.
- Document any tests or validations that were run.
- Note down any edge cases or features that remain unverified.

## Recommended Log Format

```md
### B4 - 2026-05-16
- `frontend/src/hooks/useAudioMixer.ts`: Described the changes made.
- `audiobook_builder/routers/export.py`: Described the changes made.
- Validation: Successfully ran X test and verified Y behavior...
- Not verified: Have not yet tested Z under extreme load conditions...
```

## Creating New Plans

New plans should reside in a dedicated folder: `planning/<scope-name>-plan/`.
Each plan folder should ideally contain:
- A `README.md` explaining the plan's purpose.
- The main implementation plan file.
- A backlog file for delayed features.
- Any specific agent prompts if the work needs to be handed off to another AI.

## Writing User Documentation

Documentation intended for users should reside in the `Documents/` directory.
User documentation must:
- Be written in clear, accessible English.
- Describe operations grouped by view (Audio Studio, Video Studio, etc.).
- Clearly articulate the correct order of operations.
- Avoid overly dense implementation details (link to the `planning/` directory for deep technical specs instead).

## Rapid Handoff Checklist

- [ ] `PROGRESS.md` has been updated.
- [ ] Task statuses are accurate.
- [ ] Modified files are listed in the logs.
- [ ] Tests and validations are documented.
- [ ] Any newly discovered bugs have corresponding plans or backlog entries.
- [ ] The user can seamlessly hand the project to another agent without needing to explain the context from scratch.
