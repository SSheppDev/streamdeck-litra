# Litra Beam LX back-light research

**Status:** The five named rear presets can be set without G HUB (verified 2026-10-19): Fixed, Breathing, Color Cycle, Color Wave, Pulsar Point. Reading the active preset is still not possible.  
**Hardware:** 2× Litra Beam LX (`046d:c903`). Serial numbers report `UNKNOWN`. Address each light with the `DevSrvsID:…` path from `litra devices` (the id changes after replug).  
**Host:** macOS. July captures were with G HUB running. The October checks were with only `lghub_updater` running, not `lghub_agent`.  
**Plugin v1:** front white light only (`com.ssheppdev.litra`). The effect writes below are not in the plugin yet.

This folder (`ref/hid-captures/`) holds raw JSON captures, Frida hook scaffolding, and this note. Upstream clones stay in `ref/litra` / `ref/litra-rs` (gitignored).

---

## Verified control (2026-10-19)

`litra` 3.3.0 (`/opt/homebrew/bin/litra`) covers the front light and the rear on/off, brightness, and solid color. Native animations are HID++ feature `0x8071` at feature index `0x0B` on this firmware. A solid color replaces an animation. An animation write does not go through `litra back-color`.

| Control | Command | Seen on these lights |
|---|---|---|
| Front power, brightness, temperature | `litra on`, `brightness`, `temperature` | Both lights reported on, 141/400 lm, 3800 K, before later tests turned the fronts off |
| Rear on / brightness | `litra back-on`, `back-brightness` | Yes. Raising the Pulsar light from 1% to 100% left Pulsar running |
| Solid rear color, optional zone 1–7 | `litra back-color` | Yes. One light went solid red while the other stayed on Pulsar |
| Color Wave | HID++ below | Yes. Rainbow, then one button press stepped it to Pulsar |
| Pulsar Point | HID++ below | Yes. Left light matched the right light, which was already on Pulsar |
| Same Pulsar slot, other parameters | HID++ below | Turns the rear dark |
| Which preset is running | GET `0x8071` | No. Both clusters still report effect index `0` while Pulsar is visible |
| Fixed, Breathing, Color Cycle | HID++ below | Yes. Left light showed solid cyan, then a pulse, then a color cycle, then returned to Pulsar |
| Screen Sampler (`0x0013` candidate) | Not sent | Host-driven. The light does not sample the screen by itself |
| Survives replug, sleep, or reboot | — | Not retested. The writes below used a volatile persist byte |

G HUB screen-sampling LIGHTSYNC is a different feature. These commands select the light’s own effect. They do not sample the screen.

### Packets

Long HID++ report, report id `0x11`, device index `0xFF`, feature index `0x0B`, software id `0xC`. A SET without the claim is rejected: `11 ff ff 0b 1c 05`.

Claim software control (OpenRGB `SetSWControl(3, 6)`), then set the effect. Send each report to one device path. Do not leave a second program holding the HID device.

```text
11 ff 0b 5c 01 03 06
```

Color Wave, cluster 1, effect index 1, id `0x0016`. Saturation `0xFF`, period `0x1388` (5000 ms), brightness `100`, direction `1` (right). This matches the OpenRGB `0x0016` layout and the button report from the rainbow step.

```text
11 ff 0b 1c 01 01 00 ff 00 00 00 00 13 88 64 01 00
```

Pulsar Point, cluster 1, effect index 2, id `0x0018`. Period `0x0BB8` (3000 ms), brightness `0x64`. The `b8 fc` bytes came from the button. Replaying the report without them turns the rear dark.

```text
11 ff 0b 1c 01 02 00 b8 fc 00 00 00 0b b8 64 00 00
```

Dark / off variant of that same slot, also captured from a button press and confirmed by replay:

```text
11 ff 0b 1c 01 02 00 00 00 0b b8 00 0b b8 64 00 00
```

`0x0018` is the slot. The parameter block chooses Pulsar versus dark. The meaning of `b8 fc` was not decoded; copy it.

### How the button reports were taken

G HUB’s agent was not running. The left light was solid red. The right light stayed on Pulsar and was only read, plus one brightness change. Listening on the left light’s HID++ interface showed a `0x8071` ClusterChanged event (`byte 3 = 0x20`) for each press:

| What the left light did | Event |
|---|---|
| First press looked off | `11 ff 0b 20 01 02 00 00 00 0b b8 00 0b b8 64 00` |
| Next press was a visible RGB effect | `11 ff 0b 20 01 01 00 ff 00 00 00 00 13 88 64 01` (Color Wave) |
| From that rainbow, one press landed on Pulsar | `11 ff 0b 20 01 02 00 b8 fc 00 00 00 0b b8 64 00` |

