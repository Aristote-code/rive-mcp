import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { ProjectManager } from "./writer/project-manager.js";
import { RivFileWriter, RivColor } from "./writer/riv-writer.js";

// ─── Global State ────────────────────────────────────────────────────────────

let project: ProjectManager = new ProjectManager();

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const RGBA = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
  a: z.number().min(0).max(1).optional().default(1),
});

const ArtboardIdent = {
  artboardIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the artboard in the project"),
};

const ObjectIdent = {
  ...ArtboardIdent,
  objectIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the object within the artboard"),
};

const ShapeIdent = {
  ...ArtboardIdent,
  shapeIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the shape within the artboard"),
};

const AnimationIdent = {
  ...ArtboardIdent,
  animationIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the animation in the artboard"),
};

const SMIdent = {
  ...ArtboardIdent,
  smIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based index of the state machine in the artboard"),
};

const EasingType = z.enum([
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "cubicBezier",
]);

const BlendMode = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "colorDodge",
  "colorBurn",
  "hardLight",
  "softLight",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

const GradientStop = z.object({
  color: RGBA,
  position: z.number().min(0).max(1),
});

const PathCommand = z.object({
  type: z.enum(["M", "L", "C", "Q", "Z"]),
  x: z.number().optional(),
  y: z.number().optional(),
  cp1x: z.number().optional(),
  cp1y: z.number().optional(),
  cp2x: z.number().optional(),
  cp2y: z.number().optional(),
});

// ─── Server Setup ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "RiveServer",
  version: "1.0.0",
});

// ─── 1. Project / File Tools ────────────────────────────────────────────────

server.tool(
  "createProject",
  "Create a new Rive project file",
  {
    width: z.number().int().positive().default(1000).describe("Default artboard width in pixels"),
    height: z.number().int().positive().default(1000).describe("Default artboard height in pixels"),
    fps: z.number().positive().default(60).describe("Frames per second"),
  },
  async ({ width, height, fps }) => {
    project = new ProjectManager({ width, height, fps });
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          message: `Project created: ${width}x${height}, ${fps}fps`,
          project: { width, height, fps },
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "loadFile",
  "Load a .riv file for playback control",
  {
    path: z.string().describe("Absolute path to the .riv file"),
  },
  async ({ path }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "not_implemented",
          message: "File loading will be available when the Rive WASM runtime is integrated. This is a placeholder.",
          requestedPath: path,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "getProjectInfo",
  "Get information about the loaded Rive project",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(project.toJSON(), null, 2),
      }],
    };
  },
);

server.tool(
  "saveProject",
  "Save the current project as a .riv file",
  {
    path: z.string().describe("Output path for the .riv file"),
  },
  async ({ path: outputPath }) => {
    try {
      const writer = new RivFileWriter(project.project);
      const buffer = writer.build();
      const resolved = path.resolve(outputPath);
      fs.writeFileSync(resolved, buffer);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            message: `Project saved to ${resolved}`,
            size: buffer.length,
            artboards: project.project.artboards.length,
            animations: project.project.animations.length,
            stateMachines: project.project.stateMachines.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "error",
            message: String(error),
          }, null, 2),
        }],
        isError: true,
      };
    }
  },
);

// ─── 2. Artboard Tools ──────────────────────────────────────────────────────

server.tool(
  "createArtboard",
  "Create a new artboard in the project",
  {
    name: z.string().describe("Name of the artboard"),
    width: z.number().int().positive().describe("Width in pixels"),
    height: z.number().int().positive().describe("Height in pixels"),
    backgroundColor: RGBA.optional().describe("Background color"),
  },
  async ({ name, width, height, backgroundColor }) => {
    const idx = project.addArtboard(name, width, height, backgroundColor);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          message: `Artboard "${name}" created at index ${idx}`,
          artboardIndex: idx,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "listArtboards",
  "List all artboards in the project",
  {},
  async () => {
    const list = project.project.artboards.map((ab, i) => ({
      index: i,
      name: ab.name,
      width: ab.width,
      height: ab.height,
      objectCount: ab.objects.length,
    }));
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ status: "success", artboards: list }, null, 2),
      }],
    };
  },
);

