import streamDeck from "@elgato/streamdeck";
import {
	Device,
	DeviceType,
	findDevices,
	getAllowedTemperaturesInKelvinForDevice,
	getMaximumBrightnessInLumenForDevice,
	getMinimumBrightnessInLumenForDevice,
	getTemperatureInKelvin,
	isOn,
	setBrightnessPercentage,
	setTemperatureInKelvin,
	toggle,
	turnOff,
	turnOn,
} from "litra";

type ClosableHid = {
	write: (values: number[] | Buffer) => number;
	readSync: () => number[];
	readTimeout: (timeout: number) => number[];
	close: () => void;
};

export type BroadcastResult = {
	ok: boolean;
	deviceCount: number;
	failures: number;
	representativeBrightnessPercentage?: number;
	representativeTemperatureKelvin?: number;
};

const logger = streamDeck.logger;
const DIAL_DEBOUNCE_MS = 60;

function asHid(device: Device): ClosableHid {
	return device.hid as ClosableHid;
}

/**
 * litra write-only commands leave an ACK in the HID buffer. Without draining it,
 * the next readSync (isOn / getBrightness / getTemperature) can return the ACK
 * instead of the query response — especially on Beam LX.
 */
function drainAck(device: Device): void {
	try {
		asHid(device).readTimeout(50);
	} catch {
		// nothing pending
	}
}

/**
 * litra's Device.hid type omits close(); runtime is node-hid HID.
 */
function closeDevice(device: Device): void {
	try {
		asHid(device).close();
	} catch (error) {
		logger.warn(`Failed to close Litra HID handle: ${String(error)}`);
	}
}

function padRight(values: number[], length: number): number[] {
	if (values.length >= length) {
		return values;
	}
	return [...values, ...Array(length - values.length).fill(0)];
}

/**
 * Stock litra getBrightnessInLumen only returns data[5], which truncates Beam LX
 * above 255 lm. Mirror litra-rs / temperature parsing: data[4]*256 + data[5].
 */
export function getBrightnessInLumenSafe(device: Device): number {
	const bytes =
		device.type === DeviceType.LitraBeamLX
			? padRight([0x11, 0xff, 0x06, 0x31], 20)
			: padRight([0x11, 0xff, 0x04, 0x31], 20);
	device.hid.write(bytes);
	const data = device.hid.readSync();
	return data[4] * 256 + data[5];
}

export function lumenToPercentage(lumen: number, min: number, max: number): number {
	if (max <= min) {
		return 0;
	}
	return Math.max(0, Math.min(100, Math.round(((lumen - min) / (max - min)) * 100)));
}

export function snapKelvin(value: number, allowed: number[]): number {
	if (allowed.length === 0) {
		return value;
	}
	let best = allowed[0];
	let bestDelta = Math.abs(value - best);
	for (const candidate of allowed) {
		const delta = Math.abs(value - candidate);
		if (delta < bestDelta) {
			best = candidate;
			bestDelta = delta;
		}
	}
	return best;
}

/**
 * Open devices, run fn per device, always close handles. Zero devices = failure.
 */
export function forEachDevice(fn: (device: Device) => void): BroadcastResult {
	let devices: Device[] = [];
	try {
		devices = findDevices();
	} catch (error) {
		logger.error(`findDevices failed: ${String(error)}`);
		return { ok: false, deviceCount: 0, failures: 1 };
	}

	if (devices.length === 0) {
		logger.warn("No Litra devices found");
		return { ok: false, deviceCount: 0, failures: 1 };
	}

	let failures = 0;
	for (const device of devices) {
		try {
			fn(device);
		} catch (error) {
			failures += 1;
			logger.error(`Litra device operation failed: ${String(error)}`);
		} finally {
			closeDevice(device);
		}
	}

	return {
		ok: failures === 0,
		deviceCount: devices.length,
		failures,
	};
}

export function turnOnAll(): BroadcastResult {
	return forEachDevice((device) => {
		turnOn(device);
		drainAck(device);
	});
}

export function turnOffAll(): BroadcastResult {
	return forEachDevice((device) => {
		turnOff(device);
		drainAck(device);
	});
}

