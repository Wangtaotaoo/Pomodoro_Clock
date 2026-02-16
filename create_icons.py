#!/usr/bin/env python3
"""Create PNG icons from SVG"""

import subprocess
import os

# Sizes to create
sizes = [16, 48, 128]

for size in sizes:
    input_svg = "icon128.svg"
    output_png = f"icon{size}.png"

    cmd = [
        "inkscape",
        "--export-type=png",
        "--export-filename", output_png,
        "--export-width", str(size),
        "--export-height", str(size),
        input_svg
    ]

    print(f"Creating {output_png}...")
    try:
        subprocess.run(cmd, check=True)
        print(f"  Success: {output_png}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        # If inkscape not available, try convert
        cmd = [
            "convert",
            "-resize", f"{size}x{size}",
            input_svg,
            output_png
        ]
        try:
            subprocess.run(cmd, check=True)
            print(f"  Success: {output_png}")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(f"  Warning: Could not create {output_png}")
            print("  Please install inkscape or ImageMagick, or convert the SVG manually")
