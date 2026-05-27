/**
 * Rive .riv File Writer — assembles the complete binary file from an
 * in-memory scene graph representation.
 *
 * The writer builds a project consisting of:
 * - One or more Artboards (each with a scene graph of shapes, bones, etc.)
 * - LinearAnimations (keyframe data)
 * - StateMachines (states, transitions, inputs)
 */

import { RivBinaryWriter, PropertyType } from "./binary-writer.js";
import { typeKeyOf } from "./type-registry.js";

// ─── Scene Graph Types ──────────────────────────────────────────────────────

export interface RivColor {
  r: number; // 0-255
  g: number;
  b: number;
  a?: number; // 0-1, default 1
}

export interface RivObject {
  type: string; // e.g. "Rectangle", "Ellipse", "Bone"
  name: string;
  parentId: number;
  // Position
  x: number;
  y: number;
  // Transform
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
  // Shape-specific
  width?: number;
  height?: number;
  cornerRadius?: number;
  sides?: number;
  radius?: number;
  innerRadius?: number;
  outerRadius?: number;
  points?: number;
  // Fill/Stroke
  fillColor?: RivColor;
  fillGradient?: Gradient;
  strokeColor?: RivColor;
  strokeWidth?: number;
  // Bone-specific
  length?: number;
  // Group
  isGroup?: boolean;
}

export interface RivArtboard {
  name: string;
  width: number;
  height: number;
  backgroundColor?: RivColor;
  objects: RivObject[];
}

export interface GradientStop {
  color: RivColor;
  position: number; // 0-1
}

export interface Gradient {
  type: "linear" | "radial";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  stops: GradientStop[];
}

export interface RivKeyframe {
  time: number; // seconds
  value: number | number[] | RivColor | string;
  easing?: string;
}

export interface RivAnimation {
  name: string;
  artboardIndex: number;
  duration: number; // seconds
  loop: "oneShot" | "loop" | "pingPong";
  keyframes: Map<number, Map<string, RivKeyframe[]>>; // objectIndex → property → keyframes
}

export interface RivState {
  name: string;
  animationIndex?: number;
}

export interface RivTransition {
  fromState: number;
  toState: number;
  duration: number;
  conditionType?: "none" | "input" | "trigger";
  conditionInput?: string;
  conditionValue?: unknown;
}

export interface RivInput {
  name: string;
  type: "number" | "boolean" | "trigger";
  defaultValue?: unknown;
}

export interface RivStateMachine {
  name: string;
  artboardIndex: number;
  states: RivState[];
  transitions: RivTransition[];
  inputs: RivInput[];
}

export interface RivProject {
  width: number;
  height: number;
  fps: number;
  artboards: RivArtboard[];
  animations: RivAnimation[];
  stateMachines: RivStateMachine[];
}

// ─── Writer ──────────────────────────────────────────────────────────────────

export class RivFileWriter {
  private w: RivBinaryWriter;
  private project: RivProject;
  private propertyKeys: Set<number> = new Set();
  private objectIds: Map<RivObject, number> = new Map();
  private nextId = 1;

  constructor(project: RivProject) {
    this.w = new RivBinaryWriter();
    this.project = project;
  }

  /** Build the complete .riv binary */
  build(): Uint8Array {
    // Phase 1: Collect all objects and assign IDs
    this.allocateIds();

    // Phase 2: Serialize objects
    this.writeObjects();

    // Phase 3: Build header with collected property keys
    const keys = Array.from(this.propertyKeys).sort((a, b) => a - b);
    const body = this.w.toBuffer();

    // Rebuild with header
    const headerWriter = new RivBinaryWriter();
    headerWriter.writeHeader(keys);
    const header = headerWriter.toBuffer();

    // Concatenate
    const result = new Uint8Array(header.length + body.length);
    result.set(header);
    result.set(body, header.length);
    return result;
  }