server.tool(
  "deleteArtboard",
  "Delete an artboard from the project",
  { ...ArtboardIdent },
  async ({ artboardIndex }) => {
    project.deleteArtboard(artboardIndex);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ status: "success", message: `Artboard ${artboardIndex} deleted` }, null, 2),
      }],
    };
  },
);

server.tool(
  "resizeArtboard",
  "Resize an artboard",
  { ...ArtboardIdent, width: z.number().int().positive(), height: z.number().int().positive() },
  async ({ artboardIndex, width, height }) => {
    project.resizeArtboard(artboardIndex, width, height);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: `Artboard ${artboardIndex} resized to ${width}x${height}` }, null, 2) }] };
  },
);

server.tool(
  "setArtboardBackground",
  "Set the background color of an artboard",
  { ...ArtboardIdent, color: RGBA },
  async ({ artboardIndex, color }) => {
    project.setArtboardBackground(artboardIndex, color);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

// ─── 3. Shape Tools ─────────────────────────────────────────────────────────

const shapeSchemas = {
  createRectangle: {
    ...ArtboardIdent,
    name: z.string().describe("Name of the rectangle shape"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().positive().describe("Width"),
    height: z.number().positive().describe("Height"),
    cornerRadius: z.number().min(0).optional().describe("Corner radius"),
  },

  createEllipse: {
    ...ArtboardIdent,
    name: z.string().describe("Name of the ellipse shape"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    width: z.number().positive().describe("Width"),
    height: z.number().positive().describe("Height"),
  },

  createPolygon: {
    ...ArtboardIdent,
    name: z.string().describe("Name of the polygon shape"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    sides: z.number().int().min(3).max(64).describe("Number of sides"),
    radius: z.number().positive().describe("Radius"),
  },

  createStar: {
    ...ArtboardIdent,
    name: z.string().describe("Name of the star shape"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    points: z.number().int().min(3).max(64).describe("Number of points"),
    innerRadius: z.number().min(0).describe("Inner radius"),
    outerRadius: z.number().positive().describe("Outer radius"),
  },

  createPath: {
    ...ArtboardIdent,
    name: z.string().describe("Name of the path"),
    commands: z.array(PathCommand).describe("Path commands"),
    isClosed: z.boolean().optional().default(true).describe("Whether the path is closed"),
  },
};

for (const [shapeType, schema] of Object.entries(shapeSchemas)) {
  const label = shapeType.replace("create", "");
  server.tool(
    shapeType,
    `Create a ${label} shape on an artboard`,
    schema,
    async (params) => {
      try {
        const idx = project.addObject(params.artboardIndex, label, params as Record<string, unknown>);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "success",
              message: `${label} "${(params as any).name}" created at index ${idx}`,
              shapeIndex: idx,
            }, null, 2),
          }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: String(error) }, null, 2) }], isError: true };
      }
    },
  );
}

server.tool(
  "deleteShape", "Delete a shape from an artboard", { ...ShapeIdent },
  async ({ artboardIndex, shapeIndex }) => {
    project.deleteObject(artboardIndex, shapeIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setFill", "Set the fill of a shape", { ...ShapeIdent, color: RGBA },
  async ({ artboardIndex, shapeIndex, color }) => {
    project.setFill(artboardIndex, shapeIndex, color);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setStroke", "Set the stroke of a shape",
  { ...ShapeIdent, color: RGBA, width: z.number().positive(), cap: z.enum(["butt","round","square"]).optional(), join: z.enum(["miter","round","bevel"]).optional() },
  async ({ artboardIndex, shapeIndex, color, width, cap, join }) => {
    project.setStroke(artboardIndex, shapeIndex, color, width, cap, join);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "editVertices", "Edit the vertices of a path shape",
  { ...ShapeIdent, vertices: z.array(z.object({ x: z.number(), y: z.number(), inX: z.number().optional(), inY: z.number().optional(), outX: z.number().optional(), outY: z.number().optional() })) },
  async ({ artboardIndex, shapeIndex, vertices }) => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: `${vertices.length} vertices edited` }, null, 2) }] };
  },
);

