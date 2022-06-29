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

    /**
     * A behavior that always returns true--the default for creating update
     * streams.
     */
    protected always: frp.Behavior<boolean> = () => true;

    private onInit: (this: void) => void;
    private updateTimeList = new FrpList<number>();
    private updateDeltaList = new FrpList<number>();
    private lastTimeS: number | undefined = undefined;
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
     * @param update The stream will continue to produce events as long as the
     * provided behavior is true.
     * @returns The new event stream.
     */
    createUpdateStream(update = this.always): frp.Stream<number> {
        return this.updateTimeList.createStream(update);
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
     * @param update The stream will continue to produce events as long as the
     * provided behavior is true.
     * @returns The new event stream.
     */
    createUpdateDeltaStream(update = this.always): frp.Stream<number> {
        return this.updateDeltaList.createStream(update);
    }

    /**
     * Create an event stream that provides the value produced by the behavior
     * on every iteration of the update loop.
     * @param b The behavior to create events with.
     * @param update The stream will continue to produce events as long as the
     * provided behavior is true.
     * @returns The new event stream.
     */
    createUpdateStreamForBehavior<T>(b: frp.Behavior<T>, update = this.always) {
        return frp.compose(
            this.createUpdateStream(update),
            frp.map(_ => frp.snapshot(b))
        );
    }

    /**
     * Transform any event stream into a stream that produces false, unless the
     * original stream produces an event, in which case it produces true for a
     * specified amount of time. Can be used to drive one-shot special effects
     * like beeps, tones, messages, etc.
     * @param update Continue to produce events as long as the provided
     * behavior is true.
     * @param durationS The length of the post-event timer.
     * @returns A curried function that will produce the new event stream.
     */
    createEventStreamTimer(
        update = this.always,
        durationS: number = 1
    ): (eventStream: frp.Stream<any>) => frp.Stream<boolean> {
        return eventStream => {
            return frp.compose(
                eventStream,
                frp.map(_ => undefined),
                frp.merge(this.createUpdateDeltaStream(update)),
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
        this.updateTimeList.call(time);

        if (this.lastTimeS !== undefined) {
            const dt = time - this.lastTimeS;
            this.updateDeltaList.call(dt);
        }
        this.lastTimeS = time;
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
 * A list of callbacks that proxies access to a single event stream source. To
 * improve performance, callbacks are indexed by a guard behavior.
 */
export class FrpList<T> {
    private nextGuards = new Map<frp.Behavior<boolean>, ((arg0: T) => void)[]>();

    /**
     * Create a new event stream and register its callback to this list.
     * @param guard The event stream will only produce events while this
     * behavior is true.
     */
    createStream(guard: frp.Behavior<boolean>): frp.Stream<T> {
        return next => {
            const nexts = this.nextGuards.get(guard);
            if (nexts === undefined) {
                this.nextGuards.set(guard, [next]);
            } else {
                nexts.push(next);
            }
        };
    }

    /**
     * Call the callbacks in this list with the provided value.
     * @param value The value to run the callbacks with.
     */
    call(value: T) {
        for (const [guard, nexts] of this.nextGuards) {
            if (frp.snapshot(guard)) {
                for (const next of nexts) {
                    next(value);
                }
            }
        }
    }
}