export function toggleAll(): BroadcastResult {
	return forEachDevice((device) => {
		toggle(device);
		drainAck(device);
	});
}

/** On only if at least one device and every device reports on. */
export function isOnAll(): { ok: boolean; allOn: boolean; deviceCount: number } {
	let devices: Device[] = [];
	try {
		devices = findDevices();
	} catch (error) {
		logger.error(`findDevices failed: ${String(error)}`);
		return { ok: false, allOn: false, deviceCount: 0 };
	}

	if (devices.length === 0) {
		return { ok: false, allOn: false, deviceCount: 0 };
	}

	let allOn = true;
	let failures = 0;
	for (const device of devices) {
		try {
			if (!isOn(device)) {
				allOn = false;
			}
		} catch (error) {
			failures += 1;
			allOn = false;
			logger.error(`isOn failed: ${String(error)}`);
		} finally {
			closeDevice(device);
		}
	}

	return { ok: failures === 0, allOn, deviceCount: devices.length };
}

/** Ensure the device is powered on before a brightness change is visible. */
function ensureOn(device: Device): void {
	if (!isOn(device)) {
		turnOn(device);
		drainAck(device);
	}
}

export function setBrightnessAllPercentage(percentage: number): BroadcastResult {
	const pct = Math.max(0, Math.min(100, percentage));
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		ensureOn(device);
		setBrightnessPercentage(device, pct);
		drainAck(device);
		if (representative === undefined) {
			representative = pct;
		}
	});
	return { ...result, representativeBrightnessPercentage: representative };
}

export function adjustBrightnessAllByPercentageSteps(
	ticks: number,
	stepPercentage: number,
): BroadcastResult {
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		ensureOn(device);
		const min = getMinimumBrightnessInLumenForDevice(device);
		const max = getMaximumBrightnessInLumenForDevice(device);
		const lumen = getBrightnessInLumenSafe(device);
		const currentPct = lumenToPercentage(lumen, min, max);
		const nextPct = Math.max(0, Math.min(100, currentPct + ticks * stepPercentage));
		setBrightnessPercentage(device, nextPct);
		drainAck(device);
		if (representative === undefined) {
			representative = nextPct;
		}
	});
	return { ...result, representativeBrightnessPercentage: representative };
}

export function readRepresentativeBrightnessPercentage(): BroadcastResult {
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		if (representative !== undefined) {
			return;
		}
		const min = getMinimumBrightnessInLumenForDevice(device);
		const max = getMaximumBrightnessInLumenForDevice(device);
		representative = lumenToPercentage(getBrightnessInLumenSafe(device), min, max);
	});
	return { ...result, representativeBrightnessPercentage: representative };
}

export function setTemperatureAllInKelvin(kelvin: number): BroadcastResult {
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		const allowed = getAllowedTemperaturesInKelvinForDevice(device);
		const snapped = snapKelvin(kelvin, allowed);
		setTemperatureInKelvin(device, snapped);
		drainAck(device);
		if (representative === undefined) {
			representative = snapped;
		}
	});
	return { ...result, representativeTemperatureKelvin: representative };
}

export function adjustTemperatureAllByKelvinSteps(ticks: number, stepKelvin: number): BroadcastResult {
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		const current = getTemperatureInKelvin(device);
		const allowed = getAllowedTemperaturesInKelvinForDevice(device);
		const snapped = snapKelvin(current + ticks * stepKelvin, allowed);
		setTemperatureInKelvin(device, snapped);
		drainAck(device);
		if (representative === undefined) {
			representative = snapped;
		}
	});
	return { ...result, representativeTemperatureKelvin: representative };
}

export function readRepresentativeTemperatureKelvin(): BroadcastResult {
	let representative: number | undefined;
	const result = forEachDevice((device) => {
		if (representative !== undefined) {
			return;
		}
		representative = getTemperatureInKelvin(device);
	});
	return { ...result, representativeTemperatureKelvin: representative };
}

/** Coalesce dial ticks for a short window, then flush once. */
export function createDialDebouncer(
	flush: (ticks: number) => void | Promise<void>,
	delayMs = DIAL_DEBOUNCE_MS,
): (ticks: number) => void {
	let pending = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	return (ticks: number) => {
		pending += ticks;
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			const batch = pending;
			pending = 0;
			timer = undefined;
			void flush(batch);
		}, delayMs);
	};
}

