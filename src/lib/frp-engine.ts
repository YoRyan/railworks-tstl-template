/** @noSelfInFile */

import * as frp from "./frp";
import { FrpSource } from "./frp-entity";
import { FrpVehicle, PlayerUpdate } from "./frp-vehicle";
import * as rw from "./railworks";

export class FrpEngine extends FrpVehicle {
    /**
     * Convenient acces to the methods for an engine.
     */
    public eng = new rw.Engine("");

    private playerWithKeyUpdateSource = new FrpSource<PlayerUpdate>();
    private playerWithoutKeyUpdateSource = new FrpSource<PlayerUpdate>();
    private signalMessageSource = new FrpSource<string>();

    constructor(onInit: () => void) {
        super(onInit);

        const playerUpdate$ = this.createPlayerUpdateStream();
        playerUpdate$(pu => {
            if (this.eng.GetIsEngineWithKey()) {
                this.playerWithKeyUpdateSource.call(pu);
            } else {
                this.playerWithoutKeyUpdateSource.call(pu);
            }
        });
    }

    createPlayerWithKeyUpdateStream() {
        return this.playerWithKeyUpdateSource.createStream();
    }

    createPlayerWithoutKeyUpdateStream() {
        return this.playerWithoutKeyUpdateSource.createStream();
    }

    createOnSignalMessageStream() {
        return this.signalMessageSource.createStream();
    }

    setup() {
        super.setup();

        OnCustomSignalMessage = msg => {
            this.signalMessageSource.call(msg);
        };
    }
}