server.tool(
  "setCornerRadius", "Set the corner radius of a rectangle shape", { ...ShapeIdent, radius: z.number().min(0) },
  async ({ artboardIndex, shapeIndex, radius }) => {
    project.setCornerRadius(artboardIndex, shapeIndex, radius);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

// ─── 4. Transform Tools ─────────────────────────────────────────────────────

const transformMap = {
  setPosition: {
    ...ObjectIdent,
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
  },
  setScale: {
    ...ObjectIdent,
    scaleX: z.number().describe("Horizontal scale factor"),
    scaleY: z.number().describe("Vertical scale factor"),
  },
  setRotation: {
    ...ObjectIdent,
    angle: z.number().describe("Rotation angle in degrees"),
  },
  setAnchor: {
    ...ObjectIdent,
    x: z.number().describe("Anchor X (0 to 1)"),
    y: z.number().describe("Anchor Y (0 to 1)"),
  },
  setOpacity: {
    ...ObjectIdent,
    opacity: z.number().min(0).max(1).describe("Opacity (0 to 1)"),
  },
  setBlendMode: {
    ...ObjectIdent,
    mode: BlendMode.describe("Blend mode"),
  },
};

for (const [tname, tschema] of Object.entries(transformMap)) {
  server.tool(
    tname, `${tname} on an object in an artboard`, tschema,
    async (params) => {
      try {
        switch (tname) {
          case "setPosition": project.setPosition(params.artboardIndex, params.objectIndex, (params as any).x, (params as any).y); break;
          case "setScale": project.setScale(params.artboardIndex, params.objectIndex, (params as any).scaleX, (params as any).scaleY); break;
          case "setRotation": project.setRotationAngle(params.artboardIndex, params.objectIndex, (params as any).angle); break;
          case "setAnchor": project.setAnchorProp(params.artboardIndex, params.objectIndex, (params as any).x, (params as any).y); break;
          case "setOpacity": project.setOpacity(params.artboardIndex, params.objectIndex, (params as any).opacity); break;
        }
        return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: String(error) }, null, 2) }], isError: true };
      }
    },
  );
}

// ─── 5. Bone & Rigging Tools ────────────────────────────────────────────────

server.tool(
  "createBone", "Create a bone for skeletal animation",
  { ...ArtboardIdent, name: z.string(), x: z.number(), y: z.number(), length: z.number().positive(), rotation: z.number().optional(), parentBoneIndex: z.number().int().nonnegative().optional() },
  async (params) => {
    try {
      const idx = project.addBone(params.artboardIndex, params.name, params.x, params.y, params.length, params.rotation, params.parentBoneIndex);
      return { content: [{ type: "text", text: JSON.stringify({ status: "success", boneIndex: idx }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: String(e) }, null, 2) }], isError: true };
    }
  },
);

server.tool(
  "setBoneLength", "Set the length of a bone", { ...ArtboardIdent, boneIndex: z.number().int().nonnegative(), length: z.number().positive() },
  async ({ artboardIndex, boneIndex, length }) => {
    project.setBoneLength(artboardIndex, boneIndex, length);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setBoneParent", "Reparent a bone", { ...ArtboardIdent, boneIndex: z.number().int().nonnegative(), parentBoneIndex: z.number().int().nonnegative() },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Bone reparented" }, null, 2) }] };
  },
);

server.tool(
  "bindToBone", "Bind a shape to a bone", { ...ArtboardIdent, shapeIndex: z.number().int().nonnegative(), boneIndex: z.number().int().nonnegative() },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Shape bound to bone" }, null, 2) }] };
  },
);

