import {
	action,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";

import {
	handleMultiKeyDown,
	handleMultiKeyUp,
	PowerGestureController,
	powerOff,
	powerOn,
	powerToggle,
	syncPowerKeyState,
} from "./power-gestures";

type PowerSettings = {
	mode?: "toggle" | "on" | "off" | "multi";
};

@action({ UUID: "com.ssheppdev.litra.power" })
export class PowerAction extends SingletonAction<PowerSettings> {
	private readonly gestures = new PowerGestureController();

	override async onWillAppear(ev: WillAppearEvent<PowerSettings>): Promise<void> {
		await syncPowerKeyState(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<PowerSettings>): void {
		this.gestures.dispose(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<PowerSettings>): Promise<void> {
		const mode = ev.payload.settings.mode ?? "toggle";
		if (mode === "multi") {
			if (!ev.action.isKey()) {
				return;
			}
			handleMultiKeyDown(this.gestures, ev.action);
			return;
		}

		if (mode === "on") {
			await powerOn(ev.action);
		} else if (mode === "off") {
			await powerOff(ev.action);
		} else {
			await powerToggle(ev.action);
		}
	}

	override onKeyUp(ev: KeyUpEvent<PowerSettings>): void {
		const mode = ev.payload.settings.mode ?? "toggle";
		if (mode !== "multi" || !ev.action.isKey()) {
			return;
		}
		handleMultiKeyUp(this.gestures, ev.action);
	}
}