The host SET uses `0x1C` (function 1) with the same cluster, effect index, and parameter bytes as the event. The event itself is not the write.

A read-only pass of feature indexes `0`–`12`, function 0, while one light was red and the other was on Pulsar, differed only in feature index `2` (`0x0003`, per-unit firmware identity). The active preset is still not in that GET surface.

### Outside references checked the same day

| Source | What it contributes |
|---|---|
| `litra` 3.3.0 / `timrogers/litra-rs` | Front light and rear on, brightness, zone color. No effect command. Commits after the backlight work are dependency bumps. |
| `dxther/ha-litra` | Same rear byte sequences as litra-rs, including the `0x8081` commit. No effects. |
| OpenRGB `RGBController_LogitechHIDPP20.cpp` | Names `0x0016` Color Wave and `0x0015` Spectrum Cycle. Does not name `0x0018` or `0x0013`. The Color Wave parameter layout matched the button. |
| `libratbag` `hidpp20.h` | Generic ids only through `0x000C` (fixed, cycle `0x0003`, wave `0x0004`, breathing `0x000A`). |
| `nenych/beamctl` | Same rear color commands plus a static preset file. Not installed. |
| GlowWorm | Documents solid, pulsing, cycling, and color wave. Does not document Pulsar Point. Not installed. |

### G HUB control surface

Screenshots of G HUB for “LITRA BEAM LX - L” on 2026-10-19 show three LIGHTSYNC modes. Only Presets map onto the six firmware effects. Freestyle and Animations are ways of painting the seven zones.

**Presets.** One effect, brightness 0–100:

| G HUB name | Firmware id | Cluster, index | Visual |
|---|---|---|---|
| Fixed | `0x0001` | 0, 0 | Confirmed. Solid cyan |
| Breathing | `0x000A` | 0, 1 | Confirmed. Cyan pulse |
| Color Cycle | `0x0015` | 0, 2 | Confirmed. Cycled colors |
| Color Wave | `0x0016` | 1, 1 | Confirmed. Rainbow |
| Pulsar Point | `0x0018` | 1, 2 | Confirmed, only with the `b8 fc` parameter block |
| Screen Sampler | `0x0013` candidate | 1, 0 | Not sent. This is host-driven: G HUB samples the display and writes zone colors. Selecting the menu item does not make the light sample the screen by itself |

The Fixed, Breathing, and Color Cycle packets sent to the left light (`DevSrvsID:4299191912`) at 15:54 UTC, eight seconds apart, all returned a normal `11 ff 0b 1c` ack. The light was then returned to Pulsar. The sequence matched: solid cyan, a pulse, a color cycle, then Pulsar.

```text
11 ff 0b 1c 00 00 00 ff ff 02
11 ff 0b 1c 00 01 00 ff ff 0b b8 00 64
11 ff 0b 1c 00 02 00 ff 00 00 00 00 13 88 64
```

Fixed is cyan (`00 FF FF`) plus the OpenRGB fixed-color marker `02`. Breathing is the same cyan, period 3000 ms, brightness 100. Color Cycle is saturation `FF`, period 5000 ms, brightness 100.

**Freestyle.** A single color across the seven rear zones, or per zone. The on-screen bar has seven dots. Quick groups are Left, Center, Right, and All. This is the `0x8081` zone write `litra back-color` already does (`--zone` 1–7). It replaces whatever preset is running. Which zone numbers sit in Left versus Center versus Right was not measured.

**Animations.** Saved G HUB sequences, not firmware effects. The list in the screenshot was Contrast, Lightning, Ocean Wave, Red White and Blue, Verticol, and Add New Animation. Playback is Cycle, Reverse Cycle, Bounce, or Random, with a speed in milliseconds (200 ms shown). G HUB plays those by streaming zone colors. They are not in the `0x8071` catalog. A Stream Deck action can recreate a short sequence by stepping `back-color` per zone; it cannot load G HUB’s saved animation files.

Stream Deck coverage that matches what the hardware will do on its own: front power / brightness / temperature, rear power / brightness, the five named presets above, and freestyle color per zone or quick group. Screen Sampler and the Animations library stay in G HUB unless something else samples the screen or plays the frames.

---

## July 2026 result

Superseded for Color Wave and Pulsar Point by the section above. The catalog, the failed G HUB sniff, and the “active effect index stays 0” finding still stand.