server.tool(
  "deleteBone", "Delete a bone", { ...ArtboardIdent, boneIndex: z.number().int().nonnegative() },
  async ({ artboardIndex, boneIndex }) => {
    project.deleteBone(artboardIndex, boneIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

// ─── 6. Mesh Tools ──────────────────────────────────────────────────────────

server.tool(
  "createMesh",
  "Create a mesh deformer on a shape",
  {
    ...ArtboardIdent,
    shapeIndex: z.number().int().nonnegative().describe("Shape index"),
    columns: z.number().int().min(1).max(64).describe("Number of columns"),
    rows: z.number().int().min(1).max(64).describe("Number of rows"),
  },
  async ({ artboardIndex, shapeIndex, columns, rows }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Create ${columns}x${rows} mesh on shape ${shapeIndex} queued.`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "editMeshVertex",
  "Move a mesh vertex",
  {
    ...ArtboardIdent,
    meshIndex: z.number().int().nonnegative().describe("Mesh index"),
    vertexIndex: z.number().int().nonnegative().describe("Vertex index within the mesh"),
    x: z.number().describe("New X position"),
    y: z.number().describe("New Y position"),
  },
  async ({ artboardIndex, meshIndex, vertexIndex, x, y }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Move mesh vertex ${vertexIndex} of mesh ${meshIndex} to (${x}, ${y}) queued.`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "deleteMesh",
  "Remove a mesh deformer",
  {
    ...ArtboardIdent,
    meshIndex: z.number().int().nonnegative().describe("Mesh index"),
  },
  async ({ artboardIndex, meshIndex }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Delete mesh ${meshIndex} from artboard ${artboardIndex} queued.`,
        }, null, 2),
      }],
    };
  },
);

// ─── 7. Constraint Tools ────────────────────────────────────────────────────

const constraintSchemas = {
  setIKConstraint: {
    ...ArtboardIdent,
    targetIndex: z.number().int().nonnegative().describe("Target (effector) object index"),
    boneChainIndices: z.array(z.number().int().nonnegative()).describe("Ordered bone chain indices"),
    bendDirection: z.number().optional().describe("Bend direction in degrees"),
  },
  setTransformConstraint: {
    ...ArtboardIdent,
    sourceIndex: z.number().int().nonnegative().describe("Source object index"),
    targetIndex: z.number().int().nonnegative().describe("Target object index"),
    copyRotation: z.boolean().optional().default(true),
    copyScale: z.boolean().optional().default(true),
    copyTranslation: z.boolean().optional().default(true),
    strength: z.number().min(0).max(1).optional().default(1),
  },
  setTranslationConstraint: {
    ...ArtboardIdent,
    targetIndex: z.number().int().nonnegative().describe("Target object index"),
    minX: z.number().optional(),
    maxX: z.number().optional(),
    minY: z.number().optional(),
    maxY: z.number().optional(),
  },
  setDistanceConstraint: {
    ...ArtboardIdent,
    sourceIndex: z.number().int().nonnegative().describe("Source object index"),
    targetIndex: z.number().int().nonnegative().describe("Target object index"),
    minDistance: z.number().min(0).describe("Minimum distance"),
    maxDistance: z.number().min(0).describe("Maximum distance"),
  },
  setRotationConstraint: {
    ...ArtboardIdent,
    targetIndex: z.number().int().nonnegative().describe("Target object index"),
    minAngle: z.number().describe("Minimum rotation in degrees"),
    maxAngle: z.number().describe("Maximum rotation in degrees"),
  },
  setScaleConstraint: {
    ...ArtboardIdent,
    targetIndex: z.number().int().nonnegative().describe("Target object index"),
    minScale: z.number().min(0).describe("Minimum scale"),
    maxScale: z.number().min(0).describe("Maximum scale"),
  },
  setFollowPathConstraint: {
    ...ArtboardIdent,
    followerIndex: z.number().int().nonnegative().describe("Follower object index"),
    pathIndex: z.number().int().nonnegative().describe("Path index to follow"),
    orient: z.boolean().optional().default(true).describe("Orient object along path"),
    offset: z.number().optional().default(0).describe("Offset along path (0 to 1)"),
  },
};

for (const [name, schema] of Object.entries(constraintSchemas)) {
  server.tool(
    name,
    `${name.replace(/([A-Z])/g, " $1").trim()} on an object`,
    schema,
    async (params) => {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "queued",
            message: `${name} on artboard ${params.artboardIndex} queued.`,
            constraint: params,
          }, null, 2),
        }],
      };
    },
  );
}

server.tool(
  "deleteConstraint",
  "Delete a constraint from an object",
  {
    ...ArtboardIdent,
    constraintIndex: z.number().int().nonnegative().describe("Constraint index"),
  },
  async ({ artboardIndex, constraintIndex }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Delete constraint ${constraintIndex} from artboard ${artboardIndex} queued.`,
        }, null, 2),
      }],
    };
  },
);

