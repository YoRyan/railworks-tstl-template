/** @noSelfInFile */

import * as c from "./constants";
import * as frp from "./frp";
import { FrpList } from "./frp-entity";
import { FrpVehicle } from "./frp-vehicle";
import * as rw from "./railworks";

export class FrpEngine extends FrpVehicle {
    /**
     * Convenient acces to the methods for an engine.
     */
    public eng = new rw.Engine("");

    private signalMessageList = new FrpList<string>();

    /**
     * Create an event stream that fires for the OnCustomSignalMessage()
     * callback.
     * @returns The new event stream.
     */
    createOnCustomSignalMessageStream(): frp.Stream<string> {
        return this.signalMessageList.createStream();
    }

    /**
     * Pass through the events in the event stream only when the player is in
     * control of this engine.
     * @returns The new event stream.
     */
    filterPlayerEngine<T>(): (eventStream: frp.Stream<T>) => frp.Stream<T> {
        return frp.filter((_: T) => this.eng.GetIsEngineWithKey());
    }

    setup() {
        super.setup();

        OnCustomSignalMessage = msg => {
            this.signalMessageList.call(msg);
            this.updateLoopFromCallback();
        };
    }
}
