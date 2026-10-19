import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
} from "@elgato/streamdeck";

import { RearEffect, RearSettings, setRearAll } from "../litra-manager";

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

function effectTitle(settings: RearSettings): string {
	const effect = settings.effect ?? "pulsar";
	return TITLE_BY_EFFECT[effect] ?? TITLE_BY_EFFECT.pulsar;
}

@action({ UUID: "com.ssheppdev.litra.rear" })
export class RearAction extends SingletonAction<RearSettings> {
	override async onWillAppear(ev: WillAppearEvent<RearSettings>): Promise<void> {
		await this.refreshTitle(ev.action, ev.payload.settings);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RearSettings>): Promise<void> {
		await this.refreshTitle(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<RearSettings>): Promise<void> {
		const result = setRearAll(ev.payload.settings);
		if (!result.ok) {
			await ev.action.showAlert();
			return;
		}
		await this.refreshTitle(ev.action, ev.payload.settings);
	}

	private async refreshTitle(action: ActionRef, settings: RearSettings): Promise<void> {
		if (!action.isKey()) {
			return;
		}
		await action.setTitle(effectTitle(settings));
	}
}
