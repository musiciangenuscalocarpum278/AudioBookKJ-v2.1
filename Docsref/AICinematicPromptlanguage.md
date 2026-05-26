# AI Cinematic Prompt Language v1.0

## Pseudo-FACS System for AI Video Generation

---

# 1. Facial Expression System (FACS)

## Core Emotion Units

| Code | Meaning               |
| ---- | --------------------- |
| AU1  | Inner brow raise      |
| AU2  | Outer brow raise      |
| AU4  | Brows lower / tighten |
| AU5  | Upper eyelid raise    |
| AU6  | Cheek raise           |
| AU7  | Eyelid tighten        |
| AU9  | Nose wrinkle          |
| AU10 | Upper lip raise       |
| AU12 | Smile                 |
| AU15 | Sad mouth corners     |
| AU17 | Chin raise            |
| AU20 | Lip stretch           |
| AU23 | Lip tighten           |
| AU24 | Lip press             |
| AU25 | Mouth slightly open   |
| AU26 | Jaw drop              |
| AU43 | Eyes closed           |

---

## Example

```text
FACS: AU4+AU7+AU25
```

Meaning:

* intense focus
* tension
* heavy breathing

---

# 2. Camera Language System

## Shot Size Codes

| Code | Meaning           |
| ---- | ----------------- |
| ECU  | Extreme Close Up  |
| CU   | Close Up          |
| MCU  | Medium Close Up   |
| MS   | Medium Shot       |
| WS   | Wide Shot         |
| EWS  | Extreme Wide Shot |
| POV  | Point of View     |
| OTS  | Over The Shoulder |

---

## Camera Angle Codes

| Code  | Meaning              |
| ----- | -------------------- |
| LOW   | Low angle            |
| HIGH  | High angle           |
| DUTCH | Tilted chaotic angle |
| TOP   | Top-down shot        |
| FPV   | First-person view    |

---

## Camera Movement Codes

| Code       | Meaning              |
| ---------- | -------------------- |
| TRK-F      | Tracking forward     |
| TRK-B      | Tracking backward    |
| TRK-L      | Tracking left        |
| TRK-R      | Tracking right       |
| PUSH       | Push in              |
| PULL       | Pull out             |
| ORBIT      | Orbit around subject |
| PAN-L      | Pan left             |
| PAN-R      | Pan right            |
| TILT-UP    | Tilt upward          |
| TILT-DOWN  | Tilt downward        |
| CRANE-UP   | Crane upward         |
| CRANE-DOWN | Crane downward       |
| HH         | Handheld             |
| LOCK       | Locked camera        |

---

## Example

```text
CAM: TRK-L+ORBIT+PUSH
```

Meaning:

* lateral movement
* cinematic orbit
* dramatic push-in

---

# 3. Lens Language

| Code    | Meaning               |
| ------- | --------------------- |
| 18MM    | Ultra wide cinematic  |
| 24MM    | Epic cinematic wide   |
| 35MM    | Natural cinematic     |
| 50MM    | Human eye feel        |
| 85MM    | Portrait compression  |
| MACRO   | Extreme detail        |
| FISHEYE | Distorted perspective |

---

## Example

```text
LENS: 24MM
```

---

# 4. Motion Language

| Code         | Meaning                  |
| ------------ | ------------------------ |
| SPEED_RAMP   | Dynamic speed transition |
| HITSTOP      | Freeze impact frame      |
| SNAP_ZOOM    | Fast zoom                |
| WHIP_PAN     | Fast directional pan     |
| SHAKE        | Camera shake             |
| DRIFT        | Slow cinematic drift     |
| BULLET_TIME  | Slow motion              |
| MOTION_BLUR  | Motion trails            |
| SMEAR        | Anime smear frames       |
| IMPACT_FRAME | Stylized impact frame    |

---

## Example

```text
MOTION: SPEED_RAMP+HITSTOP
```

---

# 5. FX Language

| Code         | Meaning              |
| ------------ | -------------------- |
| ELEC_ARC     | Electrical arcs      |
| HEAT_DISTORT | Heatwave distortion  |
| SHOCKWAVE    | Shockwave distortion |
| DUST_SWIRL   | Swirling dust        |
| DEBRIS       | Flying debris        |
| ENERGY_TRAIL | Energy streaks       |
| SPARKS       | Flying sparks        |
| FIRE_EMBER   | Burning embers       |
| MIST_FLOW    | Moving mist          |
| RAIN_HEAVY   | Heavy rain           |
| BLOOD_SPLASH | Blood spray          |

---

## Example

```text
FX: ELEC_ARC+HEAT_DISTORT
```

---

# 6. Lighting Language

