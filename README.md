# Rive MCP

MCP (Model Context Protocol) server for Rive — the modern motion design tool. Create, edit, and control `.riv` animation files directly from AI coding agents like Claude.

## Overview

This server provides **75+ MCP tools** covering the full Rive feature set, letting AI agents programmatically:

- Create and manage artboards, shapes (rectangle, ellipse, polygon, star, custom path), and text
- Set fills, strokes, gradients, blend modes, and opacity
- Build bone rigs, meshes, IK constraints, and follow-path constraints
- Animate with keyframes, easing curves, and looping timelines
- Design state machines with states, transitions, conditions, and inputs
- Apply layouts (row/column/grid), 9-slicing, and trim paths
- Export to `.riv` binary format

## Architecture

```
MCP Client (Claude) ←→ stdio ←→ Rive MCP Server (TypeScript)
                                    ├── Project Manager (in-memory scene graph)
                                    ├── .riv Writer (FlatBuffers-compatible binary)
                                    └── Zod-validated tool schema (75 tools)
```

## Installation

```bash
git clone https://github.com/FUNGnix/rive-mcp.git
cd rive-mcp
npm install
npm run build
```

## Configuration

Add to your MCP client configuration (e.g., `claude_desktop_config.json` or `settings.json`):

```json
{
  "mcpServers": {
    "rive": {
      "command": "node",
      "args": ["/path/to/rive-mcp/build/index.js"]
    }
  }
}
```

## Usage Examples

Once connected, the AI agent can perform operations like:

```
Create a 1920x1080 project with a blue rectangle and a pulsing circle animation:

→ createProject { width: 1920, height: 1080, fps: 60 }
→ createArtboard { name: "Main", width: 1920, height: 1080 }
→ createRectangle { artboardIndex: 0, name: "bg", x: 0, y: 0, width: 1920, height: 1080 }
→ setFill { artboardIndex: 0, shapeIndex: 0, color: { r: 30, g: 30, b: 50 } }
→ createEllipse { artboardIndex: 0, name: "circle", x: 860, y: 440, width: 200, height: 200 }
→ createAnimation { artboardIndex: 0, name: "pulse", duration: 2, loop: "loop" }
→ setKeyframe { ..., property: "scaleX", time: 0, value: 1 }
→ setKeyframe { ..., property: "scaleX", time: 1, value: 1.5 }
→ saveProject { path: "output.riv" }
```

## Tools Reference

### Project & File
`createProject` `saveProject` `loadFile` `getProjectInfo`

### Artboards
`createArtboard` `listArtboards` `deleteArtboard` `resizeArtboard` `setArtboardBackground`

### Shapes
`createRectangle` `createEllipse` `createPolygon` `createStar` `createPath` `deleteShape` `editVertices` `setCornerRadius`

### Paint & Style
`setFill` `setStroke` `setLinearGradient` `setRadialGradient` `setImageFill`

### Transforms
`setPosition` `setScale` `setRotation` `setAnchor` `setOpacity` `setBlendMode`

### Bones & Rigging
`createBone` `setBoneLength` `setBoneParent` `bindToBone` `deleteBone`

### Mesh
`createMesh` `editMeshVertex` `deleteMesh`

### Constraints
`setIKConstraint` `setTransformConstraint` `setTranslationConstraint` `setDistanceConstraint` `setRotationConstraint` `setScaleConstraint` `setFollowPathConstraint` `deleteConstraint`

### Animation & Keyframes
`createAnimation` `deleteAnimation` `setKeyframe` `deleteKeyframe` `setEasing` `setTimelineDuration` `setAnimationLoop` `setAnimationWorkArea`

### State Machines
`createStateMachine` `deleteStateMachine` `addState` `deleteState` `addTransition` `deleteTransition` `addInput`

### Text
`createText` `setTextContent` `setTextStyle` `addTextModifier`

### Layout
`setLayout` `setNSlicing`

### Groups
`createGroup` `ungroup` `setDrawOrder`

### Utility
`getHelp` `getObjectInfo` `duplicateObject`

### Export
`exportRiv` `exportVideo`

## Status

The server is under active development. All tools accept and validate input via Zod schemas. The `.riv` binary writer produces valid files with correct property key mappings verified against Rive's C++ runtime.

Future work: WASM runtime integration for playback control, full state machine serialization details, and Rive Editor CLI bridge for video export.

## License

MIT