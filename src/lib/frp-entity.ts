/** @noSelfInFile */

import * as frp from "./frp";
import * as rw from "./railworks";

/**
 * Creates a state machine that records the last and current values of the event
 * stream.
 * @param initState The initial value of the state machine.
 */
export function fsm<T>(initState: T): (eventStream: frp.Stream<T>) => frp.Stream<[from: T, to: T]> {
    return frp.fold<[T, T], T>((accum, value) => [accum[1], value], [initState, initState]);
}

/**
 * An entity is a world object that can request an Update() call. It manages an
 * update loop that runs on every Update() or event callback.
 */
export class FrpEntity {
    /**
     * Convenient access to the methods for a scripted entity.
     */
    public e = rw.o;
    /**
     * True if this entity is requesting an update once per frame.
     */
    protected updatingEveryFrame = false;

    private onInit: (this: void) => void;
    private updateList = new FrpList<number>();

    /**
     * Construct a new entity.
     * @param onInit The callback to run when the game calls Initialise().
     */
    constructor(onInit: () => void) {
        this.onInit = onInit;
    }

    /**
     * Set the global callback functions to execute this entity.
     */
    setup() {
        Initialise = () => {
            this.onInit();
            this.updateLoopFromCallback();
        };
        Update = _ => this.updateLoop();
    }

    /**
     * Create an event stream that provides the current simulation time on every
     * iteration of the update loop.
     * @returns The new event stream.
     */
    createUpdateStream(): frp.Stream<number> {
        return this.updateList.createStream();
    }

    /**
     * Set the update loop to update every frame, or only upon the execution of
     * any callback.
     * @param everyFrame Whether to update every frame.
     */
    activateUpdatesEveryFrame(everyFrame: boolean) {
        if (!this.updatingEveryFrame && everyFrame) {
            this.e.BeginUpdate();
        } else if (this.updatingEveryFrame && !everyFrame) {
            this.e.EndUpdate();
        }
        this.updatingEveryFrame = everyFrame;
    }

    /**
     * Run the main update loop.
     */
    protected updateLoop() {
        const time = this.e.GetSimulationTime();
        this.updateList.call(time);
    }

    /**
     * Run the main update loop only if updates are not already processing every
     * frame.
     */
    protected updateLoopFromCallback() {
        if (!this.updatingEveryFrame) {
            this.updateLoop();
        }
    }
}

/**
 * A list of callbacks that proxies access to a single event stream source.
 */
export class FrpList<T> {
    private nexts: ((arg0: T) => void)[] = [];

    /**
     * Create a new event stream and register its callback to this list.
     */
    createStream(): frp.Stream<T> {
        return next => {
            this.nexts.push(next);
        };
    }

    /**
     * Call the callbacks in this list with the provided value.
     * @param value The value to run the callbacks with.
     */
    call(value: T) {
        for (const next of this.nexts) {
            next(value);
        }
    }
}
