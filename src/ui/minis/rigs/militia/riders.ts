// Tumbleweed Outriders (profile `mil-riders`): dispatch riders on armoured dirt bikes. A boxy
// riveted fairing with a headlamp, fat knobbly wheels that roll with the ground (the walk cycle is
// one wheel turn per stride), a side pipe that puffs, and a trooper in the saddle steering with one
// hand and firing a cut-down scattergun with the other. Frame "vehicle": the chassis rides the
// pelvis bone, so it bounces on its springs over wheels that stay on the ground.

import chassis from "../../parts/militia/rider/chassis.svg?raw";
import wheel from "../../parts/militia/rider/wheel.svg?raw";
import scattergun from "../../parts/militia/rider/scattergun.svg?raw";
import bikeTop from "../../parts/militia/rider-top/bike.svg?raw";
import gauntletSide from "../../parts/militia/trooper/gauntlet.svg?raw";
import gauntletTop from "../../parts/militia/trooper-top/gauntlet.svg?raw";
import type { PartUse, Pt, RigDef } from "../../types";
import { TROOPER_WEAPONS } from "../militiaTrooper";
import { anchorAt, placeAt, reseat, trooperKitSide, trooperKitTop } from "./kit-troops";

export interface BikeOpts {
  /** Wheel centres (frame coords) and radius (u). */
  front: Pt;
  back: Pt;
  wheelR: number;
  chassis: string;
  wheel: string;
}

/** A bike's rolling parts: the chassis on the springs (pelvis) and two wheels on the ground that turn. */
export function bikeParts(o: BikeOpts): PartUse[] {
  return [
    { id: "wheel-back", src: o.wheel, bone: "root", place: { x: o.back.x, y: o.back.y, rot: 0 }, z: 4.3, anim: { spin: -1 } },
    { id: "wheel-front", src: o.wheel, bone: "root", place: { x: o.front.x, y: o.front.y, rot: 0 }, z: 4.4, anim: { spin: -1 } },
    { id: "chassis", src: o.chassis, bone: "pelvis", z: 4.5 },
  ];
}

const BIKE: BikeOpts = { front: { x: 34, y: 166 }, back: { x: 146, y: 166 }, wheelR: 18, chassis, wheel };

/** The rider in the saddle: hips on the seat, leaning 24 degrees over the tank. */
const SEAT = reseat({ x: 60, y: 106 }, { x: 104, y: 112 }, -24);

export function riderSide(): RigDef {
  const bar = anchorAt(chassis, { x: 0, y: 0, rot: 0 }, "bar");
  return trooperKitSide({
    id: "militia.rider.side",
    name: "Tumbleweed outrider",
    frame: "vehicle",
    body: SEAT,
    legs: { footF: { x: 90, y: 152 }, footB: { x: 101, y: 149 }, knees: -1 },
    pack: null,
    // the far hand fires the scattergun over the fairing; the near one keeps the bars
    weapon: { src: scattergun, place: placeAt(scattergun, "g1", { x: 75, y: 92 }, -4) },
    armB: { grip: "g1" },
    armF: { hand: gauntletSide, at: bar, to: "pelvis" },
    origin: { x: 90, y: 184 },
    height: 148,
    // one walk cycle = one turn of the wheels
    stride: 2 * Math.PI * BIKE.wheelR,
    more: { parts: bikeParts(BIKE) },
  });
}

export function riderTop(): RigDef {
  const bar = anchorAt(bikeTop, { x: 0, y: 0, rot: 0 }, "barL");
  return trooperKitTop({
    id: "militia.rider.top",
    name: "Tumbleweed outrider (from above)",
    frame: "vehicle",
    pack: null,
    extras: [{ id: "bike", src: bikeTop, bone: "pelvis", z: -1 }],
    weapon: { src: TROOPER_WEAPONS.top.scatter.src, place: placeAt(TROOPER_WEAPONS.top.scatter.src, "g1", { x: 13, y: -22 }, 90) },
    armR: { grip: "g1" },
    armL: { hand: gauntletTop, at: bar, to: "pelvis" },
    height: 140,
    shadow: { x: 5, y: 8, r: 30 },
  });
}
