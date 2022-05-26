/** @noSelfInFile */

import * as c from "./constants";
import * as frp from "./frp";
import { FrpEntity, FrpList } from "./frp-entity";
import { fsm, rejectUndefined } from "./frp-extra";
import * as rw from "./railworks";

const coupleSenseMessage: [message: number, argument: string] = [10001, ""];

/**
 * Indicates whether the rail vehicle's front and/or rear couplers are engaged.
 */
export type VehicleCouplings = [front: boolean, rear: boolean];

/**
 * Indicates whether the rail vehicle is controlled by the player or by the AI.
 */
export enum VehicleAuthority {
    /**
     * This rail vehicle is part of the player train.
     */
    IsPlayer,
    /**
     * This rail vehicle is part of an AI train that has not moved.
     */
    IsAiParked,
    /**
     * This rail vehicle is part of an AI train and it is moving in the forward
     * direction (unless it is flipped, in which case it is reversing).
     */
    IsAiMovingForward,
    /**
     * This rail vehicle is part of an AI train and it is moving in the reverse
     * direction (unless it is flipped, in which case it is moving forward).
     */
    IsAiMovingBackward,
}

/**
 * Represents an OnControlValueChange() event.
 */
export type ControlValueChange = [name: string, index: number, value: number];

/**
 * Represents an OnConsistMessage() event.
 */
export type ConsistMessage = [id: number, content: string, direction: rw.ConsistDirection];

/**
 * Represents the state of the camera view passed to OnCameraEnter() and
 * OnCameraLeave().
 */
export enum VehicleCamera {
    Outside,
    Carriage,
    FrontCab,
    RearCab,
}

enum SensedDirection {
    Backward,
    None,
    Forward,
}

/**
 * A rail vehicle is a scripted entity that has control values, a physics
 * simulation, and callbacks to track simulator state and the player's actions.
 */
export class FrpVehicle extends FrpEntity {
    /**
     * Convenient access to the methods for a rail vehicle.
     */
    public rv = new rw.RailVehicle("");

    private onCvChangeList = new FrpList<ControlValueChange>();
    private consistMessageList = new FrpList<ConsistMessage>();
    private vehicleCameraList = new FrpList<VehicleCamera>();

    /**
     * Construct a new rail vehicle.
     * @param onInitAndSettled The callback to run after the game has called
     * Initialise(), and after the control values have settled to their initial
     * values.
     */
    constructor(onInitAndSettled: () => void) {
        // Begin updates, wait 0.5 seconds for the controls to settle, then fire
        // our callback.
        super(() => {
            this.activateUpdatesEveryFrame(true);
            const wait$ = frp.compose(
                this.createUpdateStream(),
                frp.map(time => time > 0.5),
                fsm(false),
                frp.filter(state => !state[0] && state[1])
            );
            wait$(_ => {
                this.activateUpdatesEveryFrame(false);
                onInitAndSettled();
            });
        });
    }

    /**
     * Create an event stream that fires for the OnControlValueChange()
     * callback.
     * @returns The new event stream.
     */
    createOnCvChangeStream(): frp.Stream<ControlValueChange> {
        return this.onCvChangeList.createStream();
    }

    /**
     * Create an event stream that fires for the OnConsistMessage() callback.
     * @returns The new event stream.
     */
    createOnConsistMessageStream(): frp.Stream<ConsistMessage> {
        return this.consistMessageList.createStream();
    }

    /**
     * Create an event stream that tracks the current camera view through the
     * OnCameraEnter() and OnCameraLeave() callbacks.
     * @returns The new event stream.
     */
    createCameraStream(): frp.Stream<VehicleCamera> {
        return this.vehicleCameraList.createStream();
    }

    /**
     * Create a continuously updating stream of controlvalues. Nil values are
     * filtered out, so nonexistent controlvalues will simply never fire their
     * callbacks.
     * @param name The name of the controlvalue.
     * @param index The index of the controlvalue, usually 0.
     * @returns The new stream of numbers.
     */
    createGetCvStream(name: string, index: number): frp.Stream<number> {
        return frp.compose(
            this.createUpdateStream(),
            frp.map(_ => this.rv.GetControlValue(name, index)),
            rejectUndefined<number>()
        );
    }

    /**
     * Create an event stream that communicates the current status of the
     * vehicle's front and rear couplers.
     * @returns The new event stream.
     */
    createCouplingsStream(): frp.Stream<VehicleCouplings> {
        return frp.map(
            (_): VehicleCouplings => [
                this.rv.SendConsistMessage(...coupleSenseMessage, rw.ConsistDirection.Forward),
                this.rv.SendConsistMessage(...coupleSenseMessage, rw.ConsistDirection.Backward),
            ]
        )(this.createUpdateStream());
    }

    /**
     * Create an event stream that commmunicates who is controlling the vehicle
     * and in what manner they are doing so.
     * @returns The new event stream.
     */
    createAuthorityStream(): frp.Stream<VehicleAuthority> {
        const direction$ = frp.compose(
                this.createUpdateStream(),
                frp.map(_ => this.rv.GetSpeed()),
                frp.fold<SensedDirection, number>((dir, speed) => {
                    if (speed > c.stopSpeed) {
                        return SensedDirection.Forward;
                    } else if (speed < -c.stopSpeed) {
                        return SensedDirection.Backward;
                    } else {
                        return dir;
                    }
                }, SensedDirection.None)
            ),
            authority = frp.liftN(
                (direction: SensedDirection, isPlayer) =>
                    isPlayer
                        ? VehicleAuthority.IsPlayer
                        : {
                              [SensedDirection.Forward]: VehicleAuthority.IsAiMovingForward,
                              [SensedDirection.None]: VehicleAuthority.IsAiParked,
                              [SensedDirection.Backward]: VehicleAuthority.IsAiMovingBackward,
                          }[direction],
                frp.stepper(direction$, SensedDirection.None),
                () => this.rv.GetIsPlayer()
            );
        return frp.map(_ => frp.snapshot(authority))(this.createUpdateStream());
    }

    setup() {
        super.setup();

        OnControlValueChange = (name, index, value) => {
            this.onCvChangeList.call([name, index, value]);
            this.updateLoopFromCallback();
        };
        OnConsistMessage = (id, content, dir) => {
            this.consistMessageList.call([id, content, dir]);
            this.updateLoopFromCallback();
        };
        OnCameraEnter = (cabEnd, carriageCam) => {
            let vc: VehicleCamera;
            if (carriageCam === rw.CameraEnterView.Cab) {
                vc = cabEnd === rw.CameraEnterCabEnd.Rear ? VehicleCamera.RearCab : VehicleCamera.FrontCab;
            } else {
                vc = VehicleCamera.Carriage;
            }
            this.vehicleCameraList.call(vc);
            this.updateLoopFromCallback();
        };
        OnCameraLeave = () => {
            this.vehicleCameraList.call(VehicleCamera.Outside);
            this.updateLoopFromCallback();
        };
    }
}