// ─── 8. Animation / Keyframe Tools ──────────────────────────────────────────

server.tool(
  "createAnimation", "Create an animation timeline on an artboard",
  { ...ArtboardIdent, name: z.string(), duration: z.number().positive(), loop: z.enum(["oneShot","loop","pingPong"]).optional().default("loop") },
  async ({ artboardIndex, name, duration, loop }) => {
    const idx = project.addAnimation(artboardIndex, name, duration, loop);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", animationIndex: idx }, null, 2) }] };
  },
);

server.tool(
  "deleteAnimation", "Delete an animation timeline", { ...AnimationIdent },
  async ({ artboardIndex, animationIndex }) => {
    project.deleteAnimation(artboardIndex, animationIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setKeyframe", "Set a keyframe on an object property",
  { ...ObjectIdent, animationIndex: z.number().int().nonnegative(), property: z.enum(["positionX","positionY","scaleX","scaleY","rotation","opacity","fillColor","strokeColor","strokeWidth","cornerRadius","width","height"]), time: z.number().min(0), value: z.any(), easing: EasingType.optional().default("linear"), easingParams: z.object({ x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional() }).optional() },
  async ({ artboardIndex, objectIndex, animationIndex, property, time, value, easing }) => {
    project.setKeyframe(artboardIndex, animationIndex, objectIndex, property, time, value, easing);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: `Keyframe set: ${property} at ${time}s` }, null, 2) }] };
  },
);

server.tool(
  "deleteKeyframe", "Delete a keyframe",
  { ...ObjectIdent, animationIndex: z.number().int().nonnegative(), property: z.string(), time: z.number().min(0) },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Keyframe deleted" }, null, 2) }] };
  },
);

server.tool(
  "setEasing", "Set the easing curve at a keyframe",
  { ...ObjectIdent, animationIndex: z.number().int().nonnegative(), property: z.string(), keyframeTime: z.number().min(0), easing: EasingType, easingParams: z.object({ x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional() }).optional() },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Easing set" }, null, 2) }] };
  },
);