| Code          | Meaning                 |
| ------------- | ----------------------- |
| RIM           | Rim lighting            |
| VOLUMETRIC    | Volumetric lighting     |
| BACKLIT       | Strong backlight        |
| HIGH_CONTRAST | High contrast           |
| SILHOUETTE    | Silhouette lighting     |
| SOFT_LIGHT    | Soft cinematic light    |
| HARD_LIGHT    | Harsh directional light |
| GODRAYS       | Divine light rays       |

---

## Example

```text
LIGHT: RIM+VOLUMETRIC
```

---

# 7. Environment Language

| Code               | Meaning                 |
| ------------------ | ----------------------- |
| FLOATING_DEBRIS    | Floating rocks          |
| STORM_SKY          | Storm clouds            |
| APOCALYPTIC        | End-of-world atmosphere |
| RUINED_BATTLEFIELD | Destroyed battlefield   |
| VOID_SPACE         | Cosmic void             |
| VOLCANIC           | Lava environment        |
| SNOW_BLIZZARD      | Blizzard                |
| CYBER_CITY         | Futuristic city         |

---

# 8. Character Motion Language

| Code            | Meaning                 |
| --------------- | ----------------------- |
| FLOWING_ROBES   | Robes flowing           |
| HAIR_WHIP       | Hair whipping violently |
| HEAVY_BREATHING | Intense breathing       |
| COMBAT_STANCE   | Ready battle stance     |
| FLOATING_IDLE   | Floating power pose     |
| POWER_UP        | Charging aura           |
| TELEPORT_STEP   | Instant movement        |
| WEIGHT_SHIFT    | Realistic body transfer |

---

# 9. Anime / Cinematic Style Language

| Code          | Meaning                      |
| ------------- | ---------------------------- |
| SAKUGA        | High-quality anime animation |
| AAA_CINEMATIC | Game trailer look            |
| DARK_FANTASY  | Dark fantasy mood            |
| XIANXIA       | Chinese cultivation fantasy  |
| WUXIA         | Martial arts fantasy         |
| GHIBLI        | Soft painterly anime         |
| REALISTIC_CGI | Hyper-real CGI               |
| INK_STYLE     | Ink painting look            |

---

# 10. Full Prompt Syntax Example

```text
FACS: AU4+AU7+AU25
SHOT: EWS
ANGLE: LOW
CAM: TRK-L+ORBIT+PUSH
LENS: 24MM
MOTION: SPEED_RAMP+HITSTOP+MOTION_BLUR
FX: ELEC_ARC+HEAT_DISTORT+SHOCKWAVE
LIGHT: RIM+VOLUMETRIC
ENV: RUINED_BATTLEFIELD+STORM_SKY
STYLE: DARK_FANTASY+XIANXIA+AAA_CINEMATIC
```

---

# 11. Interpreted Meaning

* angry focused expression
* epic battlefield
* cinematic side tracking
* orbiting dramatic camera
* anime impact timing
* electricity explosion
* storm atmosphere
* volumetric god lighting
* AAA fantasy trailer vibe

---

# 12. Advanced Node-Based Prompting Concept

```text
CHAR:
FACS(AU4+AU7+AU25)

CAM:
SHOT(EWS)
MOVE(TRK-L+ORBIT+PUSH)

VISUAL:
LENS(24MM)
LIGHT(RIM+VOLUMETRIC)

FX:
ELEC_ARC
HEAT_DISTORT
SHOCKWAVE

STYLE:
XIANXIA
AAA_CINEMATIC
```

---

# 13. Suggested Future Expansions

Potential future modules:

* AUDIO:

  * THUNDER_CRACK
  * LOW_RUMBLE
  * DISTANT_CHANT

* TIMING:

  * SLOW_BUILDUP
  * SUDDEN_IMPACT
  * RHYTHMIC_CUTS

* CHARACTER ENERGY:

  * DIVINE_AURA
  * DEMONIC_PRESSURE
  * HOLY_LIGHT

* TRANSITIONS:

  * SMASH_CUT
  * FADE_TO_WHITE
  * GLITCH_TRANSITION

---

# 14. Goal of This Language

A standardized cinematic shorthand for:

* AI video prompting
* Veo / Sora / Kling / Runway
* Storyboarding
* Previsualization
* Anime combat prompting
* AAA trailer generation
* Node-based cinematic AI workflows

---

# 15. Philosophy

Traditional prompting:

> “A warrior fighting in a storm.”

Structured cinematic prompting:

```text
FACS: AU4+AU7
SHOT: CU
ANGLE: LOW
CAM: PUSH
FX: ELEC_ARC
LIGHT: VOLUMETRIC
STYLE: AAA_CINEMATIC
```

The future of prompting is not paragraphs.

It is cinematic syntax.
