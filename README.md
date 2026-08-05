# Litra for Stream Deck

Control [Logitech Litra](https://www.logitech.com/) lights from an [Elgato Stream Deck](https://www.elgato.com/streamdeck) — including dials on Stream Deck+.

**Not an official Logitech or Elgato product.**

End users only need Stream Deck software and a USB-connected Litra. There is nothing else to install (no Node, no `litra` CLI, no Homebrew). The plugin ships with its USB HID stack baked in.

Under the hood (for developers): it uses the [`litra`](https://github.com/timrogers/litra) Node library **in-process** over USB HID — no CLI subprocess.

## Features

| Action | Key | Dial (Stream Deck+) |
|--------|-----|---------------------|
| **Power** | On / off / toggle | — |
| **Brightness** | Jump to a preset % | Rotate to adjust; **press toggles power** |
| **Temperature** | Jump to a preset Kelvin | Rotate to adjust; **press toggles power** |

- Works with **all connected Litra devices** at once (no per-light picker yet)
- Beam LX front brightness uses a corrected lumen read (stock JS only used the low byte)
- macOS and Windows (USB; Bluetooth control is not supported by the underlying stack)

## Supported hardware

| Light | Front power / brightness / temperature |
|-------|----------------------------------------|
| Litra Glow | Yes |
| Litra Beam | Yes |
| Litra Beam LX | Yes (front key light) |

**Not included (yet):** Beam LX rear RGB / G HUB effect presets. Research notes are in [`ref/hid-captures/NOTES.md`](ref/hid-captures/NOTES.md).

## Requirements

**To use the plugin (install from Releases)**

- [Stream Deck](https://www.elgato.com/streamdeck) software **7.1+**
- A Litra connected over **USB**
- macOS 12+ or Windows 10+

You do **not** need Node.js, npm, Homebrew, or the `litra` CLI.

Quit **Logitech G HUB** if HID access fights the plugin (especially on macOS).

**To build from source** (contributors only)

- Node.js **20**
- npm

## Install (prebuilt)

1. Download the latest `.streamDeckPlugin` from [Releases](https://github.com/SSheppDev/streamdeck-litra/releases).
2. Double-click the file (or open it with Stream Deck).
3. Drag **Power**, **Brightness**, or **Temperature** onto your layout.

That’s the full end-user install — the package already includes `litra` / `node-hid`.

If you linked a local/dev copy earlier, unlink it first:

```bash
streamdeck unlink com.ssheppdev.litra
```

## Build from source

```bash
git clone https://github.com/SSheppDev/streamdeck-litra.git
cd streamdeck-litra
npm install
npm run build
```

### Link for development

```bash
npm run link   # streamdeck link ./com.ssheppdev.litra.sdPlugin
npm run watch  # rebuild + restart on change
```

### Package a distributable

```bash
npm run pack
```

Writes `release/com.ssheppdev.litra.streamDeckPlugin`.

Validate without packing:

```bash
npm run validate
```

## Usage tips

- **Brightness / temperature keys** show the configured preset as the title.
- **Dials** use Stream Deck’s built-in `$A1` layout; rotate adjusts, press toggles front power.
- With **no lights connected**, actions show Stream Deck’s alert indicator.
- Multiple lights are always controlled together in v1.

## Credits

- [timrogers/litra](https://github.com/timrogers/litra) — HID protocol / Node library
- [Elgato Stream Deck SDK](https://docs.elgato.com/streamdeck)

## Security

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities and this project’s secrets policy.

## License

[MIT](LICENSE)
