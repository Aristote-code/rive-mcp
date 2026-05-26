/**
 * In-memory project manager — holds the current project state
 * and provides mutations that all MCP tool handlers use.
 */

import {
  RivProject,
  RivArtboard,
  RivObject,
  RivAnimation,
  RivStateMachine,
  RivKeyframe,
  RivColor,
} from "../writer/riv-writer.js";

export class ProjectManager {
  project: RivProject;

  constructor(opts: { width?: number; height?: number; fps?: number } = {}) {
    this.project = {
      width: opts.width || 1000,
      height: opts.height || 1000,
      fps: opts.fps || 60,
      artboards: [],
      animations: [],
      stateMachines: [],
    };
  }

  reset(): void {
    this.project.artboards = [];
    this.project.animations = [];
    this.project.stateMachines = [];
  }

  // ─── Artboard ──────────────────────────────────────────────────────

  addArtboard(name: string, width: number, height: number, bg?: RivColor): number {
    const idx = this.project.artboards.length;
    this.project.artboards.push({
      name,
      width,
      height,
      backgroundColor: bg,
      objects: [],
    });
    return idx;
  }

  getArtboard(idx: number): RivArtboard {
    const ab = this.project.artboards[idx];
    if (!ab) throw new Error(`Artboard ${idx} not found`);
    return ab;
  }

  deleteArtboard(idx: number): void {
    this.project.artboards.splice(idx, 1);
    // Also remove animations/state machines referencing this artboard
    this.project.animations = this.project.animations.filter(
      (a) => a.artboardIndex !== idx,
    );
    this.project.stateMachines = this.project.stateMachines.filter(
      (s) => s.artboardIndex !== idx,
    );
  }

  resizeArtboard(idx: number, w: number, h: number): void {
    const ab = this.getArtboard(idx);
    ab.width = w;
    ab.height = h;
  }

  setArtboardBackground(idx: number, color: RivColor): void {
    this.getArtboard(idx).backgroundColor = color;
  }

  // ─── Shapes ────────────────────────────────────────────────────────

  addObject(
    artboardIdx: number,
    type: string,
    props: Record<string, unknown>,
  ): number {
    const ab = this.getArtboard(artboardIdx);
    const idx = ab.objects.length;
    const obj: RivObject = {
      type,
      name: (props.name as string) || `${type}_${idx}`,
      parentId: 0, // root level by default; artboard owns them
      x: (props.x as number) || 0,
      y: (props.y as number) || 0,
      width: props.width as number | undefined,
      height: props.height as number | undefined,
      cornerRadius: props.cornerRadius as number | undefined,
      sides: props.sides as number | undefined,
      radius: props.radius as number | undefined,
      innerRadius: props.innerRadius as number | undefined,
      outerRadius: props.outerRadius as number | undefined,
      points: props.points as number | undefined,
      rotation: props.rotation as number | undefined,
      scaleX: props.scaleX as number | undefined,
      scaleY: props.scaleY as number | undefined,
      opacity: props.opacity as number | undefined,
      length: props.length as number | undefined,
    };
    ab.objects.push(obj);
    return idx;
  }

  deleteObject(artboardIdx: number, objIdx: number): void {
    this.getArtboard(artboardIdx).objects.splice(objIdx, 1);
  }

  setFill(artboardIdx: number, objIdx: number, color: RivColor): void {
    this.getArtboard(artboardIdx).objects[objIdx].fillColor = color;
  }

  setStroke(
    artboardIdx: number,
    objIdx: number,
    color: RivColor,
    width: number,
    _cap?: string,
    _join?: string,
  ): void {
    const obj = this.getArtboard(artboardIdx).objects[objIdx];
    obj.strokeColor = color;
    obj.strokeWidth = width;
  }

  setCornerRadius(artboardIdx: number, objIdx: number, radius: number): void {
    this.getArtboard(artboardIdx).objects[objIdx].cornerRadius = radius;
  }

  // ─── Transform ─────────────────────────────────────────────────────

  setPosition(artboardIdx: number, objIdx: number, x: number, y: number): void {
    const obj = this.getArtboard(artboardIdx).objects[objIdx];
    obj.x = x;
    obj.y = y;
  }

  setScale(artboardIdx: number, objIdx: number, sx: number, sy: number): void {
    const obj = this.getArtboard(artboardIdx).objects[objIdx];
    obj.scaleX = sx;
    obj.scaleY = sy;
  }

  setRotationAngle(artboardIdx: number, objIdx: number, angle: number): void {
    this.getArtboard(artboardIdx).objects[objIdx].rotation = angle;
  }

  setAnchorProp(artboardIdx: number, objIdx: number, _x: number, _y: number): void {
    // Anchor is not a direct property; it affects position interpretation
    // For now, store it conceptually
  }

  setOpacity(artboardIdx: number, objIdx: number, opacity: number): void {
    this.getArtboard(artboardIdx).objects[objIdx].opacity = opacity;
  }

  // ─── Bone ──────────────────────────────────────────────────────────

  addBone(
    artboardIdx: number,
    name: string,
    x: number,
    y: number,
    length: number,
    rotation?: number,
    parentBoneIdx?: number,
  ): number {
    return this.addObject(artboardIdx, "Bone", {
      name,
      x,
      y,
      length,
      rotation,
      parentId: parentBoneIdx ?? 0,
    });
  }

  setBoneLength(artboardIdx: number, boneIdx: number, length: number): void {
    this.getArtboard(artboardIdx).objects[boneIdx].length = length;
  }

