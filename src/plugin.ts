import streamDeck from "@elgato/streamdeck";

import { BrightnessAction } from "./actions/brightness";
import { PowerAction } from "./actions/power";
import { PowerMultiAction } from "./actions/power-multi";
import { RearAction } from "./actions/rear";
import { TemperatureAction } from "./actions/temperature";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new PowerAction());
streamDeck.actions.registerAction(new PowerMultiAction());
streamDeck.actions.registerAction(new BrightnessAction());
streamDeck.actions.registerAction(new TemperatureAction());
streamDeck.actions.registerAction(new RearAction());

streamDeck.connect();
