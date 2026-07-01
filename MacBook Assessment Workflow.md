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

Each step above maps to a section below:

| Step in the diagram | Detailed reference |
|---|---|
| Physical inspection | [§1 Initial Physical Inspection](#1-initial-physical-inspection) |
| Can access desktop? | [§2 Determine Device State](#2-determine-device-state) |
| Gather battery data immediately (desktop path) | [§6 Battery Health Strategy](#6-battery-health-strategy) |
| Boot Recovery | [§3 Recovery Workflow → Enter Recovery Mode](#enter-recovery-mode) |
| Gather hardware info via Terminal | [§3 Recovery Workflow → Core Intake Commands](#core-intake-commands) |
| Attempt ioreg battery read | [§3 Recovery Workflow → Recovery Battery Assessment](#recovery-battery-assessment) |
| Temporary account / external boot environment | [§6 Battery Health Strategy](#6-battery-health-strategy) |

---

## Table of Contents
- [1. Initial Physical Inspection](#1-initial-physical-inspection)
- [2. Determine Device State](#2-determine-device-state)
- [3. Recovery Workflow](#3-recovery-workflow)
- [4. Activation Lock & MDM Checks](#4-activation-lock--mdm-checks)
- [5. Firmware Password Unlock (Intel only)](#5-firmware-password-unlock-intel-only)
- [6. Battery Health Strategy](#6-battery-health-strategy)
- [7. Apple Silicon vs Intel Notes](#7-apple-silicon-vs-intel-notes)
- [8. Common Terminal Commands](#8-common-terminal-commands)
- [9. Recommended Intake Data Fields](#9-recommended-intake-data-fields)

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
3. Evaluate [Activation Lock / MDM status](#4-activation-lock--mdm-checks)
4. Decide whether to erase

Continue here:
→ [3. Recovery Workflow](#3-recovery-workflow)

---

## 3. Recovery Workflow

### Enter Recovery Mode

#### Intel Macs
1. Turn the Mac on (or restart it) and **immediately** press and hold **Command (⌘) + R** — start holding right after pressing power, before/during the startup chime, not after the screen lights up.
2. Keep holding both keys until the **Apple logo or a spinning globe** appears, then release. Don't let go at the chime — too early and it boots normally.
3. Wait for the **macOS Utilities** window to load.

If a firmware password is set, a padlock prompt appears instead of the Apple logo — enter the password to continue (see [§5 Firmware Password Unlock](#5-firmware-password-unlock-intel-only)).

Related combinations (held the exact same way — press immediately, release at the Apple logo/globe):
- **Command + R** — built-in Recovery; the latest macOS that was installed on this Mac.
- **Option + Command + R** — internet Recovery; upgrades to the latest macOS this Mac supports.
- **Option + Shift + Command + R** — internet Recovery; the macOS the Mac shipped with (or the closest still available).

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
Record it exactly as surfaced — e.g. `MacBookAir8,1`, no spaces around the comma and matching the original casing. The model lookup keys on this exact string.

#### CPU
```bash
sysctl machdep.cpu.brand_string
```
Output looks like `Intel(R) Core(TM) i5-8210Y CPU @ 1.60GHz`. Record the **processor number** — the token right after `Core(TM)`, e.g. `i5-8210Y` (tier + SKU + suffix). Drop the `Intel(R) Core(TM)` prefix and the trailing `CPU @ …GHz`.

#### RAM
```bash
sysctl hw.memsize
```
`hw.memsize` returns raw bytes (e.g. `17179869184`), not GB. Match that number against the [Size reference](/#sizes) to read off the RAM size — no manual math needed.

#### Serial Number
```bash
ioreg -l | grep -i IOPlatformSerialNumber
```

#### Storage Size
```bash
diskutil info disk0 | grep "Disk Size"
```
`Disk Size` reports the raw formatted capacity, which reads a few percent under the marketed size — e.g. `121.3 GB` for a 128 GB drive. Round **up** to the nearest standard capacity and record that:

| Disk Size shows | Record as |
|---|---|
| ~121 GB | 128 GB |
| ~251 GB | 256 GB |
| ~500 GB | 512 GB |
| ~1.0 TB (1000 GB) | 1 TB |
| ~2.0 TB | 2 TB |

---

### Recovery Battery Assessment

#### Fastest Reliable Battery Command

```bash
ioreg -rc AppleSmartBattery | egrep "DesignCapacity|MaxCapacity|CycleCount"
```

`DesignCapacity`, `MaxCapacity`, and `CycleCount` are field names in the `ioreg` output — each line reports the key followed by its numeric value (e.g. `"MaxCapacity" = 6200`). On Apple Silicon the same command also surfaces an `AppleRawMaxCapacity` line (the `MaxCapacity` pattern matches it as a substring) — you'll need it below. Read the values off these lines:
- `DesignCapacity`
- `MaxCapacity`
- `AppleRawMaxCapacity` (Apple Silicon only)
- `CycleCount`

#### Interpret the capacity values

The unit `MaxCapacity` uses depends on the Mac — read the output, not the model, to tell which case you're in:

- **`MaxCapacity` in the thousands (typically 4000–8000), no `AppleRawMaxCapacity` line** → **pre-T2 Intel (2017 & older)**. `MaxCapacity` is raw mAh; compute health with the formula below.
- **`MaxCapacity` ≤ 100** → it's a normalized 0–100 percentage, reported by both **T2 Intel and Apple Silicon**. Handle the two differently:
  - **T2 Intel (2018–2020):** record that percentage directly as battery health.
  - **Apple Silicon (M1+, 2020+):** **don't trust the percentage** — on these Macs `MaxCapacity` is commonly pinned at/near 100 and ignores real wear. Use the `AppleRawMaxCapacity` line (raw mAh) and compute health from `AppleRawMaxCapacity / DesignCapacity` with the formula below.

To confirm the era instead of inferring it from the output, see [§7](#7-apple-silicon-vs-intel-notes): Intel pre-T2 is 2017 & older, Intel T2 is 2018–2020, Apple Silicon is M1+ (2020+).

Battery Health Formula (whenever you have a raw mAh value — `MaxCapacity` on pre-T2 Intel, `AppleRawMaxCapacity` on Apple Silicon) — divide the mAh value by the value reported under `DesignCapacity`, then multiply by 100. You're doing arithmetic on the two numbers, not running the field names as a command:

```text
(raw mAh value) / (DesignCapacity value) * 100
```

Examples:

```text
Pre-T2 Intel:   MaxCapacity 6200 / DesignCapacity 6900          = ~90%
Apple Silicon:  AppleRawMaxCapacity 4100 / DesignCapacity 4380  = ~94%
T2 Intel:       MaxCapacity = 89 (already a percentage)          → 89%
```

This is usually the best recovery-safe intake method because it:
- Works without setup
- Avoids installing CoconutBattery
- Is easy to automate
- Returns structured data

> **Use `ioreg` in Recovery; prefer `system_profiler SPPowerDataType` everywhere else.** Once the Mac is booted normally, `system_profiler SPPowerDataType` reports `Maximum Capacity: NN%` directly — no unit interpretation, no version drift. The `ioreg` route exists because Recovery on Apple Silicon often can't run `system_profiler SPPowerDataType` cleanly. When you do parse `ioreg`, target each key by name (`DesignCapacity`, `MaxCapacity`, `AppleRawMaxCapacity`, `CycleCount`) rather than by output ordering — Apple has quietly renamed and added these fields between macOS releases.

---

### Important Reality Check

Recovery battery reporting is unreliable on T2 and some Apple Silicon Macs — expect occasional missing or incomplete values. If data is missing, fall back to [Battery Health Strategy](#6-battery-health-strategy).

---

### Recommended Recovery Decision Tree

#### If battery data appears correctly
→ Record values and continue intake

#### If battery data is missing
→ Continue to [6. Battery Health Strategy](#6-battery-health-strategy)

---

## 4. Activation Lock & MDM Checks

These are booted/logged-in checks, not Recovery steps — run them once you have macOS up (or read the status in Setup Assistant as noted below).

### Activation Lock

Booted into macOS (logged in, via Terminal):

```bash
system_profiler SPHardwareDataType | grep -i "activation"
```

Returns `Activation Lock Status: Enabled` or `Disabled` (T2 Intel or Apple Silicon). You can also read the same status in System Settings → General → About.

**This does not work reliably in Recovery.** The Activation Lock field is populated by the running OS, so `system_profiler` in recoveryOS usually returns nothing — an empty result there tells you nothing about lock state. If you can't boot macOS, judge Activation Lock from Setup Assistant instead: being prompted to sign in with the previous owner's Apple ID during activation means the device is locked.

If locked, the machine cannot be resold or fully wiped without the original owner's Apple ID. Stop intake and flag.

> **Pre-T2 Intel Macs (2017 and older) do not support Activation Lock.** The command above returns nothing on those machines — that's expected, not a clean bill of health. Confirm the era from [§7](#7-apple-silicon-vs-intel-notes) before interpreting an empty result.

### MDM Enrollment

Booted into macOS (logged in, via Terminal):

```bash
profiles status -type enrollment
```

The `profiles` binary does not exist in recoveryOS — running it there gives "command not found." This is a booted-only check; if you can't boot macOS, use the Setup Assistant visual cue below instead.

Look for:
- `Enrolled via DEP: Yes` — device will re-enroll automatically after a wipe. Treat as MDM-locked.
- `MDM enrollment: Yes` — currently managed. (Field is singular in the output; a clean machine reports `No` for both lines.)

Visual cue (no login needed): if Setup Assistant shows a "Remote Management" screen, the device is DEP-supervised.

If DEP-enrolled, the original org must release it from their MDM before resale.

---

## 5. Firmware Password Unlock (Intel only)

A firmware password is the padlock prompt at boot that blocks Recovery, external boot, and startup-disk changes until the password is entered. **Intel-based Macs only** (pre-T2 and T2) — Apple Silicon has no firmware password; Apple moved that functionality into recoveryOS, gated by FileVault, so there's nothing to unlock here on an M-series Mac.

The firmware password itself is supplied separately and is never stored in this doc.

### Entering Recovery

If the padlock prompt appears before Recovery loads, enter the firmware password there first — you can't reach the removal tools otherwise.

### Removing the Password

Two ways to turn it off; both need the firmware password. Pick by whether the Mac has a working admin account.

**Terminal (Recovery) — works even with no macOS account.** Use this when the disk is wiped/unknown, or when the GUI throws "no admin found." The command authenticates against the firmware password itself, not a macOS account.

```bash
# In Recovery → Utilities → Terminal (already root, no sudo needed)
firmwarepasswd -check     # confirm a password is set
firmwarepasswd -delete    # prompts for the current firmware password, then clears it
```

Then restart. Re-run `firmwarepasswd -check` to confirm it reports no firmware password set.

**GUI Startup Security Utility — needs a macOS admin account.** Recovery → Utilities → **Startup Security Utility** → **Turn Off Firmware Password** → enter the firmware password. Use this when the Mac still has a working admin user.

> **"No admin found" / can't authenticate:** Startup Security Utility asks for the *installed macOS admin password*, so on a wiped or account-less Mac it dead-ends. Use the Terminal method above instead — it doesn't touch macOS accounts.

The same `firmwarepasswd -delete` flow works on both pre-T2 and T2 Macs when you know the password. (A *forgotten* firmware password is a different problem — it needs Apple's reset key or an Apple Configurator erase — and is out of scope here since the password is provided.)

---

## 6. Battery Health Strategy

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

## 7. Apple Silicon vs Intel Notes

Confirm architecture first via About This Mac, `uname -m` (`arm64` = Apple Silicon, `x86_64` = Intel), or visual cues (notch + flat sides = Apple Silicon Pro/Max). The table below summarizes the workflow differences that affect intake.

| Aspect | Intel pre-T2 (2017 & older) | Intel T2 (2018–2020) | Apple Silicon (M1+, 2020+) |
|---|---|---|---|
| Recovery entry | Power on holding Cmd+R | Power on holding Cmd+R; may prompt for admin password | Hold power until "Loading startup options" |
| Recovery Terminal | Open access | Disk access may require auth | Requires admin password for boot volume |
| Battery telemetry in Recovery | `MaxCapacity` in raw mAh; reliable | `MaxCapacity` as percentage; sometimes missing | `MaxCapacity` pinned ~100 — use `AppleRawMaxCapacity` (mAh); sometimes missing |
| Activation Lock | Not present | Possible (T2 + Apple ID) | Possible (Secure Enclave + Apple ID) |
| External boot | Straightforward | Blocked if firmware password set or external-boot disallowed | Requires "Reduced Security" + admin auth |
| Apple Diagnostics | Power on holding D | Power on holding D | Hold power → Cmd+D from Options screen |

---

## 8. Common Terminal Commands

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

## 9. Recommended Intake Data Fields

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

