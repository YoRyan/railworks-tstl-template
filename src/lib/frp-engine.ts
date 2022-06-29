/** @noSelfInFile */

import * as frp from "./frp";
import { FrpList } from "./frp-entity";
import { FrpVehicle } from "./frp-vehicle";
import * as rw from "./railworks";

export class FrpEngine extends FrpVehicle {
    /**
     * Convenient acces to the methods for an engine.
     */
    public eng = new rw.Engine("");
    /**
     * A behavior that returns true if this is the player-controlled engine.
     */
    public isEngineWithKey: frp.Behavior<boolean> = () => this.eng.GetIsEngineWithKey();

    private signalMessageList = new FrpList<string>();

    /**
     * Create an event stream that fires for the OnCustomSignalMessage()
     * callback.
     * @returns The new event stream.
     */
    createOnCustomSignalMessageStream(): frp.Stream<string> {
        return this.signalMessageList.createStream(this.isEngineWithKey);
    }

    setup() {
        super.setup();

        OnCustomSignalMessage = msg => {
            this.signalMessageList.call(msg);
            this.updateLoopFromCallback();
        };
    }
}
