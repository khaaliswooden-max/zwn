"""Convert COLMAP sparse reconstruction to nerfstudio transforms.json format.

This is a lightweight alternative to ns-process-data for cases where
COLMAP has already been run separately.

Usage:
    python colmap_to_nerf.py \
        --colmap_dir work/world-nebula/colmap_out \
        --image_dir  work/world-nebula/frames \
        --output_dir work/world-nebula/ns_data
"""

import argparse
import json
import math
import shutil
import struct
from pathlib import Path


def read_colmap_cameras_binary(path: Path) -> dict:
    cameras = {}
    with open(path, "rb") as f:
        num_cameras = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_cameras):
            cam_id = struct.unpack("<I", f.read(4))[0]
            model_id = struct.unpack("<I", f.read(4))[0]
            width = struct.unpack("<Q", f.read(8))[0]
            height = struct.unpack("<Q", f.read(8))[0]
            num_params = {0: 3, 1: 4, 2: 4, 3: 5, 4: 5, 5: 8, 6: 12, 7: 5, 8: 5, 9: 8, 10: 5}.get(model_id, 4)
            params = struct.unpack(f"<{num_params}d", f.read(8 * num_params))
            cameras[cam_id] = {
                "model_id": model_id,
                "width": width,
                "height": height,
                "params": params,
            }
    return cameras


def read_colmap_images_binary(path: Path) -> dict:
    images = {}
    with open(path, "rb") as f:
        num_images = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_images):
            image_id = struct.unpack("<I", f.read(4))[0]
            qvec = struct.unpack("<4d", f.read(32))
            tvec = struct.unpack("<3d", f.read(24))
            cam_id = struct.unpack("<I", f.read(4))[0]
            name_chars = []
            while True:
                c = f.read(1)
                if c == b"\x00":
                    break
                name_chars.append(c.decode("utf-8"))
            name = "".join(name_chars)
            num_points2d = struct.unpack("<Q", f.read(8))[0]
            f.read(24 * num_points2d)  # skip 2D points
            images[image_id] = {
                "qvec": qvec,
                "tvec": tvec,
                "camera_id": cam_id,
                "name": name,
            }
    return images


def qvec_to_rotation_matrix(q: tuple) -> list:
    qw, qx, qy, qz = q
    R = [
        [1 - 2*(qy**2 + qz**2), 2*(qx*qy - qw*qz), 2*(qx*qz + qw*qy)],
        [2*(qx*qy + qw*qz), 1 - 2*(qx**2 + qz**2), 2*(qy*qz - qw*qx)],
        [2*(qx*qz - qw*qy), 2*(qy*qz + qw*qx), 1 - 2*(qx**2 + qy**2)],
    ]
    return R


def colmap_to_transform_matrix(qvec: tuple, tvec: tuple) -> list:
    """Convert COLMAP camera extrinsics (world-to-camera) to nerfstudio camera-to-world 4x4."""
    R = qvec_to_rotation_matrix(qvec)
    # COLMAP: world-to-camera. nerfstudio: camera-to-world. Invert.
    # R_cw^T = R_wc; t_wc = -R_cw^T @ t_cw
    Rt = [[R[j][i] for j in range(3)] for i in range(3)]  # transpose
    t = tvec
    t_wc = [
        -(Rt[0][0]*t[0] + Rt[0][1]*t[1] + Rt[0][2]*t[2]),
        -(Rt[1][0]*t[0] + Rt[1][1]*t[1] + Rt[1][2]*t[2]),
        -(Rt[2][0]*t[0] + Rt[2][1]*t[1] + Rt[2][2]*t[2]),
    ]
    return [
        [Rt[0][0], Rt[0][1], Rt[0][2], t_wc[0]],
        [Rt[1][0], Rt[1][1], Rt[1][2], t_wc[1]],
        [Rt[2][0], Rt[2][1], Rt[2][2], t_wc[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert COLMAP binary to nerfstudio transforms.json")
    parser.add_argument("--colmap_dir", required=True, type=Path)
    parser.add_argument("--image_dir", required=True, type=Path)
    parser.add_argument("--output_dir", required=True, type=Path)
    args = parser.parse_args()

    sparse_dir = args.colmap_dir / "sparse" / "0"
    cameras_path = sparse_dir / "cameras.bin"
    images_path = sparse_dir / "images.bin"

    if not cameras_path.exists() or not images_path.exists():
        raise FileNotFoundError(
            f"COLMAP binary files not found in {sparse_dir}. "
            "Ensure COLMAP ran successfully."
        )

    cameras = read_colmap_cameras_binary(cameras_path)
    images = read_colmap_images_binary(images_path)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    images_out = args.output_dir / "images"
    images_out.mkdir(exist_ok=True)

    # Use first camera for global intrinsics
    cam = next(iter(cameras.values()))
    w, h = cam["width"], cam["height"]
    params = cam["params"]

    # params[0] = fx for PINHOLE / SIMPLE_RADIAL / RADIAL
    fx = params[0]
    fy = params[1] if len(params) > 1 and cam["model_id"] != 0 else fx
    cx = params[2] if len(params) > 2 else w / 2
    cy = params[3] if len(params) > 3 else h / 2

    fl_x = fx
    fl_y = fy
    angle_x = 2 * math.atan(w / (2 * fl_x))
    angle_y = 2 * math.atan(h / (2 * fl_y))

    frames = []
    for img in sorted(images.values(), key=lambda x: x["name"]):
        src_path = args.image_dir / img["name"]
        if not src_path.exists():
            continue
        dst_path = images_out / img["name"]
        shutil.copy2(src_path, dst_path)

        transform = colmap_to_transform_matrix(img["qvec"], img["tvec"])
        frames.append({
            "file_path": f"images/{img['name']}",
            "transform_matrix": transform,
        })

    transforms = {
        "camera_model": "OPENCV",
        "fl_x": fl_x,
        "fl_y": fl_y,
        "cx": cx,
        "cy": cy,
        "w": w,
        "h": h,
        "camera_angle_x": angle_x,
        "camera_angle_y": angle_y,
        "frames": frames,
    }

    out_path = args.output_dir / "transforms.json"
    with open(out_path, "w") as f:
        json.dump(transforms, f, indent=2)

    print(f"Wrote {len(frames)} frames to {out_path}")


if __name__ == "__main__":
    main()
