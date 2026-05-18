# MacBook Intake & Assessment Workflow

## Goal
Standardize intake and hardware assessment for MacBooks in unknown states while minimizing setup time.

---

## At-a-Glance Workflow

```text
Receive MacBook
    ↓
Physical inspection
    ↓
Can access desktop?
    ├─ YES → Gather battery data immediately
    │          using system_profiler SPPowerDataType
    │
    └─ NO → Boot Recovery
               ↓
        Gather hardware info via Terminal
               ↓
        Attempt ioreg battery read
               ↓
        Battery data available?
            ├─ YES → Finish intake
            │
            └─ NO → Temporary account or
                     external boot environment
                     for full battery metrics
```

The numbered sections below provide detailed reference for each branch.

---

## Table of Contents
- [1. Initial Physical Inspection](#1-initial-physical-inspection)
- [2. Determine Device State](#2-determine-device-state)
- [3. Recovery Workflow](#3-recovery-workflow)
- [4. Battery Health Strategy](#4-battery-health-strategy)
- [5. Apple Silicon vs Intel Notes](#5-apple-silicon-vs-intel-notes)
- [6. Common Terminal Commands](#6-common-terminal-commands)
- [7. Recommended Intake Data Fields](#7-recommended-intake-data-fields)

---

## 1. Initial Physical Inspection

### Before Powering On

Record:
- Cosmetic condition
- Screen damage
- Keyboard condition
- Missing screws
- Signs of liquid damage
- Engraving/stickers
- Charger included?
- SSD removed?

Quick checks:
- Does it power on?
- Does it chime?
- Backlight?
- Trackpad click?
- Fan spin?

### Visual Identification Clues

Before powering on, these visual cues narrow down the model:

| Feature | What it tells you |
|---|---|
| Notch in display | MacBook Pro 14"/16" (late 2021 or newer) or MacBook Air M2/M3 (2022+) |
| Touch Bar above keyboard | Intel MacBook Pro, 2016–2020 |
| MagSafe port + HDMI + SD card slot | MacBook Pro 14"/16", 2021+ (Apple Silicon Pro/Max) |
| USB-C ports only, no MagSafe | 2016–2020 MacBook Pro, or M1 MacBook Air/Pro 13" (2020–2022) |
| USB-A ports present | Pre-2016 MacBook Pro |
| Wedge-shaped chassis | MacBook Air (any generation through M2; M3 still wedge, M-series Pro is flat) |
| Function row keys (F1–F12) instead of Touch Bar | Pre-2016 Intel or 2021+ Apple Silicon Pro |
| White/silver Apple logo on lid (non-illuminated) | 2016 or newer |
| Glowing Apple logo on lid | 2015 or older |

Then continue:
- If device boots normally → [2. Determine Device State](#2-determine-device-state)
- If device does NOT boot → boot Recovery or Diagnostics first

---

## 2. Determine Device State

### Scenario A — Welcome / Setup Screen

Examples:
- Country selection
- Hello animation
- Setup Assistant

Recommended path:
1. DO NOT complete setup yet
2. Boot into Recovery
3. Gather hardware data from Terminal
4. Decide whether deeper testing is needed

Continue here:
→ [3. Recovery Workflow](#3-recovery-workflow)

---

### Scenario B — Existing User Desktop

Examples:
- Already logged in
- Existing account available
- Password known

Recommended path:
1. Open About This Mac (Apple menu) for fast identification
2. Gather battery data from System Settings or Terminal
3. Run quick hardware checks
4. Optionally reboot to Recovery for consistency

---

### Scenario C — Locked / Unknown Password

Recommended path:
1. Boot Recovery
2. Gather hardware data
3. Evaluate Activation Lock / MDM status
4. Decide whether to erase

Continue here:
→ [3. Recovery Workflow](#3-recovery-workflow)

---

## 3. Recovery Workflow

### Enter Recovery Mode

#### Intel Macs
- Power on while holding:
  - Command + R

#### Apple Silicon
- Press and hold the power button until "Loading startup options" appears
- Release the power button
- Click **Options**, then click **Continue**
- If prompted, select a volume and enter the admin password

---

### Open Terminal

Recovery Menu:
Utilities → Terminal

---

### Core Intake Commands

#### Device Identifier
```bash
sysctl -n hw.model
```

#### CPU
```bash
sysctl machdep.cpu.brand_string
```

#### RAM
```bash
sysctl hw.memsize
```

#### Serial Number
```bash
ioreg -l | grep -i IOPlatformSerialNumber
```

#### Storage Size
```bash
diskutil info disk0 | grep "Disk Size"
```

#### Full Hardware Summary
```bash
system_profiler SPHardwareDataType
# if command not found:
/usr/sbin/system_profiler SPHardwareDataType
```

---

### Recovery Battery Assessment

#### Fastest Reliable Battery Command

```bash
ioreg -rc AppleSmartBattery | egrep "DesignCapacity|MaxCapacity|CycleCount"
```

Use:
- DesignCapacity
- MaxCapacity
- CycleCount

#### Interpret MaxCapacity

`MaxCapacity` is reported in different units depending on the Mac:

- **T2 Macs and Apple Silicon:** `MaxCapacity` is already a normalized 0–100 percentage. Record it directly as battery health.
- **Pre-T2 Intel Macs:** `MaxCapacity` is reported in raw mAh. Apply the formula below.

Quick rule: if `MaxCapacity` is ≤ 100, it IS the percentage. If it's a large number (typically 4000–8000), it's mAh and needs the formula.

Battery Health Formula (pre-T2 Intel only):

```text
MaxCapacity / DesignCapacity * 100
```

Examples:

```text
Pre-T2 Intel:        6200 / 6900 = 89%
T2 / Apple Silicon:  MaxCapacity = 89  →  Battery health 89%
```

This is usually the best recovery-safe intake method because it:
- Works without setup
- Avoids installing CoconutBattery
- Is easy to automate
- Returns structured data

> **Use `ioreg` in Recovery; prefer `system_profiler SPPowerDataType` everywhere else.** Once the Mac is booted normally, `system_profiler SPPowerDataType` reports `Maximum Capacity: NN%` directly — no unit interpretation, no version drift. The `ioreg` route exists because Recovery on Apple Silicon often can't run `system_profiler SPPowerDataType` cleanly. If you're scripting against `ioreg` output, also be aware: Apple Silicon exposes companion fields (`AppleRawMaxCapacity`, `NominalChargeCapacity`, `DesignCapacity`) in mAh-style units alongside the percentage `MaxCapacity` — target each key by name, not by output ordering, since Apple has quietly renamed/added these between macOS releases.

---

### Important Reality Check

Recovery battery reporting is unreliable on T2 and some Apple Silicon Macs — expect occasional missing or incomplete values. If data is missing, fall back to [Battery Health Strategy](#4-battery-health-strategy).

---

### Recommended Recovery Decision Tree

#### If battery data appears correctly
→ Record values and continue intake

#### If battery data is missing
→ Continue to [4. Battery Health Strategy](#4-battery-health-strategy)

---

### Activation Lock & MDM Checks

#### Activation Lock

In Recovery (T2 Intel or Apple Silicon):

```bash
system_profiler SPHardwareDataType | grep -i "activation"
```

Logged in: System Settings → General → About → Activation Lock status.

If locked, the machine cannot be resold or fully wiped without the original owner's Apple ID. Stop intake and flag.

> **Pre-T2 Intel Macs (2017 and older) do not support Activation Lock.** The command above returns nothing on those machines — that's expected, not a clean bill of health. Confirm the era from §5 before interpreting an empty result.

#### MDM Enrollment

Logged in:

```bash
profiles status -type enrollment
```

Look for:
- `Enrolled via DEP: Yes` — device will re-enroll automatically after a wipe. Treat as MDM-locked.
- `MDM enrollments: Yes` — currently managed.

Visual cue (no login needed): if Setup Assistant shows a "Remote Management" screen, the device is DEP-supervised.

If DEP-enrolled, the original org must release it from their MDM before resale.

---

## 4. Battery Health Strategy

### Current Best Practical Workflow

#### Preferred Path

1. Attempt battery read in Recovery
2. If successful → avoid setup entirely
3. If unsuccessful:
   - Boot normally
   - Use existing account if available
   - Otherwise create temporary local account
4. Run:

```bash
system_profiler SPPowerDataType
# if command not found:
/usr/sbin/system_profiler SPPowerDataType
```

5. Record:
- Cycle Count
- Maximum Capacity
- Condition

6. Remove temp account or erase machine afterward

---

### Why Recovery Alone Is Not Fully Reliable

Battery reporting depends on:
- Power management services
- SMC communication
- OS-level frameworks
- Model-specific hardware initialization

Recovery intentionally loads a reduced environment.

Result:
- Hardware identification works well
- Battery telemetry may not

---

## 5. Apple Silicon vs Intel Notes

Confirm architecture first via About This Mac, `uname -m` (`arm64` = Apple Silicon, `x86_64` = Intel), or visual cues (notch + flat sides = Apple Silicon Pro/Max). The table below summarizes the workflow differences that affect intake.

| Aspect | Intel pre-T2 (2017 & older) | Intel T2 (2018–2020) | Apple Silicon (M1+, 2020+) |
|---|---|---|---|
| Recovery entry | Power on holding Cmd+R | Power on holding Cmd+R; may prompt for admin password | Hold power until "Loading startup options" |
| Recovery Terminal | Open access | Disk access may require auth | Requires admin password for boot volume |
| Battery telemetry in Recovery | `MaxCapacity` in raw mAh; reliable | `MaxCapacity` as percentage; sometimes missing | `MaxCapacity` as percentage; sometimes missing |
| Activation Lock | Not present | Possible (T2 + Apple ID) | Possible (Secure Enclave + Apple ID) |
| External boot | Straightforward | Blocked if firmware password set or external-boot disallowed | Requires "Reduced Security" + admin auth |
| Apple Diagnostics | Power on holding D | Power on holding D | Hold power → Cmd+D from Options screen |

---

## 6. Common Terminal Commands

### Device Identifier

```bash
sysctl -n hw.model
```

---

### CPU

```bash
sysctl machdep.cpu.brand_string
```

---

### RAM

```bash
sysctl hw.memsize
```

Common values:

| Bytes | RAM |
|---|---|
| 4294967296 | 4 GB |
| 8589934592 | 8 GB |
| 17179869184 | 16 GB |
| 34359738368 | 32 GB |
| 68719476736 | 64 GB |

---

### Storage

```bash
diskutil info disk0
```

---

### Battery

```bash
ioreg -rc AppleSmartBattery
```

OR

```bash
system_profiler SPPowerDataType
# if command not found:
/usr/sbin/system_profiler SPPowerDataType
```

---

### Serial Number

```bash
ioreg -l | grep -i IOPlatformSerialNumber
```

---

## 7. Recommended Intake Data Fields

### Core Fields

- Serial Number
- Device Identifier
- CPU
- RAM
- SSD Size
- Battery Cycle Count
- Battery Health %
- Activation Lock?
- MDM Locked?
- Cosmetic Grade
- Charger Included?
- Passcode Present?

---

### Suggested Derived Fields

Use [MacBook Model Lookup](/) to derive these from `hw.model`:

- Model Year
- Screen Size
- Intel vs Apple Silicon
- Touch Bar?
- Retina?
- Storage Upgradeability

