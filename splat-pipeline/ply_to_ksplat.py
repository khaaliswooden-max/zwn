"""Convert a Gaussian Splatting .ply file to .ksplat format.

.ksplat is the compact binary format used by @mkkellogg/gaussian-splats-3d.
It stores: position (3×f32), scale (3×f32), color (4×u8), rotation (4×u8).

Usage:
    python ply_to_ksplat.py input.ply output.ksplat

Reference: https://github.com/mkkellogg/GaussianSplats3D/blob/main/src/Splat.js
"""

import struct
import sys
from pathlib import Path


def read_ply_gaussians(path: Path) -> list[dict]:
    """Parse a 3DGS .ply file and return list of Gaussian dicts."""
    with open(path, "rb") as f:
        # Parse ASCII header
        header_lines = []
        while True:
            line = f.readline().decode("ascii", errors="ignore").strip()
            header_lines.append(line)
            if line == "end_header":
                break

        # Extract element count and property order
        num_gaussians = 0
        properties: list[str] = []
        prop_types: list[str] = []
        for line in header_lines:
            parts = line.split()
            if parts[:2] == ["element", "vertex"]:
                num_gaussians = int(parts[2])
            elif parts[0] == "property":
                prop_types.append(parts[1])
                properties.append(parts[2])

        type_sizes = {"float": 4, "double": 8, "uchar": 1, "int": 4, "uint": 4, "short": 2, "ushort": 2}
        type_fmts = {"float": "f", "double": "d", "uchar": "B", "int": "i", "uint": "I", "short": "h", "ushort": "H"}

        row_size = sum(type_sizes.get(t, 4) for t in prop_types)
        row_fmt = "<" + "".join(type_fmts.get(t, "f") for t in prop_types)

        gaussians = []
        for _ in range(num_gaussians):
            row = struct.unpack(row_fmt, f.read(row_size))
            g = dict(zip(properties, row))
            gaussians.append(g)

    return gaussians


def sigmoid(x: float) -> float:
    import math
    return 1.0 / (1.0 + math.exp(-x))


def write_ksplat(gaussians: list[dict], path: Path) -> None:
    """Write Gaussians in .ksplat binary format.

    Per-splat record (32 bytes):
      position:  3 × float32  (12 bytes)
      scale:     3 × float32  (12 bytes)
      color:     4 × uint8    (4 bytes) — RGBA, opacity from opacity_0
      rotation:  4 × uint8    (4 bytes) — normalized quaternion
    """
    import math

    with open(path, "wb") as f:
        for g in gaussians:
            # Position
            x = float(g.get("x", 0))
            y = float(g.get("y", 0))
            z = float(g.get("z", 0))
            f.write(struct.pack("<3f", x, y, z))

            # Scale (stored as log in .ply, exponentiate)
            sx = math.exp(float(g.get("scale_0", -2)))
            sy = math.exp(float(g.get("scale_1", -2)))
            sz = math.exp(float(g.get("scale_2", -2)))
            f.write(struct.pack("<3f", sx, sy, sz))

            # Color from spherical harmonics DC term (f_dc_0..2) → [0,255]
            r = int(min(255, max(0, (0.5 + 0.2820948 * float(g.get("f_dc_0", 0))) * 255)))
            gv = int(min(255, max(0, (0.5 + 0.2820948 * float(g.get("f_dc_1", 0))) * 255)))
            b = int(min(255, max(0, (0.5 + 0.2820948 * float(g.get("f_dc_2", 0))) * 255)))
            opacity = int(min(255, max(0, sigmoid(float(g.get("opacity", 0))) * 255)))
            f.write(struct.pack("<4B", r, gv, b, opacity))

            # Rotation quaternion (stored as raw floats, normalize to uint8)
            rw = float(g.get("rot_0", 1))
            rx = float(g.get("rot_1", 0))
            ry = float(g.get("rot_2", 0))
            rz = float(g.get("rot_3", 0))
            norm = math.sqrt(rw*rw + rx*rx + ry*ry + rz*rz) or 1.0
            rw, rx, ry, rz = rw/norm, rx/norm, ry/norm, rz/norm
            f.write(struct.pack("<4B",
                int((rw + 1) * 127.5),
                int((rx + 1) * 127.5),
                int((ry + 1) * 127.5),
                int((rz + 1) * 127.5),
            ))


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: python ply_to_ksplat.py input.ply output.ksplat")
        sys.exit(1)

    ply_path = Path(sys.argv[1])
    ksplat_path = Path(sys.argv[2])

    print(f"Reading {ply_path}...")
    gaussians = read_ply_gaussians(ply_path)
    print(f"  {len(gaussians):,} Gaussians")

    print(f"Writing {ksplat_path}...")
    write_ksplat(gaussians, ksplat_path)

    size_mb = ksplat_path.stat().st_size / 1024 / 1024
    print(f"  Done. {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
