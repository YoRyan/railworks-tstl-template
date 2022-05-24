/** @noSelfInFile */
/**
 * Functional reactive programming library.
 * Straight port of https://github.com/santoshrajan/frpjs to TypeScript.
 */

import * as rw from "./railworks";

export type Stream<T> = (next: (value: T) => void) => void;

/**
 * Takes an eventStream and a function that transforms the value of the Event.
 * Returns a new Event that emits the transformed Value
 */
export function map<T, U>(valueTransform: (value: T) => U): (eventStream: Stream<T>) => Stream<U> {
    return function (eventStream) {
        return function (next) {
            eventStream(function (value) {
                next(valueTransform(value));
            });
        };
    };
}

/**
 * Binds an eventStream to a new EventStream. Function valueToEvent is called
 * with the event value. Returns a new Event Stream.
 */
export function bind<T, U>(valueToEvent: (value: T) => Stream<U>): (eventStream: Stream<T>) => Stream<U> {
    return function (eventStream) {
        return function (next) {
            eventStream(function (value) {
                valueToEvent(value)(next);
            });
        };
    };
}

/**
 * Filters an Event Stream. Predicate is called with every value.
 */
export function filter<T>(predicate: (value: T) => boolean): (eventStream: Stream<T>) => Stream<T> {
    return function (eventStream) {
        return function (next) {
            eventStream(function (value) {
                if (predicate(value)) {
                    next(value);
                }
            });
        };
    };
}

/**
 * Opposite of filter
 */
export function reject<T>(predicate: (value: T) => boolean): (eventStream: Stream<T>) => Stream<T> {
    return function (eventStream) {
        return function (next) {
            eventStream(function (value) {
                if (!predicate(value)) {
                    next(value);
                }
            });
        };
    };
}

/**
 * Is the 'reduce' function for every event in the stream. The step function
 * is called with the accumulator and the current value. The parameter initial
 * is the initial value of the accumulator
 */
export function fold<TAccum, TValue>(
    step: (accumulated: TAccum, value: TValue) => TAccum,
    initial: TAccum
): (eventStream: Stream<TValue>) => Stream<TAccum> {
    return function (eventStream) {
        return function (next) {
            let accumulated = initial;
            eventStream(function (value) {
                next((accumulated = step(accumulated, value)));
            });
        };
    };
}

/**
 * Takes two eventStreams, combines them and returns a new eventStream
 */
export function merge<A, B>(eventStreamA: Stream<A>): (eventStreamB: Stream<B>) => Stream<A | B> {
    return function (eventStreamB) {
        return function (next) {
            eventStreamA(value => next(value));
            eventStreamB(value => next(value));
        };
    };
}

/**
 * Takes an eventStream, performs a series of operations on it and returns
 * a modified stream. All FRP operations are curried by default.
 */
export function compose(
    eventStream: Stream<any>,
    ...operations: ((eventStream: Stream<any>) => Stream<any>)[]
): Stream<any> {
    let operation = operations.shift();
    return operation === undefined ? eventStream : compose(operation(eventStream), ...operations);
}

/**
 * Returns a behaviour. Call the behaviour for the last value of the event.
 */
export function stepper<T>(eventStream: Stream<T>, initial: T): () => T {
    let valueAtLastStep = initial;

    eventStream(function nextStep(value) {
        valueAtLastStep = value;
    });

    return function behaveAtLastStep() {
        return valueAtLastStep;
    };
}

/**
 * Throttle an EventStream to every ms milliseconds
 *
 * @description Note that unlike Santosh Rajan's original version of the
 * function, this one is curried.
 */
export function throttle<T>(ms: number): (eventStream: Stream<T>) => Stream<T> {
    return function (eventStream) {
        return function (next) {
            let last = 0;
            eventStream(function (value) {
                let now = rw.o.GetSimulationTime() * 1000;
                if (last === 0 || now - last > ms) {
                    next(value);
                    last = now;
                }
            });
        };
    };
}

export function snapshot<T>(behavior: (() => T) | T): T {
    if (behavior instanceof Function) {
        return behavior();
    }
    return behavior;
}

export function liftN<T>(combine: (...args: any[]) => T, ...behaviors: any[]): () => T {
    return function () {
        let values = behaviors.map(value => snapshot(value));
        return combine(...values);
    };
}

export function hub<T>(): (eventStream: Stream<T>) => Stream<T> {
    return function (eventStream) {
        let nexts: ((value: T) => void)[] = [];
        let isStarted = false;

        return function (next) {
            nexts.push(next);
            if (!isStarted) {
                eventStream(function (value) {
                    nexts.forEach(next => next(value));
                });
                isStarted = true;
            }
        };
    };
}