  deleteBone(artboardIdx: number, boneIdx: number): void {
    this.deleteObject(artboardIdx, boneIdx);
  }

  // ─── Animation ─────────────────────────────────────────────────────

  addAnimation(
    artboardIdx: number,
    name: string,
    duration: number,
    loop: "oneShot" | "loop" | "pingPong" = "loop",
  ): number {
    const idx = this.project.animations.length;
    this.project.animations.push({
      name,
      artboardIndex: artboardIdx,
      duration,
      loop,
      keyframes: new Map(),
    });
    return idx;
  }

  deleteAnimation(artboardIdx: number, animIdx: number): void {
    this.project.animations = this.project.animations.filter(
      (a, i) => !(a.artboardIndex === artboardIdx && i === animIdx),
    );
  }

  setKeyframe(
    artboardIdx: number,
    animIdx: number,
    objIdx: number,
    property: string,
    time: number,
    value: unknown,
    easing?: string,
  ): void {
    const anim = this.project.animations.find(
      (a, i) => a.artboardIndex === artboardIdx && i === animIdx,
    );
    if (!anim) throw new Error(`Animation ${animIdx} on artboard ${artboardIdx} not found`);

    if (!anim.keyframes.has(objIdx)) {
      anim.keyframes.set(objIdx, new Map());
    }
    const propMap = anim.keyframes.get(objIdx)!;
    if (!propMap.has(property)) {
      propMap.set(property, []);
    }
    propMap.get(property)!.push({ time, value, easing });
  }

  setTimelineDuration(artboardIdx: number, animIdx: number, duration: number): void {
    const anim = this.project.animations.find(
      (a, i) => a.artboardIndex === artboardIdx && i === animIdx,
    );
    if (anim) anim.duration = duration;
  }

  setAnimationLoop(artboardIdx: number, animIdx: number, loop: "oneShot" | "loop" | "pingPong"): void {
    const anim = this.project.animations.find(
      (a, i) => a.artboardIndex === artboardIdx && i === animIdx,
    );
    if (anim) anim.loop = loop;
  }

  // ─── State Machine ─────────────────────────────────────────────────

  addStateMachine(artboardIdx: number, name: string): number {
    const idx = this.project.stateMachines.length;
    this.project.stateMachines.push({
      name,
      artboardIndex: artboardIdx,
      states: [],
      transitions: [],
      inputs: [],
    });
    return idx;
  }

  deleteStateMachine(artboardIdx: number, smIdx: number): void {
    this.project.stateMachines = this.project.stateMachines.filter(
      (s, i) => !(s.artboardIndex === artboardIdx && i === smIdx),
    );
  }

  addState(
    artboardIdx: number,
    smIdx: number,
    name: string,
    animIdx?: number,
  ): number {
    const sm = this._findSM(artboardIdx, smIdx);
    const idx = sm.states.length;
    sm.states.push({ name, animationIndex: animIdx });
    return idx;
  }

  deleteState(artboardIdx: number, smIdx: number, stateIdx: number): void {
    this._findSM(artboardIdx, smIdx).states.splice(stateIdx, 1);
  }

  addTransition(
    artboardIdx: number,
    smIdx: number,
    fromState: number,
    toState: number,
    duration = 0.3,
    conditionType = "none" as const,
    conditionInput?: string,
    conditionValue?: unknown,
  ): void {
    this._findSM(artboardIdx, smIdx).transitions.push({
      fromState,
      toState,
      duration,
      conditionType,
      conditionInput,
      conditionValue,
    });
  }

  deleteTransition(artboardIdx: number, smIdx: number, transIdx: number): void {
    this._findSM(artboardIdx, smIdx).transitions.splice(transIdx, 1);
  }

  addInput(
    artboardIdx: number,
    smIdx: number,
    name: string,
    type: "number" | "boolean" | "trigger",
    defaultValue?: unknown,
  ): void {
    this._findSM(artboardIdx, smIdx).inputs.push({ name, type, defaultValue });
  }

  private _findSM(artboardIdx: number, smIdx: number): RivStateMachine {
    const sm = this.project.stateMachines.filter(
      (s) => s.artboardIndex === artboardIdx,
    )[smIdx];
    if (!sm) throw new Error(`State machine ${smIdx} on artboard ${artboardIdx} not found`);
    return sm;
  }

  // ─── Layout ────────────────────────────────────────────────────────

  createGroup(
    artboardIdx: number,
    name: string,
    _childrenIndices: number[],
  ): number {
    return this.addObject(artboardIdx, "ContainerComponent", {
      name,
      x: 0,
      y: 0,
      isGroup: true,
    });
  }

  // ─── Snapshot ──────────────────────────────────────────────────────

  toJSON(): Record<string, unknown> {
    return {
      width: this.project.width,
      height: this.project.height,
      fps: this.project.fps,
      artboards: this.project.artboards.map((ab) => ({
        name: ab.name,
        width: ab.width,
        height: ab.height,
        backgroundColor: ab.backgroundColor,
        objectCount: ab.objects.length,
        objects: ab.objects.map((o) => ({
          type: o.type,
          name: o.name,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          fillColor: o.fillColor,
          strokeColor: o.strokeColor,
          rotation: o.rotation,
          opacity: o.opacity,
        })),
      })),
      animationCount: this.project.animations.length,
      stateMachineCount: this.project.stateMachines.length,
    };
  }
}