  private allocateIds(): void {
    // Backboard gets id 0
    // Each artboard, its objects, and top-level items get sequential IDs
    for (const artboard of this.project.artboards) {
      for (const obj of artboard.objects) {
        this.objectIds.set(obj, this.nextId++);
      }
    }
  }

  private writeObjects(): void {
    // 1. Write Backboard (typeKey 23)
    const backProps: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(backProps, PK.name, "Backboard", PropertyType.String);
    this.writeObjectTyped("Backboard", backProps);

    // 2. Write each Artboard and its objects
    for (const artboard of this.project.artboards) {
      this.writeArtboard(artboard);
    }

    // 3. Write LinearAnimations
    for (const anim of this.project.animations) {
      this.writeAnimation(anim);
    }

    // 4. Write StateMachines
    for (const sm of this.project.stateMachines) {
      this.writeStateMachine(sm);
    }
  }

  private writeArtboard(artboard: RivArtboard): void {
    const props: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(props, PK.name, artboard.name, PropertyType.String);
    this.addProp(props, PK.width, artboard.width, PropertyType.Double);
    this.addProp(props, PK.height, artboard.height, PropertyType.Double);
    this.addProp(props, PK.originX, 0, PropertyType.Double);
    this.addProp(props, PK.originY, 0, PropertyType.Double);

    if (artboard.backgroundColor) {
      // Artboard doesn't have a direct background color property;
      // it would need a background fill object. Skip for now.
    }

    this.writeObject("Artboard", props);

    // Write all child objects
    for (const obj of artboard.objects) {
      this.writeSceneObject(obj);
    }
  }

  private writeSceneObject(obj: RivObject): void {
    const props: Record<number, { value: unknown; type: PropertyType }> = {};

    // Component: name (4), parentId (5)
    this.addProp(props, 4, obj.name, PropertyType.String);
    this.addProp(props, 5, obj.parentId, PropertyType.Uint);

    // Node: x (13), y (14)
    this.addProp(props, PK.x, obj.x, PropertyType.Double);
    this.addProp(props, PK.y, obj.y, PropertyType.Double);

    // TransformComponent: rotation (15), scaleX (16), scaleY (17)
    if (obj.rotation !== undefined) this.addProp(props, PK.rotation, obj.rotation, PropertyType.Double);
    if (obj.scaleX !== undefined) this.addProp(props, PK.scaleX, obj.scaleX, PropertyType.Double);
    if (obj.scaleY !== undefined) this.addProp(props, PK.scaleY, obj.scaleY, PropertyType.Double);

    // WorldTransformComponent: opacity (18)
    if (obj.opacity !== undefined && obj.opacity !== 1) {
      this.addProp(props, PK.opacity, obj.opacity, PropertyType.Double);
    }

    // Shape-specific properties
    if (obj.width !== undefined && obj.type !== "Path" && obj.type !== "Bone") {
      this.addProp(props, PK.width, obj.width, PropertyType.Double);
    }
    if (obj.height !== undefined && obj.type !== "Path" && obj.type !== "Bone") {
      this.addProp(props, PK.height, obj.height, PropertyType.Double);
    }
    if (obj.cornerRadius !== undefined) {
      this.addProp(props, PK.linkCornerRadius, true, PropertyType.Bool);
      this.addProp(props, PK.cornerRadiusTL, obj.cornerRadius, PropertyType.Double);
      this.addProp(props, PK.cornerRadiusTR, obj.cornerRadius, PropertyType.Double);
      this.addProp(props, PK.cornerRadiusBL, obj.cornerRadius, PropertyType.Double);
      this.addProp(props, PK.cornerRadiusBR, obj.cornerRadius, PropertyType.Double);
    }
    if (obj.length !== undefined) {
      this.addProp(props, PK.length, obj.length, PropertyType.Double);
    }

    this.writeObject(obj.type, props);

    // Write fill and stroke as separate objects
    if (obj.fillColor) {
      this.writeFillStroke(obj, obj.fillColor, "fill");
    }
    if (obj.fillGradient) {
      this.writeGradient(obj, obj.fillGradient, "fill");
    }
    if (obj.strokeColor) {
      this.writeFillStroke(obj, obj.strokeColor, "stroke");
    }
  }

