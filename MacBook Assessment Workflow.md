# MacBook Intake & Assessment Workflow

## Goal

Standardize intake and hardware assessment for MacBooks in unknown states while minimizing setup time.

Work top to bottom. Every step ends by naming the next one — if you're unsure where you are, go to [Step 2](#step-2--power-on-and-read-the-screen) and read the screen.

---

## The Intake Sheet

Everything below exists to fill these columns. Each one links to the command that produces it.

| Column | Where it comes from |
|---|---|
| [Name](#name) | Family — MacBook Pro / MacBook Air / MacBook |
| [Serial](#serial) | `ioreg -l \| grep -i IOPlatformSerialNumber` |
| [Identifier](#identifier) | `sysctl -n hw.model` |
| [Model](#model) | A-number — chassis engraving, or look up the Identifier |
| [Battery](#battery) | `ioreg -rc AppleSmartBattery` — health % and cycle count |
| [Year](#year) | Derived from the Identifier |
| [RAM](#ram) | `sysctl -n hw.memsize` |
| [HD](#hd) | `diskutil info disk0` |
| [CPU](#cpu) | `sysctl -n machdep.cpu.brand_string` |
| [Physical Issues](#physical-issues) | Visual inspection — [Step 1](#step-1--physical-inspection) |
| [Functional Issues](#functional-issues) | Power-on checks and Apple Diagnostics — [Step 1](#step-1--physical-inspection) |
| [Firmware Locked](#firmware-locked) | `firmwarepasswd -check` (Intel only) |
| [OS Reset](#os-reset) | Disk Utility → Erase — [Step 9](#step-9--disk-utility) |
| [Processed At](#processed-at--ingested-by) | Manual — date/time you finished |
| [Ingested By](#processed-at--ingested-by) | Manual — your name |

**Name**, **Model**, and **Year** are all derived from the Identifier. Get `hw.model` first and the [MacBook Model Lookup](/) fills in the rest.

---

## Steps at a Glance

1. [**Physical Inspection**](#step-1--physical-inspection) — cosmetic condition, visual model clues, power-on checks. → *Physical Issues, Functional Issues*
2. [**Power On and Read the Screen**](#step-2--power-on-and-read-the-screen) — five possible screens, each routing somewhere different.
3. [**Firmware Password**](#step-3--firmware-password-intel-only) — only if you hit a padlock. Intel only. → *Firmware Locked*
4. [**Enter Recovery**](#step-4--enter-recovery) — Cmd+R on Intel, power-hold on Apple Silicon.
5. [**Select the Disk and Volume**](#step-5--select-the-disk-and-volume) — pick a volume, or find out there isn't one.
6. [**Run the Intake Commands**](#step-6--run-the-intake-commands) — Terminal. → *Name, Serial, Identifier, Model, Year, RAM, HD, CPU*
7. [**Battery Health**](#step-7--battery-health) — `ioreg` in Recovery, `system_profiler` when booted. → *Battery*
8. [**Activation Lock and MDM**](#step-8--activation-lock-and-mdm) — the two things that make a unit unsellable.
9. [**Disk Utility**](#step-9--disk-utility) — verify capacity, check SMART, erase. → *OS Reset*
10. [**Finish the Sheet**](#step-10--finish-the-sheet) — fill gaps, flag blockers.

Reference sections at the bottom: [Column Index](#reference--column-index) (every command, keyed to the sheet column it fills) and [Apple Silicon vs Intel](#reference--apple-silicon-vs-intel).

Related: [Terminal commands](/#terminal) · [RAM size reference](/#sizes) · [Model lookup](/)

---

## Step 1 — Physical Inspection

### Before Powering On

Record for the **Physical Issues** column:

- Cosmetic condition (dents, scratches, scuffs)
- Screen damage — cracks, delamination, stains
- Keyboard condition — missing, sticky, or worn keys
- Missing screws
- Signs of liquid damage
- Engraving/stickers
- Charger included?
- SSD removed?

### Visual Identification Clues

These narrow the model before you can run a single command — useful when the device won't boot at all.

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

The A-number is engraved on the bottom of the chassis — that's the **Model** column, and it's readable without powering the unit on. See [Model](#model).

### Power-On Checks

Record for the **Functional Issues** column:

- Does it power on?
- Does it chime? (Intel only — Apple Silicon Macs don't chime)
- Backlight?
- Trackpad click?
- Fan spin?
- Display uniform, no dead pixels or backlight bleed?

For anything you can't confirm by eye, run Apple Diagnostics — it needs no OS and no password:

- **Intel:** power on holding **D**
- **Apple Silicon:** hold power until "Loading startup options", then press **Cmd+D**

Note the reference codes it returns; they go in **Functional Issues**.

**Next →** [Step 2 — Power On and Read the Screen](#step-2--power-on-and-read-the-screen)

---

## Step 2 — Power On and Read the Screen

Whatever the Mac shows first tells you which path you're on. Find your screen below.

```text
Power on
   │
   ├─ Padlock + password field ......... Scenario E → Step 3 (firmware password)
   ├─ macOS Utilities window ........... Scenario D → Step 5 (already in Recovery)
   ├─ Hello / Setup Assistant .......... Scenario A → Step 4
   ├─ Someone's desktop / logged in .... Scenario B → Step 6 (booted, best case)
   ├─ Login screen, password unknown ... Scenario C → Step 4
   └─ Nothing / no display ............. Apple Diagnostics, then Step 4
```

### Scenario A — Welcome / Setup Screen

Country selection, the Hello animation, or Setup Assistant.

1. **Do not complete setup.** Creating an account here costs time and has to be undone later.
2. Note whether Setup Assistant asks for a previous owner's Apple ID — that means **Activation Lock is on**, and it's the only way to read lock state without booting. See [Step 8](#step-8--activation-lock-and-mdm).
3. Note whether a **Remote Management** screen appears — that means DEP/MDM supervision.
4. Boot into Recovery instead.

**Next →** [Step 4 — Enter Recovery](#step-4--enter-recovery)

### Scenario B — Existing User Desktop

Already logged in, or the password is known. This is the best case: every command works and battery data is reliable.

1. Apple menu → About This Mac for fast identification.
2. Open Terminal (`/Applications/Utilities/Terminal.app`) and run the intake commands.
3. Use `system_profiler SPPowerDataType` for battery — no unit interpretation needed.

**Next →** [Step 6 — Run the Intake Commands](#step-6--run-the-intake-commands)

### Scenario C — Locked / Unknown Password

Login screen with no usable credentials.

1. Boot Recovery and gather hardware data — none of it needs the account password.
2. Evaluate [Activation Lock / MDM status](#step-8--activation-lock-and-mdm) before planning an erase.

**Next →** [Step 4 — Enter Recovery](#step-4--enter-recovery)

### Scenario D — Boots Straight Into Recovery

The Mac goes directly to the **macOS Utilities** window without you holding any keys. You didn't do anything wrong — the Mac couldn't find a bootable system and fell back to recoveryOS on its own.

Three causes, distinguishable in [Step 5](#step-5--select-the-disk-and-volume):

| What you'll find | Cause |
|---|---|
| Disk Utility shows a healthy disk with no `Macintosh HD` volume | Previously erased — normal for a wiped trade-in |
| A `Macintosh HD` volume exists but won't boot | Corrupt system volume — try First Aid |
| No internal physical disk listed at all | SSD failed or was removed — flag it, this is a parts unit |

You're already where Step 4 was trying to get you, so skip it.

**Next →** [Step 5 — Select the Disk and Volume](#step-5--select-the-disk-and-volume)

### Scenario E — Padlock and a Password Field

A grey padlock icon above a single password box, appearing *instead of* the Apple logo. This is a **firmware password**, and it blocks Recovery, external boot, and startup-disk changes until it's entered.

**Intel only.** Apple Silicon has no firmware password — if you see a password prompt on an M-series Mac it's FileVault or the account password, not firmware.

Record **Firmware Locked = Yes** and go clear it.

**Next →** [Step 3 — Firmware Password](#step-3--firmware-password-intel-only)

---

## Step 3 — Firmware Password (Intel only)

Skip this step unless you hit the padlock in [Scenario E](#scenario-e--padlock-and-a-password-field).

A firmware password lives in the Mac's firmware, not on the disk — erasing the drive does not remove it. **Intel-based Macs only** (pre-T2 and T2). Apple moved this functionality into recoveryOS on Apple Silicon, gated by FileVault, so there's nothing to unlock on an M-series Mac.

The firmware password itself is supplied separately and is never stored in this doc.

### Getting Past It

Enter the firmware password at the padlock prompt. You can't reach the removal tools otherwise.

### Removing It

Two ways, both requiring the password. Pick by whether the Mac has a working admin account.

**Terminal (Recovery) — works even with no macOS account.** Use this when the disk is wiped or unknown, or when the GUI throws "no admin found." It authenticates against the firmware password itself, not a macOS account.

```bash
# Recovery → Utilities menu → Terminal (already root, no sudo needed)
firmwarepasswd -check     # confirm a password is set
firmwarepasswd -delete    # prompts for the current password, then clears it
```

Restart, then re-run `firmwarepasswd -check` to confirm it reports no firmware password set. Record **Firmware Locked = Cleared**.

**GUI Startup Security Utility — needs a macOS admin account.** Recovery → Utilities → **Startup Security Utility** → **Turn Off Firmware Password**.

> **"No admin found" / can't authenticate:** Startup Security Utility asks for the *installed macOS admin password*, so on a wiped or account-less Mac it dead-ends. Use the Terminal method above instead — it doesn't touch macOS accounts.

The same `firmwarepasswd -delete` flow works on both pre-T2 and T2 Macs when you know the password. A *forgotten* firmware password is a different problem — it needs Apple's reset key or an Apple Configurator erase — and is out of scope here since the password is provided.

**Next →** [Step 4 — Enter Recovery](#step-4--enter-recovery)

---

## Step 4 — Enter Recovery

### Intel Macs

1. Turn the Mac on (or restart it) and **immediately** press and hold **Command (⌘) + R** — start holding right after pressing power, before/during the startup chime, not after the screen lights up.
2. Keep holding both keys until the **Apple logo or a spinning globe** appears, then release. Don't let go at the chime — too early and it boots normally.
3. Wait for the **macOS Utilities** window to load.

Related combinations, held the exact same way — press immediately, release at the Apple logo/globe:

- **Command + R** — built-in Recovery; the latest macOS that was installed on this Mac.
- **Option + Command + R** — internet Recovery; upgrades to the latest macOS this Mac supports.
- **Option + Shift + Command + R** — internet Recovery; the macOS the Mac shipped with (or the closest still available).
- **Option** — Startup Manager, the boot-device picker. See [Step 5](#step-5--select-the-disk-and-volume).

If a padlock prompt appears instead of the Apple logo, that's a firmware password — go to [Step 3](#step-3--firmware-password-intel-only).

### Apple Silicon

1. Press and hold the power button until **"Loading startup options"** appears.
2. Release the power button.
3. Click **Options**, then **Continue**.
4. If prompted, select a volume and enter the admin password.

The screen you land on at step 3 is the boot-device picker — the Apple Silicon equivalent of Startup Manager.

**Next →** [Step 5 — Select the Disk and Volume](#step-5--select-the-disk-and-volume)

---

## Step 5 — Select the Disk and Volume

Recovery asks *which disk* before it lets you do anything. On an unknown machine this prompt is a data point, not an obstacle — what's offered tells you the state of the drive.

### The Boot-Device Picker

**Intel — Startup Manager.** Power on holding **Option (⌥)**. Every bootable device appears as an icon: internal volumes, external drives, `Recovery`, and `Network` if internet Recovery is available.

**Apple Silicon — Options screen.** Hold power until "Loading startup options". The same picker, plus the **Options** gear that leads to recoveryOS.

Blocked by a firmware password on Intel — see [Step 3](#step-3--firmware-password-intel-only). On Apple Silicon, external boot additionally requires lowering to **Reduced Security** in Startup Security Utility plus admin auth.

### "Select the volume you want to recover"

Recovery shows this when more than one system volume exists, or on Apple Silicon before unlocking an encrypted volume.

- **`Macintosh HD` (or a renamed equivalent) is listed** → select it. If it's FileVault-encrypted you'll be asked for a password; you don't need it for hardware intake — cancel out and go to Terminal anyway. Every command in [Step 6](#step-6--run-the-intake-commands) reads hardware, not the disk.
- **Only `Macintosh HD - Data` is listed** → the system volume is missing. Erase and reinstall is the path.
- **Nothing is listed** → see below.

### "Select a user you know the password for"

Apple Silicon and T2 Macs ask this to unlock the disk before giving you Disk Utility's full function.

You do **not** need to satisfy this prompt for intake. Cancel or click back — the **Utilities menu → Terminal** stays available, and every command in [Step 6](#step-6--run-the-intake-commands) works without it. You only need credentials to *erase* a FileVault-protected volume, and only on some macOS versions.

If you can't get past it and the unit must be wiped, note it and handle the erase in [Step 9](#step-9--disk-utility).

### No Volume Offered

The picker is empty, or only `Recovery` appears. Open **Disk Utility** and turn on **View → Show All Devices** — this is the single most important setting in Recovery, and it's off by default.

| Disk Utility shows | Meaning | Action |
|---|---|---|
| Physical disk, no volumes under it | Erased — a clean wiped unit | Normal. Record capacity, reinstall if required |
| Physical disk, volumes present but greyed out | Encrypted or corrupt container | Run First Aid — [Step 9](#step-9--disk-utility) |
| No internal physical disk at all | SSD removed or failed | Flag as a parts unit. Record **HD = none** |

On pre-2016 MacBook Pros the SSD is removable, so "no disk" often means it was pulled before intake — check the **SSD removed?** note from [Step 1](#step-1--physical-inspection).

**Next →** [Step 6 — Run the Intake Commands](#step-6--run-the-intake-commands)

---

## Step 6 — Run the Intake Commands

Open Terminal: **Recovery → Utilities menu → Terminal**. (Disk Utility is in the main macOS Utilities window; Terminal is only in the menu bar.)

Booted into macOS instead? Use `/Applications/Utilities/Terminal.app` — everything below works there too, and more reliably.

Run these six in order. They fill eight columns.

```bash
sysctl -n hw.model                                # → Identifier (then Name, Model, Year)
ioreg -l | grep -i '"product-name"'               # → Name
sysctl -n machdep.cpu.brand_string                # → CPU
sysctl -n hw.memsize                              # → RAM
diskutil info disk0 | grep "Disk Size"            # → HD
ioreg -l | grep -i IOPlatformSerialNumber         # → Serial
```

Full detail and per-column caveats: [Column Index](#reference--column-index).

### The Identifier Is the Key

`sysctl -n hw.model` is the one value you always get, on every Mac, in every state. Record it exactly as surfaced — `MacBookAir8,1`, no spaces around the comma, matching the original casing — then paste it into the **Identifier** filter on the [Model Lookup](/) to derive **Name**, **Model**, and **Year** without touching the machine again.

### Apple Silicon Doesn't Give You a Model or CPU the Way Intel Does

On an Intel Mac the CPU is a distinct part you record separately — `sysctl -n machdep.cpu.brand_string` returns `Intel(R) Core(TM) i5-8210Y CPU @ 1.60GHz` and you pull the processor number `i5-8210Y` out of it. Two Macs sharing one Identifier can carry different CPUs, so the field carries real information.

On Apple Silicon none of that holds:

- **There is no CPU SKU.** The command returns `Apple M3 Pro` — a chip name, not a part number. It's already implied by the Identifier. Record the chip name and move on; there's nothing to parse.
- **The Identifier stops naming the family.** Intel Macs report `MacBookPro15,2` — you can read "MacBook Pro" straight off it. M-series Macs report `Mac15,6`, which names nothing. Use `ioreg -l | grep -i '"product-name"'` to get the family, or look the Identifier up.
- **There's no Intel-style model distinction.** The A-number is still engraved on the chassis, but configurations don't vary the way Intel's did — derive it from the Identifier.

Confirm which era you're on with `uname -m`: `arm64` = Apple Silicon, `x86_64` = Intel.

**Next →** [Step 7 — Battery Health](#step-7--battery-health)

---

## Step 7 — Battery Health

### If You're Booted Into macOS

Use this. It reports a percentage directly — no unit interpretation, no version drift.

```bash
system_profiler SPPowerDataType
# if command not found:
/usr/sbin/system_profiler SPPowerDataType
```

Read off **Cycle Count**, **Maximum Capacity**, and **Condition**. Done — skip to [Step 8](#step-8--activation-lock-and-mdm).

### If You're in Recovery

Recovery on Apple Silicon often can't run `system_profiler SPPowerDataType` cleanly, so read the battery controller directly:

```bash
ioreg -rc AppleSmartBattery | egrep "DesignCapacity|MaxCapacity|CycleCount"
```

`DesignCapacity`, `MaxCapacity`, and `CycleCount` are field names in the output — each line reports the key followed by its value, e.g. `"MaxCapacity" = 6200`. On Apple Silicon the same command also surfaces an `AppleRawMaxCapacity` line (the `MaxCapacity` pattern matches it as a substring); you'll need it below.

### Interpret the Capacity Values

The unit `MaxCapacity` uses depends on the Mac. **Read the output, not the model**, to tell which case you're in:

- **`MaxCapacity` in the thousands (typically 4000–8000), no `AppleRawMaxCapacity` line** → **pre-T2 Intel (2017 & older)**. `MaxCapacity` is raw mAh; compute health with the formula below.
- **`MaxCapacity` ≤ 100** → it's a normalized 0–100 percentage, reported by both **T2 Intel and Apple Silicon**. Handle the two differently:
  - **T2 Intel (2018–2020):** record that percentage directly as battery health.
  - **Apple Silicon (M1+, 2020+):** **don't trust the percentage** — on these Macs `MaxCapacity` is commonly pinned at or near 100 and ignores real wear. Use the `AppleRawMaxCapacity` line (raw mAh) and compute health with the formula below.

To confirm the era rather than infer it from the output, see [Apple Silicon vs Intel](#reference--apple-silicon-vs-intel).

### Battery Health Formula

Whenever you have a raw mAh value — `MaxCapacity` on pre-T2 Intel, `AppleRawMaxCapacity` on Apple Silicon — divide it by `DesignCapacity` and multiply by 100. This is arithmetic on two numbers, not a command to run:

```text
(raw mAh value) / (DesignCapacity value) * 100
```

Examples:

```text
Pre-T2 Intel:   MaxCapacity 6200 / DesignCapacity 6900          = ~90%
Apple Silicon:  AppleRawMaxCapacity 4100 / DesignCapacity 4380  = ~94%
T2 Intel:       MaxCapacity = 89 (already a percentage)          → 89%
```

Compare the cycle count against the model's rated maximum — the **Battery** column on the [Model Lookup](/) carries it (almost every notebook since Mid-2009 is rated for 1000 cycles; older ones for 300–500).

### If the Data Is Missing

Recovery battery reporting is unreliable on T2 and some Apple Silicon Macs — expect occasional missing or incomplete values. Recovery intentionally loads a reduced environment: hardware identification works well, battery telemetry may not, because it depends on power-management services, SMC communication, and OS-level frameworks that recoveryOS doesn't fully start.

Escalation path, cheapest first:

1. Re-run the `ioreg` command — it intermittently returns partial output on first call.
2. Boot normally and use an existing account if one is available.
3. Otherwise create a temporary local account, run `system_profiler SPPowerDataType`, then remove the account or erase the machine in [Step 9](#step-9--disk-utility).

> **Rule of thumb: `ioreg` in Recovery, `system_profiler SPPowerDataType` everywhere else.** When you do parse `ioreg`, target each key by name (`DesignCapacity`, `MaxCapacity`, `AppleRawMaxCapacity`, `CycleCount`) rather than by output ordering — Apple has quietly renamed and added these fields between macOS releases.

**Next →** [Step 8 — Activation Lock and MDM](#step-8--activation-lock-and-mdm)

---

## Step 8 — Activation Lock and MDM

These two decide whether the unit is sellable at all. Both are **booted checks** — neither works in Recovery.

### Activation Lock

Booted into macOS, via Terminal:

```bash
system_profiler SPHardwareDataType | grep -i "activation"
```

Returns `Activation Lock Status: Enabled` or `Disabled` on T2 Intel and Apple Silicon. Same value appears in System Settings → General → About.

If **Enabled**, the machine cannot be resold or fully wiped without the original owner's Apple ID. Stop intake and flag it.

**This does not work in Recovery.** The field is populated by the running OS, so `system_profiler` in recoveryOS usually returns nothing — an empty result there tells you nothing about lock state. If you can't boot macOS, judge Activation Lock from Setup Assistant instead: being prompted to sign in with the previous owner's Apple ID during activation means the device is locked.

> **Pre-T2 Intel Macs (2017 and older) do not support Activation Lock.** The command returns nothing on those machines — that's expected, not a clean bill of health. Confirm the era from [Apple Silicon vs Intel](#reference--apple-silicon-vs-intel) before interpreting an empty result.

### MDM Enrollment

Booted into macOS, via Terminal:

```bash
profiles status -type enrollment
```

Look for:

- `Enrolled via DEP: Yes` — the device re-enrolls automatically after a wipe. Treat as MDM-locked.
- `MDM enrollment: Yes` — currently managed. (The field is singular in the output; a clean machine reports `No` for both lines.)

The `profiles` binary **does not exist in recoveryOS** — running it there gives "command not found."

Visual cue, no login needed: if Setup Assistant shows a **Remote Management** screen, the device is DEP-supervised.

If DEP-enrolled, the original org must release it from their MDM before resale.

**Next →** [Step 9 — Disk Utility](#step-9--disk-utility)

---

## Step 9 — Disk Utility

Open it from the **macOS Utilities** window (not the Utilities menu — that's where Terminal lives). This is where the **HD** and **OS Reset** columns get settled.

### First: View → Show All Devices

Disk Utility defaults to **Show Only Volumes**, which hides the physical disk and shows only the mounted volumes inside it. That's why capacity often looks wrong — a volume in an APFS container reports the container's shared free space, not the drive's size.

Turn on **View → Show All Devices** before reading anything. The sidebar then nests correctly:

```text
APPLE SSD AP0512Z          ← physical device: read capacity + SMART here
  └─ Container disk1       ← APFS container
       ├─ Macintosh HD          ← system volume
       └─ Macintosh HD - Data   ← user data volume
```

### Verify Capacity (HD)

Select the **physical device** row — the top-level one with the SSD's model name. Read **Capacity**, and cross-check it against `diskutil info disk0` from [Step 6](#step-6--run-the-intake-commands). Round up to the nearest standard size; see [HD](#hd) for the table.

### Check SMART Status

The physical device row also shows **S.M.A.R.T. status**. `Verified` is healthy; `Failing` means refurb-or-parts only, and belongs in **Functional Issues**.

### Run First Aid

Select the container, then each volume, and run **First Aid** on each. Run it bottom-up — volumes first, then the container, then the physical device. Errors it can't repair mean the volume needs erasing.

This is the fix to try when [Step 5](#step-5--select-the-disk-and-volume) found a `Macintosh HD` that exists but won't boot.

### Erase (OS Reset)

Only after [Step 8](#step-8--activation-lock-and-mdm) comes back clean. **Erasing does not clear Activation Lock or DEP enrollment** — a locked machine erased is still a locked machine, now with no OS on it.

> **Don't erase the whole physical disk on T2 or Apple Silicon Macs.** Select the **`Macintosh HD` volume group** and use *Erase Volume Group*. Erasing the physical device on these machines destroys the container that holds recoveryOS, and recovering from that needs internet Recovery or an Apple Configurator revive.

On pre-T2 Intel, erasing the physical device is safe. Use:

- **Format:** APFS (macOS 10.13+) or Mac OS Extended (Journaled) for older
- **Scheme:** GUID Partition Map — only offered when erasing the physical device
- **Name:** `Macintosh HD`

Delete any leftover extra volumes or containers with the **–** button so the unit ships with one clean container. Then reinstall macOS from the macOS Utilities window and record **OS Reset = Yes**.

**Next →** [Step 10 — Finish the Sheet](#step-10--finish-the-sheet)

---

## Step 10 — Finish the Sheet

Walk the columns and confirm each has a value. Anything still blank has a home in the [Column Index](#reference--column-index).

| Column | Filled by |
|---|---|
| Name, Model, Year | Identifier lookup — [Model Lookup](/) |
| Serial, Identifier, RAM, HD, CPU | [Step 6](#step-6--run-the-intake-commands) |
| Battery | [Step 7](#step-7--battery-health) |
| Physical Issues, Functional Issues | [Step 1](#step-1--physical-inspection) |
| Firmware Locked | [Step 3](#step-3--firmware-password-intel-only) — `No` if you never saw a padlock |
| OS Reset | [Step 9](#step-9--disk-utility) |
| Processed At, Ingested By | You |

### Blockers — Stop and Flag

- **Activation Lock: Enabled** — unsellable without the previous owner's Apple ID.
- **Enrolled via DEP: Yes** — re-enrolls into someone else's MDM the moment it goes online.
- **Firmware password you don't have** — needs Apple's reset key or an Apple Configurator erase.
- **SMART: Failing**, or no internal disk detected — parts unit.

Everything else is a grading note, not a blocker.

---

## Reference — Column Index

One entry per intake sheet column. Headers match the column names exactly, so ⌘F for a column name lands here.

The wiki's [Terminal commands](/#terminal) tab carries the same set, organized identically, with example output for each.

### Name

The family: `MacBook Pro`, `MacBook Air`, or `MacBook`.

```bash
ioreg -l | grep -i '"product-name"'
```

```text
"product-name" = <"MacBook Pro (14-inch, Nov 2023)">
```

Works in recoveryOS, where `system_profiler` frequently doesn't. Booted into macOS, `system_profiler SPHardwareDataType` reports the same thing on its **Model Name** line.

Intel Identifiers name the family themselves (`MacBookPro15,2` → MacBook Pro). Apple Silicon ones don't (`Mac15,6` names nothing) — use the command above or look the Identifier up.

### Serial

```bash
ioreg -l | grep -i IOPlatformSerialNumber
```

```text
"IOPlatformSerialNumber" = "RW2D0HDQRJ"
```

Works in Recovery and booted. Also printed on the chassis bottom, and included in `system_profiler SPHardwareDataType` when booted.

### Identifier

```bash
sysctl -n hw.model
```

```text
Mac15,6
```

Record it exactly as surfaced — `MacBookAir8,1`, no spaces around the comma, matching the original casing. The [Model Lookup](/) keys on this exact string, and its **Identifier** filter takes it directly.

This is the highest-value single value on the sheet: **Name**, **Model**, and **Year** all derive from it.

### Model

The A-number — `A1989`, `A2442`. Engraved on the bottom of the chassis next to the regulatory marks, readable without powering the unit on.

If the engraving is worn or the bottom case was replaced, look the [Identifier](#identifier) up on the [Model Lookup](/) and read the **Model Number** column.

> **Apple Silicon:** there's no Intel-style model/CPU split to record. Intel Macs sharing one Identifier could ship different CPUs, so Model and CPU carried separate information. On M-series the Identifier pins the chip, so derive the A-number from the lookup and don't expect the fields to disambiguate anything.

Some rows list an A-number per screen size (`A1278 (13") / A1286 (15")`) — pick by the display size you measured in [Step 1](#step-1--physical-inspection).

### Battery

```bash
# Recovery
ioreg -rc AppleSmartBattery | egrep "DesignCapacity|MaxCapacity|CycleCount"

# Booted into macOS — preferred
system_profiler SPPowerDataType
```

Record health % and cycle count. The unit `MaxCapacity` reports differs by era, and Apple Silicon needs `AppleRawMaxCapacity` instead — full interpretation and the health formula are in [Step 7](#step-7--battery-health).

Rated maximum cycles by model are in the **Battery** column of the [Model Lookup](/).

### Year

Derived from the [Identifier](#identifier) via the [Model Lookup](/) — the **Year** column.

Not reliably available from any command: `sysctl` reports the Identifier, not a release date, and the serial number's date encoding was dropped for randomized serials in 2021.

### RAM

```bash
sysctl -n hw.memsize
```

```text
17179869184
```

Raw **bytes**, not GB. Match the number against the [size reference](/#sizes) rather than doing the math:

| Bytes | RAM |
|---|---|
| 4294967296 | 4 GB |
| 8589934592 | 8 GB |
| 17179869184 | 16 GB |
| 25769803776 | 24 GB |
| 34359738368 | 32 GB |
| 68719476736 | 64 GB |

Apple Silicon reports unified memory here the same way — the number means the same thing, it just isn't upgradeable.

### HD

```bash
diskutil info disk0 | grep "Disk Size"
```

```text
Disk Size: 500.3 GB (500277792768 Bytes)
```

`Disk Size` reports raw formatted capacity, which reads a few percent under the marketed size. Round **up** to the nearest standard capacity:

| Disk Size shows | Record as |
|---|---|
| ~121 GB | 128 GB |
| ~251 GB | 256 GB |
| ~500 GB | 512 GB |
| ~1.0 TB (1000 GB) | 1 TB |
| ~2.0 TB | 2 TB |

Drop the `| grep` to also see **SMART Status** and the SSD's model name. Cross-check in Disk Utility with **Show All Devices** on — see [Step 9](#step-9--disk-utility).

If no internal disk is listed, record **HD = none** and flag the unit.

### CPU

```bash
sysctl -n machdep.cpu.brand_string
```

**Intel** — record the **processor number**, the token right after `Core(TM)`. Drop the `Intel(R) Core(TM)` prefix and the trailing `CPU @ …GHz`:

```text
Intel(R) Core(TM) i5-8210Y CPU @ 1.60GHz   →   record: i5-8210Y
```

**Apple Silicon** — record the chip name as-is. There is no SKU:

```text
Apple M3 Pro   →   record: Apple M3 Pro
```

If the command returns nothing (some recoveryOS builds), derive the chip from the [Identifier](#identifier) via the [Model Lookup](/) — on Apple Silicon the Identifier determines the chip.

Confirm the architecture with `uname -m`: `arm64` = Apple Silicon, `x86_64` = Intel.

### Physical Issues

No command. Visual inspection from [Step 1](#step-1--physical-inspection): cosmetic damage, screen condition, keyboard, missing screws, liquid damage indicators, engraving, missing charger, missing SSD.

### Functional Issues

Power-on checks from [Step 1](#step-1--physical-inspection), plus Apple Diagnostics (Intel: hold **D**; Apple Silicon: hold power → **Cmd+D**) — record any reference codes.

Booted into macOS, these confirm specific subsystems:

```bash
diskutil info disk0 | grep -i smart          # SSD health
system_profiler SPCameraDataType             # camera present?
system_profiler SPAirPortDataType            # Wi-Fi card recognized?
system_profiler SPThunderboltDataType        # ports alive
ls /Library/Logs/DiagnosticReports           # .panic files = failing RAM / board / thermals
```

### Firmware Locked

```bash
firmwarepasswd -check
```

**Intel only.** Run it in Recovery — you're already root, no `sudo` needed. Apple Silicon has no firmware password; record `N/A`.

`No` if you never saw a padlock at boot. If you did, see [Step 3](#step-3--firmware-password-intel-only) for removal.

### OS Reset

Disk Utility → **Erase Volume Group** on `Macintosh HD`, then reinstall macOS from the macOS Utilities window. Full procedure and the T2/Apple Silicon warning: [Step 9](#step-9--disk-utility).

Erasing does **not** clear Activation Lock or DEP enrollment — check [Step 8](#step-8--activation-lock-and-mdm) first.

### Processed At / Ingested By

Manual. Date/time you finished intake, and your name.

---

## Reference — Apple Silicon vs Intel

Confirm the architecture first: `uname -m` (`arm64` = Apple Silicon, `x86_64` = Intel), About This Mac, or the visual cues in [Step 1](#step-1--physical-inspection).

| Aspect | Intel pre-T2 (2017 & older) | Intel T2 (2018–2020) | Apple Silicon (M1+, 2020+) |
|---|---|---|---|
| Recovery entry | Power on holding Cmd+R | Power on holding Cmd+R; may prompt for admin password | Hold power until "Loading startup options" |
| Recovery Terminal | Open access | Disk access may require auth | Requires admin password for boot volume |
| Identifier names the family | Yes — `MacBookPro11,3` | Yes — `MacBookPro15,2` | No — `Mac15,6` |
| CPU field | Intel processor number (`i5-8210Y`) | Intel processor number | Chip name only (`Apple M3 Pro`) — no SKU |
| Battery telemetry in Recovery | `MaxCapacity` in raw mAh; reliable | `MaxCapacity` as percentage; sometimes missing | `MaxCapacity` pinned ~100 — use `AppleRawMaxCapacity` (mAh); sometimes missing |
| Firmware password | Yes | Yes | None — FileVault gates recoveryOS instead |
| Activation Lock | Not supported | Possible (T2 + Apple ID) | Possible (Secure Enclave + Apple ID) |
| External boot | Straightforward | Blocked if firmware password set or external boot disallowed | Requires "Reduced Security" + admin auth |
| Safe to erase whole physical disk | Yes | No — erase the volume group | No — erase the volume group |
| Apple Diagnostics | Power on holding D | Power on holding D | Hold power → Cmd+D from Options screen |