| Goal | Outcome |
|------|---------|
| Read which G HUB preset is active (Pulsar Point, Color Wave, …) | **Not available** via device GETs. Rechecked 2026-10-19 with G HUB’s agent quit; still not available |
| Set solid zone colors without G HUB | **Works** (`litra` CLI / `0x8081` zone + commit) |
| Set back on / brightness % | **Works** (`0x8040`, same as litra-rs) |
| Map Pulsar / Color Wave to HID++ effect IDs | **Done 2026-10-19** by capturing button events, not by polling. See above |
| Sniff G HUB HID writes on this Mac | **Blocked** — Hardened Runtime + SIP; agent uses DriverKit HID filter. Not required for these two effects |

---

## What we already ship (v1 — do not regress)

Front **Illumination** (`0x1990` @ feature index `0x06`): power, brightness (lumen/%), color temperature. Implemented in-plugin via npm `litra` + `src/litra-manager.ts` (safe brightness read, HID close, Node 20 packaging). Dial press toggles front power. Back light was out of scope for v1 by design (`ref/scope-001.md`).

---

## Protocol primer (HID++)

- Usage page `0xFF43`, long reports: Report ID `0x11`, device index `0xFF`, 20-byte payload.
- Byte 3 = `(functionId << 4) | softwareId`. Official apps often use softwareId `0xC`; litra-rs uses `0xB`. Both work for many calls.
- Feature **index** (byte 2) is device-specific; resolve via Root `0x0000` / Feature Set `0x0001`.
- Errors: response with feature index `0xFF` (extra `FF` in stream).
- Refs: [cajus/litra-testbed](https://github.com/cajus/litra-testbed), OpenRGB `LogitechProtocolCommon`, libratbag `hidpp20` `0x8071`, litra-rs `set_back_*`.

### Feature map (this Beam LX — 13 features)

| Idx | Feature ID | Name / role |
|----:|------------|-------------|
| 0 | `0x0000` | Root |
| 1 | `0x0001` | Feature Set |
| 2 | `0x0003` | Firmware info |
| 3 | `0x0005` | Device name/type |
| 4 | `0x0011` | (unexplored) |
| 5 | `0x1602` | (unexplored) |
| 6 | `0x1990` | Illumination — **front white** (v1) |
| 7 | `0x1eb0` | hidden/internal |
| 8 | `0x1803` | hidden/internal |
| 9 | `0x1807` | hidden/internal |
| 10 | `0x8040` | Brightness Control — **back on / %** |
| 11 | `0x8071` | RGB Effects — **firmware effect catalog** |
| 12 | `0x8081` | Per-Key Lighting v2 — **7 zone RGB** |

Capture: `hidpp-feature-map-2026-07-13T16-50-50-728Z.json`.

---

## Back power / brightness — `0x8040` @ idx `0x0A`

Aligned with litra-rs / ha-litra:

| Fn | Role | Notes |
|---:|------|-------|
| 0 | Status blob | e.g. `00 64 64 1f 00 01` while on @ 100% |
| 1 | Get brightness % | payload often `[0, pct]` |
| 2 | Set brightness % | `00 <pct>` |
| 3 | Get on | `01` / `00` |
| 4 | Set on | `01` / `00` |

**Verified:** `litra back-on`, `back-brightness --percentage 100`, and matching raw HID. Reliable with or without G HUB for these GETs.

---

## Zone RGB — `0x8081` @ idx `0x0C`

| Fn | Role |
|---:|------|
| 0 | Info / mode byte (`fe` often seen) |
| 1 | Zone color: `zone(1–7), R, G, B, FF, …` (litra-rs SET; RGB channels must be ≥ 1) |
| 7 | Commit after zone writes: `00 00 01` (**required**) |

**Verified without G HUB:**

- `litra back-color --value FF0000` / `00FF00` — user confirmed **solid red**, and **one red + one green** when targeting each `--device-path`.
- Sync in G HUB is separate; our SETs can address devices independently via path.

**Not reliable:**

- Treating `fn1` as a pure GET. Same function is the SET path; probing with incomplete params can **zero** colors or desync the HID read queue.
- Zone “reads” returning `ff ff ff` even when UI showed fixed `#FF0000` under G HUB — do not trust as live framebuffer.
- Rapid / wrong `0x8071` SETs sometimes left a device **back off** or returned empty ACKs / wedged reads (`Cannot write to hid device`). Prefer `litra` CLI for known-good color SETs; unplug/replug if HID wedges.

---

## RGB effects catalog — `0x8071` @ idx `0x0B`

Device reports **2 clusters × 3 effects** (OpenRGB / libratbag layout).

Info dump: `GET_INFO` with `[0xFF, 0xFF]` → cluster count `2`.  
Per cluster: `[cluster, 0xFF]` → metadata; `[cluster, effectIdx]` → effect id / caps / period.

### Cluster 0 (location `1`)

| Effect idx | Effect ID | Meaning |
|-----------:|-----------|---------|
| 0 | `0x0001` | Fixed / ON |
| 1 | `0x000A` | Breathing (OpenRGB) |
| 2 | `0x0015` | Unknown |

### Cluster 1 (location `0xFF`)

| Effect idx | Effect ID | Meaning |
|-----------:|-----------|---------|
| 0 | `0x0013` | Unknown |
| 1 | `0x0016` | Unknown (Color Wave candidate — unproven) |
| 2 | `0x0018` | Unknown (Pulsar candidate — unproven) |

Capture: `rgb-effects-catalog-2026-07-13T16-51-39-170Z.json`.

`SET_LED_EFFECT` is fn1 (OpenRGB `LOGITECH_FP8071_SET_LED_EFFECT`). SW control is fn5 with OpenRGB pattern `[1, 3, control]` (control `5` = SW). Taking SW control can interfere with firmware / G HUB animations.

**Visual mapping (updated 2026-10-19):** `0x0001` Fixed, `0x000A` Breathing, `0x0015` Color Cycle, `0x0016` Color Wave, and `0x0018` with parameters `00 b8 fc 00 00 00 0b b8 64 00` Pulsar Point. The same `0x0018` slot with `00 00 00 0b b8 00 0b b8 64 00` turns the rear dark. `0x0013` is still unconfirmed and is the Screen Sampler candidate. July attempts that wrote the Pulsar slot without the button’s parameter block knocked a rear light off; that part of the warning still applies.

Cluster `effect_index` (byte after cluster id in `[c, 0xFF]` response) stayed `0` for Pulsar Point, Color Wave, and fixed color while G HUB ran — **not a usable live “current preset” signal under G HUB**.

---

## Preset capture campaign (with G HUB)

User switched presets; we dumped status / zones / later `0x8071`:

| Preset | Capture file(s) | Diff vs others |
|--------|-----------------|----------------|
| Pulsar Point | `pulsar-point-*.json`, `pulsar-point-8071-*.json` | Same interesting GETs as Color Wave / fixed |
| Color Wave | `color-wave-*.json` | No effect fingerprint change |
| Fixed `#FF0000` | `fixed-ff0000-*.json` | Zones still read white; only on/bri differed when a lamp was off |

**Conclusion:** named presets are **not** distinguishable on the GET surface we know. That part was rechecked on 2026-10-19. The “G HUB only renders in software” part is not the whole story: with the agent quit, the button emits `0x8071` ClusterChanged events, and a host can SET Color Wave and Pulsar Point on that feature. July polling never saw those writes because G HUB was between us and the device.

---

## Dual-device poll monitor (flip test)

- Script window ~90s, both HID++ interfaces, ~4 Hz poll of on/bri/status/clusters/zoneInfo/control + read drains.
- User confirmed they **flipped** presets during the window.
- Result: **`changeCount: 0`** on both devices (`ghub-monitor-2026-07-13T17-02-05-351Z-summary.json`).
- Empty “events” in that log are false positives (zero-length reads), not HID++ notifications.

**Implication for sync:** lights stay visually synced, but our GETs never moved — G HUB is driving both (or mirroring) **above** the registers we poll. We still don’t know if the write fan-out is 1× or 2× on the wire without a USB sniff.

---

## Why we can’t sniff G HUB writes on this Mac (yet)

1. **`lghub_agent` Hardened Runtime** (`codesign` flags `runtime`) — even `sudo frida -p <agent>` fails: *unable to access process from the current user account*.
2. Agent entitlement: `com.apple.developer.driverkit.userclient-access` → **`com.logi.ghub.hidfilter`** (activated DriverKit HID filter). Traffic may not be plain userspace `IOHIDDeviceSetReport`.
3. **SIP enabled** — Wireshark USB (`XHC20`) needs SIP disabled from Recovery (reboot in + reboot out; cannot toggle from a normal session).
4. Scaffolding left in place for later:
   - `hook-lghub-hid.js` — Frida hooks for IOHID / `write`
   - `capture-ghub-hid.sh` — attach helper (will keep failing until SIP/hardened constraints change)
   - `.venv-frida/` — local frida-tools venv (**gitignored**)

### Resume options for sniffing

| Approach | Cost |
|----------|------|
| Recovery → `csrutil disable` → Wireshark USB → re-enable SIP | Two Recovery reboots; best on-Mac path |
| Linux box/VM + usbmon + USB passthrough | No SIP; cleanest HID capture |
| Skip sniff; implement SET-only back actions | Product path for v2 |

---

## Tooling that worked

- **Raw `node-hid`** probes (this repo’s Node deps).
- **`litra` CLI** (`/opt/homebrew/bin/litra`) — best known-good for `back-on`, `back-brightness`, `back-color` (and `--device-path` / `--zone`).
- **OpenRGB / libratbag / litra-rs / ha-litra / litra-testbed** — protocol documentation, not runtime deps of the plugin.

---

## Capture index

| File | What |
|------|------|
| `pulsar-point-2026-07-13T16-46-38-395Z.json` | Early GET dump, Pulsar |
| `color-wave-2026-07-13T16-47-51-433Z.json` | Early GET dump, Color Wave |
| `fixed-ff0000-2026-07-13T16-48-38-371Z.json` | Early GET dump, fixed red |
| `write-ff0000-then-read-*.json` | Zone SET then GET (still white under G HUB) |
| `hidpp-feature-map-*.json` | Full feature table + probes |
| `effect-slot-scan-*.json` | `0x8071` / `0x8081` param scan |
| `rgb-effects-catalog-*.json` | Cluster/effect ID catalog |
| `pulsar-point-8071-*.json` | Pulsar with cluster state (effect_index still 0) |
| `ghub-monitor-*-summary.json` | Dual poll during flips — **0 changes** (raw `.jsonl` discarded; gitignored) |
| `hook-lghub-hid.js` / `capture-ghub-hid.sh` | Frida attach (blocked on this Mac) |

Raw Frida/monitor `.jsonl` streams and `.venv-frida/` are gitignored — recreate the venv with `python3 -m venv .venv-frida && .venv-frida/bin/pip install frida-tools` if needed.

---

## Recommended next steps (when unpaused)

### Product (v2 back light) — preferred first slice

1. Extend `litra-manager` with raw HID++ (or thin wrappers) for:
   - back on / off / toggle  
   - back brightness %  
   - set all zones + commit (single color); optional `--zone` later  
2. New Stream Deck actions + PI, same broadcast/stateless pattern as front light.  
3. Fixed, Breathing, Color Cycle, Color Wave, and Pulsar Point now have verified SETs (see the 2026-10-19 section). `0x0013` / Screen Sampler still does not.  
4. Document: quit G HUB (or expect fights) when using plugin back RGB; hidfilter/agent may reclaim.

### Research — only if named presets matter

1. **Wireshark USB** after SIP disable, or **Linux usbmon**, while flipping Fixed → Pulsar → Color Wave with sync on/off.  
2. Map captured writes to `0x8071` SET vs `0x8081` zone streams; check whether sync = 2× identical writes.  
3. With G HUB **fully** quit (agent + UI; updater alone is OK), one-effect-at-a-time SET on a single device; user confirms visual; record ID → name. Avoid rapid multi-effect scripts (device wedge risk).  
4. Re-test zone GET only with a dedicated non-destructive method if one is found; until then assume **SET-only** for color.

### Explicit non-goals while paused

- Treating `0x0013` as Screen Sampler until a host write shows the light following the display. Fixed, Breathing, Color Cycle, Color Wave, and Pulsar Point are verified.  
- Relying on Frida against hardened `lghub_agent` without SIP changes.  
- Treating `0x0c 1b` probes as safe color reads.

---

## Open questions

1. Fixed (`0x0001`), Breathing (`0x000A`), Color Cycle (`0x0015`), Color Wave (`0x0016`), and Pulsar Point (`0x0018` plus `00 b8 fc …`) are verified SETs. A solid freestyle color is the `0x8081` zone path, which replaces the animation. `0x0013` is the remaining catalog entry and the Screen Sampler candidate.  
2. Whether synced lights get one USB conversation or two. The two lights here are addressed separately and do not have to show the same effect.  
3. Safe GET for current zone RGB or the active effect (if any). The effect index stayed `0` while Pulsar was visible.  
4. Whether a non-zero persist byte keeps Pulsar across replug, sleep, and reboot. The verified writes were volatile.  
5. Behavior when the plugin and G HUB’s HID agent both run (ownership / flicker).  
6. What `b8 fc` means inside the Pulsar parameter block. Copy the captured bytes until that is known.

---

## Related repo docs

- [`README.md`](../README.md) — public install / build / pack
- `ref/scope-001.md` — v1 scope; back RGB deferred
- `ref/build-001.md` — v1 implementation plan
- Plugin: `src/litra-manager.ts`, actions under `src/actions/`