// --- Beam LX rear RGB (0x8040 / 0x8071 / 0x8081) ---

export type RearEffect =
	| "fixed"
	| "breathing"
	| "color_cycle"
	| "color_wave"
	| "pulsar"
	| "freestyle"
	| "off";

export type RearSpeed = "slow" | "medium" | "fast";
export type RearDirection = "right" | "left";
export type RearZone =
	| "all"
	| "left"
	| "center"
	| "right"
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7";

export type RearSettings = {
	effect?: RearEffect;
	color?: string;
	brightness?: number;
	speed?: RearSpeed;
	direction?: RearDirection;
	zone?: RearZone;
};

const REAR_REPORT_LEN = 20;
const REAR_CLAIM = [0x11, 0xff, 0x0b, 0x5c, 0x01, 0x03, 0x06];
const REAR_ZONE_COMMIT = [0x11, 0xff, 0x0c, 0x7b, 0x00, 0x00, 0x01];

/** G HUB Left / Center / Right quick groups on the seven-zone strip (1 = left). */
const REAR_ZONE_GROUPS: Record<"all" | "left" | "center" | "right", number[]> = {
	all: [1, 2, 3, 4, 5, 6, 7],
	left: [1, 2],
	center: [3, 4, 5],
	right: [6, 7],
};

const REAR_SPEED_MS: Record<RearSpeed, number> = {
	slow: 5000,
	medium: 3000,
	fast: 1500,
};

function writeReport(device: Device, values: number[]): void {
	asHid(device).write(padRight(values, REAR_REPORT_LEN));
	drainAck(device);
}

function clampRearBrightness(value: number | undefined): number {
	const n = Number(value ?? 100);
	if (!Number.isFinite(n)) {
		return 100;
	}
	return Math.max(1, Math.min(100, Math.round(n)));
}

function parseHexColor(
	color: string | undefined,
	fallback: [number, number, number],
	opts?: { minChannel?: number },
): [number, number, number] {
	const min = opts?.minChannel ?? 0;
	const raw = (color ?? "").trim().replace(/^#/, "");
	if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
		return fallback;
	}
	return [
		Math.max(min, parseInt(raw.slice(0, 2), 16)),
		Math.max(min, parseInt(raw.slice(2, 4), 16)),
		Math.max(min, parseInt(raw.slice(4, 6), 16)),
	];
}

function periodBytes(ms: number): [number, number] {
	const clamped = Math.max(0, Math.min(0xffff, Math.round(ms)));
	return [(clamped >> 8) & 0xff, clamped & 0xff];
}

function resolveZones(zone: RearZone | undefined): number[] {
	const key = zone ?? "all";
	if (key === "all" || key === "left" || key === "center" || key === "right") {
		return REAR_ZONE_GROUPS[key];
	}
	const n = Number(key);
	if (n >= 1 && n <= 7) {
		return [n];
	}
	return REAR_ZONE_GROUPS.all;
}

function setRearOn(device: Device, on: boolean): void {
	writeReport(device, [0x11, 0xff, 0x0a, 0x4b, on ? 0x01 : 0x00]);
}

function setRearBrightnessPercentage(device: Device, percentage: number | undefined): void {
	writeReport(device, [0x11, 0xff, 0x0a, 0x2b, 0x00, clampRearBrightness(percentage)]);
}

function setRearZoneColor(device: Device, zoneId: number, r: number, g: number, b: number): void {
	writeReport(device, [0x11, 0xff, 0x0c, 0x1b, zoneId, r, g, b, 0xff]);
	writeReport(device, REAR_ZONE_COMMIT);
}

function claimRearSoftwareControl(device: Device): void {
	writeReport(device, REAR_CLAIM);
}

