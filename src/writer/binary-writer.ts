/**
 * Rive Binary Writer — handles low-level encoding for .riv file format.
 *
 * Wire format (from rive-runtime BinaryWriter/BinaryReader):
 * - varuint: LEB128 unsigned integer encoding
 * - float32: 4-byte IEEE 754 little-endian
 * - string: varuint length + UTF-8 bytes
 * - color: 4-byte uint32 little-endian (ARGB packed)
 * - bool: 1 byte (0 or 1)
 */

export class RivBinaryWriter {
  private chunks: Uint8Array[] = [];

  /** Write a raw byte */
  writeByte(b: number): void {
    this.chunks.push(new Uint8Array([b & 0xff]));
  }

  /** Write raw bytes */
  writeBytes(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  /** LEB128 unsigned varint encoding */
  writeVarUint(value: number): void {
    if (value < 0) value = 0;
    const buf: number[] = [];
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value !== 0) byte |= 0x80;
      buf.push(byte);
    } while (value !== 0);
    this.chunks.push(new Uint8Array(buf));
  }

  /** Write a 32-bit float (IEEE 754 little-endian) */
  writeFloat32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  /** Write a 32-bit unsigned integer (little-endian) */
  writeUint32(value: number): void {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    this.chunks.push(new Uint8Array(buf));
  }

  /** Write a string: varuint length + UTF-8 bytes */
  writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeVarUint(encoded.length);
    this.chunks.push(encoded);
  }

  /** Write a color (ARGB packed as uint32) */
  writeColor(r: number, g: number, b: number, a: number = 1): void {
    const ai = Math.round(a * 255) & 0xff;
    const ri = r & 0xff;
    const gi = g & 0xff;
    const bi = b & 0xff;
    const argb = (ai << 24) | (ri << 16) | (gi << 8) | bi;
    this.writeUint32(argb);
  }

  /** Write a bool (1 byte) */
  writeBool(value: boolean): void {
    this.writeByte(value ? 1 : 0);
  }

  /** Write a property key-value pair with the appropriate type */
  writeProperty(key: number, value: unknown, type: PropertyType): void {
    this.writeVarUint(key);
    switch (type) {
      case PropertyType.Uint:
        this.writeVarUint(value as number);
        break;
      case PropertyType.String:
        this.writeString(value as string);
        break;
      case PropertyType.Double:
        this.writeFloat32(value as number);
        break;
      case PropertyType.Color: {
        const c = value as { r: number; g: number; b: number; a?: number };
        this.writeColor(c.r, c.g, c.b, c.a);
        break;
      }
      case PropertyType.Bool:
        this.writeBool(value as boolean);
        break;
    }
  }

  /** Write object terminator (varuint 0) */
  writeObjectEnd(): void {
    this.writeVarUint(0);
  }

  /** Write the file header and property TOC */
  writeHeader(propertyKeys: number[]): void {
    // Magic bytes
    this.chunks.push(new TextEncoder().encode("RIVE"));

    // Version
    this.writeVarUint(7); // majorVersion
    this.writeVarUint(0); // minorVersion
    this.writeVarUint(0); // fileId

    // Property TOC: list of property keys, terminated by 0
    for (const key of propertyKeys) {
      this.writeVarUint(key);
    }
    this.writeVarUint(0);

    // Packed field types: 2 bits per key, packed into 32-bit words
    let packed = 0;
    let bitPos = 0;
    for (const key of propertyKeys) {
      const ft = getFieldTypeForProperty(key);
      packed |= (ft << bitPos);
      bitPos += 2;
      if (bitPos >= 32) {
        this.writeUint32(packed);
        packed = 0;
        bitPos = 0;
      }
    }
    if (bitPos > 0) {
      this.writeUint32(packed);
    }
  }

  /** Get the complete buffer */
  toBuffer(): Uint8Array {
    const totalLen = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

/** Field types as encoded in the property TOC */
export enum PropertyType {
  Uint = 0,
  String = 1,
  Double = 2,
  Color = 3,
  Bool = 4,
}

/**
 * Get the field type for a given property key.
 * Mappings extracted from rive-runtime CoreRegistry and generated *_base.hpp files.
 */
function getFieldTypeForProperty(key: number): number {
  // Verified property key → type mappings from C++ runtime
  const known: Record<number, PropertyType> = {
    // ComponentBase
    4: PropertyType.String,   // name
    5: PropertyType.Uint,     // parentId
    // NodeBase
    13: PropertyType.Double,  // x
    14: PropertyType.Double,  // y
    // TransformComponentBase
    15: PropertyType.Double,  // rotation
    16: PropertyType.Double,  // scaleX
    17: PropertyType.Double,  // scaleY
    // WorldTransformComponentBase
    18: PropertyType.Double,  // opacity
    // ParametricPathBase
    20: PropertyType.Double,  // width
    21: PropertyType.Double,  // height
    // RectangleBase
    31: PropertyType.Double,  // cornerRadiusTL
    161: PropertyType.Double, // cornerRadiusTR
    162: PropertyType.Double, // cornerRadiusBL
    163: PropertyType.Double, // cornerRadiusBR
    164: PropertyType.Bool,   // linkCornerRadius
    // SolidColorBase
    37: PropertyType.Color,   // colorValue
    // FillBase
    40: PropertyType.Uint,    // fillRule
    // StrokeBase
    47: PropertyType.Double,  // thickness
    48: PropertyType.Uint,    // cap
    49: PropertyType.Uint,    // join
    50: PropertyType.Bool,    // transformAffectsStroke
    // BoneBase
    89: PropertyType.Double,  // length
    // KeyedObjectBase
    51: PropertyType.Uint,    // objectId
    // KeyedPropertyBase
    53: PropertyType.Uint,    // propertyKey
    // KeyFrameBase
    67: PropertyType.Double,  // frame
    // KeyFrameDoubleBase
    166: PropertyType.Double, // value
    // LinearAnimationBase (animation name)
    55: PropertyType.String,  // name
    // AnimationBase duration (checking...)
    // StateMachineComponentBase
    138: PropertyType.String, // name
    // StateTransitionBase
    151: PropertyType.Uint,   // stateToId (we approximate)
    // TransitionInputConditionBase
    155: PropertyType.Uint,   // inputId
    // ConstraintBase
    172: PropertyType.Double, // strength
    // Artboard properties
    11: PropertyType.Double,  // originX
    12: PropertyType.Double,  // originY
  };

  const t = known[key];
  if (t !== undefined) return t;

  // For unknown keys, default to Uint (runtime will skip if wrong version)
  return PropertyType.Uint;
}