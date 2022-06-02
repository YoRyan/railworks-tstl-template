/** @noSelfInFile */

import * as frp from "./frp";
import * as rw from "./railworks";

/**
 * Continously display the value of an event stream to aid in FRP debugging.
 */
export function debug(eventStream: frp.Stream<any>) {
    const frequency = 0.5;
    frp.throttle(frequency * 1000)(eventStream)(value => {
        rw.ScenarioManager.ShowInfoMessageExt(
            "Event Stream",
            `${value}`,
            frequency,
            rw.MessageBoxPosition.Centre,
            rw.MessageBoxSize.Small,
            false
        );
    });
}

/**
 * Creates a state machine that records the last and current values of the event
 * stream.
 * @param initState The initial value of the state machine.
 */
export function fsm<T>(initState: T): (eventStream: frp.Stream<T>) => frp.Stream<[from: T, to: T]> {
    return frp.fold<[T, T], T>((accum, value) => [accum[1], value], [initState, initState]);
}

/**
 * Filters out undefined values from an event stream.
 */
export function rejectUndefined<T>(): (eventStream: frp.Stream<T | undefined>) => frp.Stream<T> {
    return frp.reject<T | undefined>(value => value === undefined) as (
        eventStream: frp.Stream<T | undefined>
    ) => frp.Stream<T>;
}

/**
 * Like fold, but accepts a behavior that can reset the accumulator to the
 * initial state.
 */
export function foldWithResetBehavior<TAccum, TValue>(
    step: (accumulated: TAccum, value: TValue) => TAccum,
    initial: TAccum,
    reset: frp.Behavior<boolean>
): (eventStream: frp.Stream<TValue>) => frp.Stream<TAccum> {
    return function (eventStream) {
        return function (next) {
            let accumulated = initial;
            eventStream(function (value) {
                if (frp.snapshot(reset)) {
                    accumulated = initial;
                } else {
                    accumulated = step(accumulated, value);
                }
                next(accumulated);
            });
        };
    };
}