function writeRearEffect(device: Device, settings: RearSettings): void {
	const effect = settings.effect ?? "pulsar";
	const brightness = clampRearBrightness(settings.brightness);
	const speed = settings.speed ?? "medium";
	const period = REAR_SPEED_MS[speed] ?? REAR_SPEED_MS.medium;
	const [pHi, pLo] = periodBytes(period);
	const direction = settings.direction === "left" ? 0x00 : 0x01;

	let packet: number[];
	switch (effect) {
		case "fixed": {
			const [r, g, b] = parseHexColor(settings.color, [0x00, 0xff, 0xff]);
			// Captured: 11 ff 0b 1c 00 00 00 RR GG BB 02
			packet = [0x11, 0xff, 0x0b, 0x1c, 0x00, 0x00, 0x00, r, g, b, 0x02];
			break;
		}
		case "breathing": {
			const [r, g, b] = parseHexColor(settings.color, [0x00, 0xff, 0xff]);
			// Captured: 11 ff 0b 1c 00 01 00 RR GG BB PP PP 00 BR
			packet = [0x11, 0xff, 0x0b, 0x1c, 0x00, 0x01, 0x00, r, g, b, pHi, pLo, 0x00, brightness];
			break;
		}
		case "color_cycle": {
			packet = [
				0x11, 0xff, 0x0b, 0x1c, 0x00, 0x02, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, pHi, pLo, brightness,
			];
			break;
		}
		case "color_wave": {
			packet = [
				0x11,
				0xff,
				0x0b,
				0x1c,
				0x01,
				0x01,
				0x00,
				0xff,
				0x00,
				0x00,
				0x00,
				0x00,
				pHi,
				pLo,
				brightness,
				direction,
				0x00,
			];
			break;
		}
		case "pulsar":
		default: {
			// Keep captured b8 fc; only brightness (0x64) is user-tunable. Period stays 3000 ms.
			packet = [
				0x11, 0xff, 0x0b, 0x1c, 0x01, 0x02, 0x00, 0xb8, 0xfc, 0x00, 0x00, 0x00, 0x0b, 0xb8, brightness,
				0x00, 0x00,
			];
			break;
		}
	}

	writeReport(device, packet);
}

function writeRearFreestyle(device: Device, settings: RearSettings): void {
	// 0x8081 rejects zero channels; litra-rs clamps each to ≥ 1.
	const [r, g, b] = parseHexColor(settings.color, [0xff, 0xff, 0xff], { minChannel: 1 });
	for (const zoneId of resolveZones(settings.zone)) {
		setRearZoneColor(device, zoneId, r, g, b);
	}
}

/**
 * Beam LX only. Glow / Beam are skipped (their handles are still closed).
 * Zero Beam LX devices = failure.
 */
export function forEachBeamLX(fn: (device: Device) => void): BroadcastResult {
	let devices: Device[] = [];
	try {
		devices = findDevices();
	} catch (error) {
		logger.error(`findDevices failed: ${String(error)}`);
		return { ok: false, deviceCount: 0, failures: 1 };
	}

	const beamLx = devices.filter((device) => device.type === DeviceType.LitraBeamLX);
	for (const device of devices) {
		if (device.type !== DeviceType.LitraBeamLX) {
			closeDevice(device);
		}
	}

	if (beamLx.length === 0) {
		logger.warn("No Litra Beam LX devices found for rear control");
		return { ok: false, deviceCount: 0, failures: 1 };
	}

	let failures = 0;
	for (const device of beamLx) {
		try {
			fn(device);
		} catch (error) {
			failures += 1;
			logger.error(`Litra Beam LX rear operation failed: ${String(error)}`);
		} finally {
			closeDevice(device);
		}
	}

	return {
		ok: failures === 0,
		deviceCount: beamLx.length,
		failures,
	};
}

/** Apply a rear preset, freestyle color, or off to every connected Beam LX. */
export function setRearAll(settings: RearSettings): BroadcastResult {
	const effect = settings.effect ?? "pulsar";

	return forEachBeamLX((device) => {
		if (effect === "off") {
			setRearOn(device, false);
			return;
		}

		setRearOn(device, true);
		setRearBrightnessPercentage(device, settings.brightness);

		if (effect === "freestyle") {
			writeRearFreestyle(device, settings);
			return;
		}

		claimRearSoftwareControl(device);
		writeRearEffect(device, { ...settings, effect });
	});
}