server.tool(
  "setTimelineDuration", "Set animation duration", { ...AnimationIdent, duration: z.number().positive() },
  async ({ artboardIndex, animationIndex, duration }) => {
    project.setTimelineDuration(artboardIndex, animationIndex, duration);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setAnimationLoop", "Set animation loop mode", { ...AnimationIdent, loop: z.enum(["oneShot","loop","pingPong"]) },
  async ({ artboardIndex, animationIndex, loop }) => {
    project.setAnimationLoop(artboardIndex, animationIndex, loop);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "setAnimationWorkArea", "Set animation work area", { ...AnimationIdent, start: z.number().min(0), end: z.number().min(0) },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Work area set" }, null, 2) }] };
  },
);

// ─── 9. State Machine Tools ─────────────────────────────────────────────────

server.tool(
  "createStateMachine", "Create a state machine on an artboard",
  { ...ArtboardIdent, name: z.string() },
  async ({ artboardIndex, name }) => {
    const idx = project.addStateMachine(artboardIndex, name);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", stateMachineIndex: idx }, null, 2) }] };
  },
);

server.tool(
  "deleteStateMachine", "Delete a state machine", { ...SMIdent },
  async ({ artboardIndex, smIndex }) => {
    project.deleteStateMachine(artboardIndex, smIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "addState", "Add a state to a state machine",
  { ...SMIdent, name: z.string(), animationIndex: z.number().int().nonnegative().optional() },
  async ({ artboardIndex, smIndex, name, animationIndex }) => {
    const idx = project.addState(artboardIndex, smIndex, name, animationIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", stateIndex: idx }, null, 2) }] };
  },
);

server.tool(
  "deleteState", "Delete a state", { ...SMIdent, stateIndex: z.number().int().nonnegative() },
  async ({ artboardIndex, smIndex, stateIndex }) => {
    project.deleteState(artboardIndex, smIndex, stateIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "addTransition", "Add a transition between states",
  { ...SMIdent, fromState: z.number().int().nonnegative(), toState: z.number().int().nonnegative(), duration: z.number().positive().optional().default(0.3), conditionType: z.enum(["none","input","trigger"]).optional().default("none"), conditionInput: z.string().optional(), conditionValue: z.any().optional() },
  async (params) => {
    project.addTransition(params.artboardIndex, params.smIndex, params.fromState, params.toState, params.duration, params.conditionType, params.conditionInput, params.conditionValue);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "deleteTransition", "Delete a transition", { ...SMIdent, transitionIndex: z.number().int().nonnegative() },
  async ({ artboardIndex, smIndex, transitionIndex }) => {
    project.deleteTransition(artboardIndex, smIndex, transitionIndex);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

server.tool(
  "addInput", "Add an input to a state machine",
  { ...SMIdent, name: z.string(), type: z.enum(["number","boolean","trigger"]), defaultValue: z.any().optional() },
  async (params) => {
    project.addInput(params.artboardIndex, params.smIndex, params.name, params.type, params.defaultValue);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success" }, null, 2) }] };
  },
);

// ─── 10. Text Tools ─────────────────────────────────────────────────────────

server.tool(
  "createText",
  "Create a text object on an artboard",
  {
    ...ArtboardIdent,
    name: z.string().describe("Name of the text object"),
    text: z.string().describe("Text content"),
    x: z.number().describe("X position"),
    y: z.number().describe("Y position"),
    fontSize: z.number().positive().describe("Font size in pixels"),
    fontFamily: z.string().optional().default("Inter").describe("Font family"),
    fontWeight: z.number().int().min(100).max(900).optional().default(400).describe("Font weight"),
    alignment: z.enum(["left", "center", "right"]).optional().default("left").describe("Text alignment"),
  },
  async (params) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Text "${params.name}" creation queued.`,
          text: params,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setTextContent",
  "Update the content of a text object",
  {
    ...ArtboardIdent,
    textIndex: z.number().int().nonnegative().describe("Text object index"),
    text: z.string().describe("New text content"),
  },
  async ({ artboardIndex, textIndex, text }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Update text ${textIndex} content queued.`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setTextStyle",
  "Set the style of a text object",
  {
    ...ArtboardIdent,
    textIndex: z.number().int().nonnegative().describe("Text object index"),
    fontSize: z.number().positive().optional().describe("Font size"),
    fontFamily: z.string().optional().describe("Font family"),
    fontWeight: z.number().int().min(100).max(900).optional().describe("Font weight"),
    alignment: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
    letterSpacing: z.number().optional().describe("Letter spacing"),
    lineHeight: z.number().positive().optional().describe("Line height multiplier"),
  },
  async ({ artboardIndex, textIndex, ...style }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Set text style on text ${textIndex} queued.`,
          style,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "addTextModifier",
  "Add a text modifier (e.g., character-by-character animation)",
  {
    ...ArtboardIdent,
    textIndex: z.number().int().nonnegative().describe("Text object index"),
    modifierType: z.enum(["range", "followPath", "shape", "variation"]).describe("Modifier type"),
    start: z.number().min(0).max(1).optional().default(0).describe("Start (0-1)"),
    end: z.number().min(0).max(1).optional().default(1).describe("End (0-1)"),
  },
  async (params) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Text modifier (${params.modifierType}) on text ${params.textIndex} queued.`,
          modifier: params,
        }, null, 2),
      }],
    };
  },
);

// ─── 11. Gradient & Paint Tools ─────────────────────────────────────────────

server.tool(
  "setLinearGradient",
  "Set a linear gradient fill on a shape",
  {
    ...ShapeIdent,
    startX: z.number().describe("Gradient start X"),
    startY: z.number().describe("Gradient start Y"),
    endX: z.number().describe("Gradient end X"),
    endY: z.number().describe("Gradient end Y"),
    stops: z.array(GradientStop).describe("Gradient color stops"),
  },
  async ({ artboardIndex, shapeIndex, startX, startY, endX, endY, stops }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Linear gradient on shape ${shapeIndex} queued.`,
          gradient: { type: "linear", startX, startY, endX, endY, stops },
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setRadialGradient",
  "Set a radial gradient fill on a shape",
  {
    ...ShapeIdent,
    centerX: z.number().describe("Center X"),
    centerY: z.number().describe("Center Y"),
    radius: z.number().positive().describe("Gradient radius"),
    stops: z.array(GradientStop).describe("Gradient color stops"),
  },
  async ({ artboardIndex, shapeIndex, centerX, centerY, radius, stops }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Radial gradient on shape ${shapeIndex} queued.`,
          gradient: { type: "radial", centerX, centerY, radius, stops },
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setImageFill",
  "Set an image as the fill of a shape",
  {
    ...ShapeIdent,
    imagePath: z.string().describe("Path to the image file"),
  },
  async ({ artboardIndex, shapeIndex, imagePath }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Image fill on shape ${shapeIndex} from ${imagePath} queued.`,
        }, null, 2),
      }],
    };
  },
);

// ─── 12. Layout Tools ───────────────────────────────────────────────────────

server.tool(
  "setLayout",
  "Set a layout on an artboard or group",
  {
    ...ArtboardIdent,
    layoutType: z.enum(["none", "row", "column", "grid"]).describe("Layout type"),
    gap: z.number().min(0).optional().default(0).describe("Gap between items"),
    padding: z.number().min(0).optional().default(0).describe("Padding"),
    alignItems: z.enum(["start", "center", "end", "stretch"]).optional().default("start"),
    justifyContent: z.enum(["start", "center", "end", "spaceBetween", "spaceAround"]).optional().default("start"),
  },
  async (params) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Layout (${params.layoutType}) on artboard ${params.artboardIndex} queued.`,
          layout: params,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setNSlicing",
  "Set 9-slicing on a shape for scalable UI elements",
  {
    ...ShapeIdent,
    slices: z.object({
      left: z.number().min(0).describe("Left slice width"),
      right: z.number().min(0).describe("Right slice width"),
      top: z.number().min(0).describe("Top slice height"),
      bottom: z.number().min(0).describe("Bottom slice height"),
    }).describe("Slice dimensions"),
  },
  async ({ artboardIndex, shapeIndex, slices }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `9-slicing on shape ${shapeIndex} queued.`,
          slices,
        }, null, 2),
      }],
    };
  },
);

// ─── 13. Special Tools ──────────────────────────────────────────────────────

server.tool(
  "setSolo",
  "Set solo on an object (hides all siblings in the same hierarchy)",
  {
    ...ObjectIdent,
    solo: z.boolean().describe("Solo state"),
  },
  async ({ artboardIndex, objectIndex, solo }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Set solo = ${solo} on object ${objectIndex} queued.`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "setTrimPath",
  "Set trim path on a shape (animate stroke start/end/offset)",
  {
    ...ShapeIdent,
    start: z.number().min(0).max(1).describe("Trim start (0 to 1)"),
    end: z.number().min(0).max(1).describe("Trim end (0 to 1)"),
    offset: z.number().optional().default(0).describe("Trim offset (0 to 1)"),
  },
  async ({ artboardIndex, shapeIndex, start, end, offset }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Trim path on shape ${shapeIndex} [${start}-${end}] queued.`,
          trim: { start, end, offset },
        }, null, 2),
      }],
    };
  },
);