  private writeObject(
    typeName: string,
    props: Record<number, { value: unknown; type: PropertyType }>,
  ): void {
    const typeKey = typeKeyOf(typeName as any);
    if (typeKey === undefined) {
      throw new Error(`Unknown Rive type: ${typeName}`);
    }

    this.w.writeVarUint(typeKey);

    // Write all properties
    const keys = Object.keys(props).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
      const entry = props[key];
      if (!entry) continue;
      this.w.writeVarUint(key);
      this.writeValue(entry.value, entry.type);
      this.propertyKeys.add(key);
    }

    this.w.writeObjectEnd();
  }

  private writeObjectTyped(
    typeName: string,
    props: Record<number, { value: unknown; type: PropertyType }>,
  ): void {
    this.writeObject(typeName, props);
  }

  private writeValue(value: unknown, type: PropertyType): void {
    switch (type) {
      case PropertyType.Uint:
        this.w.writeVarUint(value as number);
        break;
      case PropertyType.String:
        this.w.writeString(value as string);
        break;
      case PropertyType.Double:
        this.w.writeFloat32(value as number);
        break;
      case PropertyType.Color: {
        const c = value as RivColor;
        this.w.writeColor(c.r, c.g, c.b, c.a);
        break;
      }
      case PropertyType.Bool:
        this.w.writeBool(value as boolean);
        break;
    }
  }

  private addProp(
    props: Record<number, { value: unknown; type: PropertyType }>,
    key: number,
    value: unknown,
    type: PropertyType,
  ): void {
    if (value !== undefined && value !== null) {
      props[key] = { value, type };
    }
  }

  private writeFillStroke(
    parentObj: RivObject,
    color: RivColor,
    kind: "fill" | "stroke",
  ): void {
    const parentId = this.objectIds.get(parentObj) || 0;
    const typeName = kind === "fill" ? "Fill" : "Stroke";

    const props: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(props, PK.name, `${parentObj.name}_${kind}`, PropertyType.String);
    this.addProp(props, PK.parentId, parentId, PropertyType.Uint);

    this.writeObject(typeName, props);

    // Also write SolidColor (colorValue = 37)
    const solidProps: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(solidProps, PK.name, `${parentObj.name}_color`, PropertyType.String);
    this.addProp(solidProps, PK.parentId, parentId + 1, PropertyType.Uint);
    this.addProp(solidProps, PK.colorValue, color, PropertyType.Color);

    this.writeObject("SolidColor", solidProps);
  }

  private writeGradient(
    parentObj: RivObject,
    gradient: Gradient,
    kind: "fill" | "stroke",
  ): void {
    const parentId = this.objectIds.get(parentObj) || 0;
    const gradType = gradient.type === "linear" ? "LinearGradient" : "RadialGradient";

    const props: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(props, 4, `${parentObj.name}_grad`, PropertyType.String);
    this.addProp(props, 5, parentId, PropertyType.Uint);
    this.addProp(props, 105, gradient.startX, PropertyType.Double);
    this.addProp(props, 106, gradient.startY, PropertyType.Double);
    this.addProp(props, 107, gradient.endX, PropertyType.Double);
    this.addProp(props, 108, gradient.endY, PropertyType.Double);

    this.writeObject(gradType, props);

    // Gradient stops
    const gradStopParentId = parentId + 100; // approximate
    for (let i = 0; i < gradient.stops.length; i++) {
      const stop = gradient.stops[i];
      const stopProps: Record<number, { value: unknown; type: PropertyType }> = {};
      this.addProp(stopProps, 4, `gradient_stop_${i}`, PropertyType.String);
      this.addProp(stopProps, 5, gradStopParentId, PropertyType.Uint);
      this.addProp(stopProps, 20, stop.color, PropertyType.Color);
      this.addProp(stopProps, 109, stop.position, PropertyType.Double);

      this.writeObject("GradientStop", stopProps);
    }
  }

  private writeAnimation(anim: RivAnimation): void {
    // LinearAnimation
    const animProps: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(animProps, PK.animName, anim.name, PropertyType.String);
    this.writeObject("LinearAnimation", animProps);

    // For each animated object, write KeyedObject → KeyedProperty → KeyFrame chain
    let animObjId = 1000; // start high to avoid collisions
    for (const [objIdx, propMap] of anim.keyframes) {
      const keyedObjProps: Record<number, { value: unknown; type: PropertyType }> = {};
      this.addProp(keyedObjProps, PK.name, `keyed_obj_${objIdx}`, PropertyType.String);
      this.addProp(keyedObjProps, PK.objectId, objIdx, PropertyType.Uint);
      this.writeObject("KeyedObject", keyedObjProps);

      const keyedObjId = animObjId++;

      for (const [propName, keyframes] of propMap) {
        const keyedPropProps: Record<number, { value: unknown; type: PropertyType }> = {};
        this.addProp(keyedPropProps, PK.name, `${propName}`, PropertyType.String);
        this.addProp(keyedPropProps, PK.parentId, keyedObjId, PropertyType.Uint);
        this.addProp(keyedPropProps, PK.propertyKey, propertyNameToKey(propName), PropertyType.Uint);
        this.writeObject("KeyedProperty", keyedPropProps);

        const keyedPropId = animObjId++;

        for (const kf of keyframes) {
          const kfProps: Record<number, { value: unknown; type: PropertyType }> = {};
          this.addProp(kfProps, PK.name, `kf_${kf.time}`, PropertyType.String);
          this.addProp(kfProps, PK.parentId, keyedPropId, PropertyType.Uint);
          this.addProp(kfProps, PK.frame, kf.time, PropertyType.Double);

          if (typeof kf.value === "number") {
            // value property key for KeyFrameDouble
            this.addProp(kfProps, 166, kf.value, PropertyType.Double);
          } else if (typeof kf.value === "object" && kf.value !== null) {
            const c = kf.value as RivColor;
            this.addProp(kfProps, PK.colorValue, c, PropertyType.Color);
          }

          this.writeObject("KeyFrameDouble", kfProps);
        }
      }
    }
  }

  private writeStateMachine(sm: RivStateMachine): void {
    // StateMachine (typeKey 53)
    const smProps: Record<number, { value: unknown; type: PropertyType }> = {};
    this.addProp(smProps, PK.smName, sm.name, PropertyType.String);
    this.writeObject("StateMachine", smProps);

    // StateMachineLayer (typeKey 57) — a state machine is the parent of one layer
    // We use id 10000 range for SM objects
    const layerBaseId = 10000;

    // States (AnimationState typeKey 61)
    const stateIdMap = new Map<number, number>();
    for (let i = 0; i < sm.states.length; i++) {
      const state = sm.states[i];
      const stateId = layerBaseId + i;
      stateIdMap.set(i, stateId);

      const stateProps: Record<number, { value: unknown; type: PropertyType }> = {};
      this.addProp(stateProps, PK.smName, state.name, PropertyType.String);
      if (state.animationIndex !== undefined) {
        this.addProp(stateProps, 165, state.animationIndex, PropertyType.Uint); // animationId
      }
      this.writeObject("AnimationState", stateProps);
    }

    // Transitions (StateTransition typeKey 65) + TransitionCondition
    const transBaseId = layerBaseId + sm.states.length;
    for (let i = 0; i < sm.transitions.length; i++) {
      const t = sm.transitions[i];
      const transId = transBaseId + i * 2;

      const transProps: Record<number, { value: unknown; type: PropertyType }> = {};
      this.addProp(transProps, PK.smName, `trans_${t.fromState}_to_${t.toState}`, PropertyType.String);
      // Reference destination state by id (not index)
      const toStateId = stateIdMap.get(t.toState) || 0;
      this.addProp(transProps, PK.stateToId, toStateId, PropertyType.Uint);
      this.addProp(transProps, PK.transitionDuration, t.duration, PropertyType.Uint);
      this.writeObject("StateTransition", transProps);

      // Write TransitionCondition if specified
      if (t.conditionType && t.conditionType !== "none") {
        const condProps: Record<number, { value: unknown; type: PropertyType }> = {};
        this.addProp(condProps, PK.name, `cond_${t.fromState}_to_${t.toState}`, PropertyType.String);
        this.addProp(condProps, PK.parentId, transId, PropertyType.Uint);

        // inputId reference (the name maps to the input index)
        if (t.conditionInput) {
          this.addProp(condProps, PK.inputId, 0, PropertyType.Uint); // input ref; will need mapping
        }

        // Write the value condition based on type
        if (t.conditionType === "input" && t.conditionValue !== undefined) {
          this.addProp(condProps, PK.transValue, Number(t.conditionValue), PropertyType.Double);
        }

        // Pick the right condition type
        const condTypeName = "TransitionNumberCondition"; // typeKey 70
        this.writeObject(condTypeName, condProps);
      }
    }

    // Inputs
    const inputBaseId = transBaseId + sm.transitions.length * 2;
    for (let i = 0; i < sm.inputs.length; i++) {
      const input = sm.inputs[i];
      const inputType = input.type === "number" ? "StateMachineNumber"
        : input.type === "boolean" ? "StateMachineBool"
        : "StateMachineTrigger";

      const inputProps: Record<number, { value: unknown; type: PropertyType }> = {};
      this.addProp(inputProps, PK.name, input.name, PropertyType.String);
      if (input.type === "number" && input.defaultValue !== undefined) {
        this.addProp(inputProps, PK.smInputValue, Number(input.defaultValue), PropertyType.Double);
      } else if (input.type === "boolean" && input.defaultValue !== undefined) {
        this.addProp(inputProps, PK.smBoolValue, input.defaultValue ? 1 : 0, PropertyType.Bool);
      }
      this.writeObject(inputType, inputProps);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Proper property key constants extracted from rive-runtime C++ generated code
const PK = {
  name: 4,
  parentId: 5,
  x: 13,
  y: 14,
  rotation: 15,
  scaleX: 16,
  scaleY: 17,
  opacity: 18,
  width: 20,
  height: 21,
  cornerRadiusTL: 31,
  colorValue: 37,
  fillRule: 40,
  thickness: 47,
  cap: 48,
  join: 49,
  objectId: 51,
  propertyKey: 53,
  animName: 55,
  frame: 67,
  length: 89,
  originX: 11,
  originY: 12,
  smName: 138,
  stateToId: 151,
  inputId: 155,
  transValue: 157,        // TransitionNumberConditionBase
  transitionFlags: 152,
  transitionDuration: 158,
  exitTime: 160,
  smInputValue: 140,      // StateMachineNumberBase
  smBoolValue: 141,       // StateMachineBoolBase
  linkCornerRadius: 164,
  cornerRadiusTR: 161,
  cornerRadiusBL: 162,
  cornerRadiusBR: 163,
  layerFlags: 536,
} as const;

function propertyNameToKey(name: string): number {

  const map: Record<string, number> = {
    positionX: PK.x,
    positionY: PK.y,
    rotation: PK.rotation,
    scaleX: PK.scaleX,
    scaleY: PK.scaleY,
    opacity: PK.opacity,
    fillColor: PK.colorValue,
    strokeColor: PK.colorValue,
    strokeWidth: PK.thickness,
    cornerRadius: PK.cornerRadiusTL,
    width: PK.width,
    height: PK.height,
  };
  return map[name] || 0;
}