import type { DialAction, KeyAction } from "@elgato/streamdeck";

import { isOnAll, toggleAll, turnOffAll, turnOnAll } from "../litra-manager";

/** Hold duration before a press counts as off. */
export const LONG_PRESS_MS = 450;

/** Max gap between taps for a double-press (on). */
export const DOUBLE_TAP_MS = 320;

type GestureState = {
	longPressTimer?: ReturnType<typeof setTimeout>;
	doubleTapTimer?: ReturnType<typeof setTimeout>;
	pressCount: number;
	longPressFired: boolean;
};

/**
 * Detects single / double / hold on a key via KeyDown + KeyUp.
 * Per-action-id so multiple tiles do not share timers.
 */
export class PowerGestureController {
	private readonly states = new Map<string, GestureState>();

	onKeyDown(actionId: string, onOff: () => void): void {
		const state = this.ensure(actionId);
		state.longPressFired = false;
		clearTimer(state, "longPressTimer");

		state.longPressTimer = setTimeout(() => {
			state.longPressFired = true;
			clearTimer(state, "doubleTapTimer");
			state.pressCount = 0;
			onOff();
		}, LONG_PRESS_MS);
	}

	onKeyUp(actionId: string, onToggle: () => void, onOn: () => void): void {
		const state = this.ensure(actionId);
		clearTimer(state, "longPressTimer");

		if (state.longPressFired) {
			state.longPressFired = false;
			return;
		}

		state.pressCount += 1;
		clearTimer(state, "doubleTapTimer");

		if (state.pressCount >= 2) {
			state.pressCount = 0;
			onOn();
			return;
		}

		state.doubleTapTimer = setTimeout(() => {
			state.pressCount = 0;
			onToggle();
		}, DOUBLE_TAP_MS);
	}

	dispose(actionId: string): void {
		const state = this.states.get(actionId);
		if (!state) {
			return;
		}
		clearTimer(state, "longPressTimer");
		clearTimer(state, "doubleTapTimer");
		this.states.delete(actionId);
	}

	private ensure(actionId: string): GestureState {
		let state = this.states.get(actionId);
		if (!state) {
			state = { pressCount: 0, longPressFired: false };
			this.states.set(actionId, state);
		}
		return state;
	}
}

function clearTimer(state: GestureState, key: "longPressTimer" | "doubleTapTimer"): void {
	const timer = state[key];
	if (timer !== undefined) {
		clearTimeout(timer);
		state[key] = undefined;
	}
}

type PowerActionRef = DialAction | KeyAction;

/** Sync the two-state Power icon from device on/off. */
export async function syncPowerKeyState(action: PowerActionRef): Promise<void> {
	if (!action.isKey()) {
		return;
	}
	const { allOn, deviceCount } = isOnAll();
	await action.setState(deviceCount > 0 && allOn ? 1 : 0);
}

/** Run a power broadcast, alert on failure, then refresh the icon. */
export async function runPowerOp(action: PowerActionRef, op: () => { ok: boolean }): Promise<void> {
	const result = op();
	if (!result.ok) {
		await action.showAlert();
	}
	await syncPowerKeyState(action);
}

export async function powerToggle(action: PowerActionRef): Promise<void> {
	await runPowerOp(action, toggleAll);
}

export async function powerOn(action: PowerActionRef): Promise<void> {
	await runPowerOp(action, turnOnAll);
}

export async function powerOff(action: PowerActionRef): Promise<void> {
	await runPowerOp(action, turnOffAll);
}

/** Wire KeyDown/KeyUp of a key action to multi-gesture power. */
export function handleMultiKeyDown(
	gestures: PowerGestureController,
	action: KeyAction,
): void {
	gestures.onKeyDown(action.id, () => {
		void powerOff(action);
	});
}

export function handleMultiKeyUp(
	gestures: PowerGestureController,
	action: KeyAction,
): void {
	gestures.onKeyUp(
		action.id,
		() => {
			void powerToggle(action);
		},
		() => {
			void powerOn(action);
		},
	);
}