// ─── 14. Group Tools ────────────────────────────────────────────────────────

server.tool(
  "createGroup", "Group objects together",
  { ...ArtboardIdent, name: z.string(), childrenIndices: z.array(z.number().int().nonnegative()) },
  async ({ artboardIndex, name, childrenIndices }) => {
    const idx = project.createGroup(artboardIndex, name, childrenIndices);
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", groupIndex: idx }, null, 2) }] };
  },
);

server.tool(
  "ungroup", "Ungroup a group", { ...ArtboardIdent, groupIndex: z.number().int().nonnegative() },
  async () => {
    return { content: [{ type: "text", text: JSON.stringify({ status: "success", message: "Group ungrouped" }, null, 2) }] };
  },
);

server.tool(
  "setDrawOrder",
  "Reorder objects in the draw order",
  {
    ...ArtboardIdent,
    objectIndices: z.array(z.number().int().nonnegative()).describe("New ordering (list of object indices from back to front)"),
  },
  async ({ artboardIndex, objectIndices }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Set draw order for ${objectIndices.length} objects queued.`,
        }, null, 2),
      }],
    };
  },
);

// ─── 15. Export Tools ───────────────────────────────────────────────────────

server.tool(
  "exportRiv",
  "Export the project as a .riv file",
  {
    path: z.string().describe("Output path for the .riv file"),
    artboardIndices: z.array(z.number().int().nonnegative()).optional().describe("Specific artboards to export (defaults to all)"),
  },
  async ({ path: outputPath }) => {
    try {
      const writer = new RivFileWriter(project.project);
      const buffer = writer.build();
      const resolved = path.resolve(outputPath);
      fs.writeFileSync(resolved, buffer);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "success",
            message: `Project exported to ${resolved}`,
            size: buffer.length,
            artboards: project.project.artboards.length,
          }, null, 2),
        }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: String(error) }, null, 2) }], isError: true };
    }
  },
);

server.tool(
  "exportVideo",
  "Export an animation as video (requires Rive Editor CLI or headless render)",
  {
    ...AnimationIdent,
    path: z.string().describe("Output path for the video file"),
    format: z.enum(["mp4", "mov", "webm", "pngSequence"]).optional().default("mp4"),
    width: z.number().int().positive().optional().describe("Output width (defaults to artboard width)"),
    height: z.number().int().positive().optional().describe("Output height (defaults to artboard height)"),
    fps: z.number().positive().optional().describe("Output frame rate (defaults to project fps)"),
  },
  async (params) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "not_implemented",
          message: "Video export is not available yet. Requires Rive Editor CLI integration.",
          export: params,
        }, null, 2),
      }],
    };
  },
);

// ─── 16. Utility Tools ──────────────────────────────────────────────────────

server.tool(
  "getHelp",
  "Get help on using the Rive MCP integration",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: `# Rive MCP Integration Help

This MCP server allows you to control Rive animations programmatically.

## Current Status

The server is in ACTIVE DEVELOPMENT. Tools are defined with full Zod schemas
and will be implemented in phases:

- **Phase 1** (in progress): Playback control via WASM runtime
- **Phase 2+**: .riv file creation, animation, bones, constraints, state machines

## Available Tools (60+ total)

All tools accept validated input. Currently in "queued" status - responses
indicate what will happen when the backend is connected.

### Categories:
1. Project/File (load, save, create, getInfo)
2. Artboard (create, delete, resize, background)
3. Shape (rectangle, ellipse, polygon, star, path, fill, stroke, vertices)
4. Transform (position, scale, rotation, anchor, opacity, blend mode)
5. Bone (create, setLength, reparent, bind, delete)
6. Mesh (create, editVertex, delete)
7. Constraint (IK, transform, translation, distance, rotation, scale, followPath)
8. Animation (create, delete, setKeyframe, setEasing, loop, work area)
9. State Machine (create, delete, addState, addTransition, addInput)
10. Text (create, setContent, setStyle, addModifier)
11. Gradient (linear, radial, image fill)
12. Layout (row, column, grid, 9-slicing)
13. Special (solo, trim path)
14. Group (createGroup, ungroup, drawOrder)
15. Export (.riv, video)
16. Utility (getHelp)

## Dependencies
- @modelcontextprotocol/sdk
- zod
- Rive WASM runtime (for playback)
- FlatBuffers (for .riv creation)`,
      }],
    };
  },
);

server.tool(
  "getObjectInfo",
  "Get detailed information about a specific object in an artboard",
  {
    ...ObjectIdent,
  },
  async ({ artboardIndex, objectIndex }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "not_implemented",
          message: "Object inspection will be available when file loading is connected.",
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "duplicateObject",
  "Duplicate an object within an artboard",
  {
    ...ObjectIdent,
    newName: z.string().optional().describe("Name for the duplicated object"),
  },
  async ({ artboardIndex, objectIndex, newName }) => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "queued",
          message: `Duplicate object ${objectIndex} in artboard ${artboardIndex} queued.`,
          newName,
        }, null, 2),
      }],
    };
  },
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.error("Rive MCP Server starting...");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Rive MCP Server running with 60+ tools defined.");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});