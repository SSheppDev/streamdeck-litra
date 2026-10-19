import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";

import { RearEffect, RearSettings, RearZone, setRearAll } from "../litra-manager";

type ActionRef = WillAppearEvent<RearSettings>["action"];

const TITLE_BY_EFFECT: Record<RearEffect, string> = {
	fixed: "Fixed",
	breathing: "Breathe",
	color_cycle: "Cycle",
	color_wave: "Wave",
	pulsar: "Pulsar",
	freestyle: "Color",
	off: "Off",
};

const ZONE_TITLE: Record<RearZone, string> = {
	all: "All",
	left: "Left",
	center: "Center",
	right: "Right",
	"1": "Z1",
	"2": "Z2",
	"3": "Z3",
	"4": "Z4",
	"5": "Z5",
	"6": "Z6",
	"7": "Z7",
};

const FREESTYLE_DEFAULT_COLOR = "#00FFFF";

/** Persist Freestyle fields so the PI and key title always match what a press applies. */
function withFreestyleDefaults(settings: RearSettings): RearSettings {
	if ((settings.effect ?? "pulsar") !== "freestyle") {
		return settings;
	}
	return {
		...settings,
		color: settings.color?.trim() ? settings.color : FREESTYLE_DEFAULT_COLOR,
		brightness:
			settings.brightness === undefined || settings.brightness === null
				? 100
				: Number(settings.brightness),
		zone: settings.zone ?? "all",
	};
}

function freestyleDefaultsMissing(settings: RearSettings): boolean {
	if ((settings.effect ?? "pulsar") !== "freestyle") {
		return false;
	}
	return !settings.color?.trim() || settings.brightness === undefined || !settings.zone;
}

function shortHex(color: string | undefined): string {
	const raw = (color ?? FREESTYLE_DEFAULT_COLOR).trim().replace(/^#/, "");
	const hex = /^[0-9a-fA-F]{8}$/.test(raw)
		? raw.slice(0, 6)
		: /^[0-9a-fA-F]{6}$/.test(raw)
			? raw
			: FREESTYLE_DEFAULT_COLOR.slice(1);
	const r = hex.slice(0, 2);
	const g = hex.slice(2, 4);
	const b = hex.slice(4, 6);
	if (r[0] === r[1] && g[0] === g[1] && b[0] === b[1]) {
		return `#${r[0]}${g[0]}${b[0]}`.toUpperCase();
	}
	return `#${hex.toUpperCase()}`;
}

function zoneTitle(zone: RearZone | undefined): string {
	const key = zone ?? "all";
	return ZONE_TITLE[key] ?? ZONE_TITLE.all;
}

function brightnessTitle(value: number | undefined): number {
	const n = Number(value ?? 100);
	if (!Number.isFinite(n)) {
		return 100;
	}
	return Math.max(1, Math.min(100, Math.round(n)));
}

function effectTitle(settings: RearSettings): string {
	const effect = settings.effect ?? "pulsar";
	if (effect === "freestyle") {
		const hex = shortHex(settings.color);
		const zone = zoneTitle(settings.zone);
		const bri = brightnessTitle(settings.brightness);
		// Two lines fit Stream Deck keys; include % when not full so state is visible.
		return bri === 100 ? `${hex}\n${zone}` : `${hex}\n${zone} ${bri}%`;
	}
	return TITLE_BY_EFFECT[effect] ?? TITLE_BY_EFFECT.pulsar;
}

/** Settings that drive the auto key title (effect name / Freestyle hex+zone[+bri]). */
function titleDriveKey(settings: RearSettings): string {
	const effect = settings.effect ?? "pulsar";
	if (effect !== "freestyle") {
		return effect;
	}
	return [
		effect,
		settings.color ?? "",
		settings.zone ?? "all",
		String(brightnessTitle(settings.brightness)),
	].join("|");
}

@action({ UUID: "com.ssheppdev.litra.rear" })
export class RearAction extends SingletonAction<RearSettings> {
	/** Last title-driving settings per action instance — avoid fighting a custom Title on unrelated updates. */
	private readonly lastTitleDrive = new Map<string, string>();

	override async onWillAppear(ev: WillAppearEvent<RearSettings>): Promise<void> {
		const settings = await this.ensureFreestyleSettings(ev.action, ev.payload.settings);
		await this.refreshTitle(ev.action, settings, true);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RearSettings>): Promise<void> {
		const settings = await this.ensureFreestyleSettings(ev.action, ev.payload.settings);
		await this.refreshTitle(ev.action, settings, false);
	}

	override async onKeyDown(ev: KeyDownEvent<RearSettings>): Promise<void> {
		const settings = withFreestyleDefaults(ev.payload.settings);
		const result = setRearAll(settings);
		if (!result.ok) {
			await ev.action.showAlert();
			return;
		}
		// Only refresh when title-driving settings changed (e.g. freestyle defaults just filled in).
		await this.refreshTitle(ev.action, settings, false);
	}

	private async ensureFreestyleSettings(
		action: ActionRef,
		settings: RearSettings,
	): Promise<RearSettings> {
		const next = withFreestyleDefaults(settings);
		if (freestyleDefaultsMissing(settings)) {
			await action.setSettings(next);
		}
		return next;
	}

	private async refreshTitle(
		action: ActionRef,
		settings: RearSettings,
		force: boolean,
	): Promise<void> {
		if (!action.isKey()) {
			return;
		}
		const key = titleDriveKey(settings);
		const id = action.id;
		if (!force && this.lastTitleDrive.get(id) === key) {
			return;
		}
		this.lastTitleDrive.set(id, key);
		await action.setTitle(effectTitle(settings));
	}
}
