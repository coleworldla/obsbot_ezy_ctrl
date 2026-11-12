/** The app's jog bus: every pan / tilt jog goes through it, so the joystick shows keys, MIDI and OSC too. */
import { createJogBus } from '../../../shared/joystick';

export const jogBus = createJogBus((id, dir, pan, tilt) => window.ezy.ptz.drive(id, dir, pan, tilt));
