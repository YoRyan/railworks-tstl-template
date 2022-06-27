/** @noSelfInFile */

import * as frp from "./frp";
import { fsm } from "./frp-extra";
import * as rw from "./railworks";

/**
 * An entity is a world object that can request an Update() call. It manages an
 * update loop that runs on every Update() or event callback.
 */
export class FrpEntity {
    /**
     * Convenient access to the methods for a scripted entity.
     */
    public e = new rw.ScriptedEntity("");

    private onInit: (this: void) => void;
    private updateList = new FrpList<number>();
    private updatingEveryFrame = false;

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
        Update = _ => {
            this.updateLoop();
            if (!this.updatingEveryFrame) {
                // EndUpdate() must be called from the Update() callback.
                this.e.EndUpdate();
            }
        };
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
        }
        this.updatingEveryFrame = everyFrame;
    }

    /**
     * Create an event stream that provides the time elapsed since the last
     * iteration of the update loop.
     * @returns The new event stream.
     */
    createUpdateDeltaStream(): frp.Stream<number> {
        return frp.compose(
            this.createUpdateStream(),
            fsm<number | undefined>(undefined),
            frp.filter(([from]) => from !== undefined),
            frp.map(([from, to]) => (to as number) - (from as number))
        );
    }

    /**
     * Create an event stream that provides the value produced by the behavior
     * on every iteration of the update loop.
     * @param b The behavior.
     * @returns The new event stream.
     */
    createUpdateStreamForBehavior<T>(b: frp.Behavior<T>) {
        return frp.map((_: number) => frp.snapshot(b))(this.createUpdateStream());
    }

    /**
     * Transform any event stream into a stream that produces false, unless the
     * original stream produces an event, in which case it produces true for a
     * specified amount of time. Can be used to drive one-shot special effects
     * like beeps, tones, messages, etc.
     * @param durationS The length of the post-event timer.
     * @returns A curried function that will produce the new event stream.
     */
    createEventStreamTimer(durationS: number = 1): (eventStream: frp.Stream<any>) => frp.Stream<boolean> {
        return eventStream => {
            return frp.compose(
                eventStream,
                frp.map(_ => undefined),
                frp.merge(this.createUpdateDeltaStream()),
                frp.fold((accum, value) => {
                    if (typeof value !== "number") {
                        return durationS;
                    } else {
                        return Math.max(accum - value, 0);
                    }
                }, 0),
                frp.map(t => t > 0)
            );
        };
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
