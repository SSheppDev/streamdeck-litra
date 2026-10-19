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
	syncPowerKeyState,
} from "./power-gestures";

type PowerMultiSettings = Record<string, never>;

@action({ UUID: "com.ssheppdev.litra.powermulti" })
export class PowerMultiAction extends SingletonAction<PowerMultiSettings> {
	private readonly gestures = new PowerGestureController();

	override async onWillAppear(ev: WillAppearEvent<PowerMultiSettings>): Promise<void> {
		await syncPowerKeyState(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent<PowerMultiSettings>): void {
		this.gestures.dispose(ev.action.id);
	}

	override onKeyDown(ev: KeyDownEvent<PowerMultiSettings>): void {
		if (!ev.action.isKey()) {
			return;
		}
		handleMultiKeyDown(this.gestures, ev.action);
	}

	override onKeyUp(ev: KeyUpEvent<PowerMultiSettings>): void {
		if (!ev.action.isKey()) {
			return;
		}
		handleMultiKeyUp(this.gestures, ev.action);
	}
}
