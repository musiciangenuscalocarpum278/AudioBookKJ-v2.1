"""Shared server singletons — import from here, never re-instantiate."""
import os
from audio_generator import AudioGenerator

TEMP_DIR = "temp_audio"
OUTPUT_DIR = "output"
PROFILE_FILE = os.path.join(os.path.dirname(__file__), "project_profile.json")

def normalize_speaker_id(speaker: str) -> str:
    """Normalize speaker name to be safe for filenames and dict keys."""
    if not speaker:
        return ""
    import re
    s = str(speaker).lower().strip()
    s = re.sub(r'[^a-z0-9_]', '_', s)
    s = re.sub(r'_+', '_', s)
    return s.strip('_')


print("Booting server — loading AI model...")
audio_gen = AudioGenerator()
print("Boot complete!")

flowkit_state = {
    "flowKey": None,
    "callbackSecret": "audiobook_secret_key_123",
    "active_ws": None,
}
