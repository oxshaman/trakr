#!/usr/bin/env python3
"""Draws the trakr app icons as PNG files, using only the standard library.

Usage: python3 tools/make_icons.py

The icon is a dumbbell on a butter-yellow square. The same shape is in
icons/icon.svg. Run this again after changing the colors or the glyph.
"""
import os
import struct
import zlib

BUTTER = (0xFF, 0xEF, 0xA8)
INK = (0x11, 0x11, 0x11)

# Line segments on a 24 unit grid, the same dumbbell the app uses as an icon.
SEGMENTS = [
    ((7, 6.5), (7, 17.5)),
    ((4, 9), (4, 15)),
    ((17, 6.5), (17, 17.5)),
    ((20, 9), (20, 15)),
    ((7, 12), (17, 12)),
]
STROKE = 2.5


def dist_to_segment(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def corner_alpha(x, y, size, radius):
    """Coverage of a rounded square at pixel centre (x, y), 0 to 1."""
    if radius <= 0:
        return 1.0
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
    return max(0.0, min(1.0, radius - d + 0.5))


def render(size, glyph_scale, radius_ratio):
    """Returns RGBA rows. glyph_scale is the share of the icon the 24 unit grid covers."""
    unit = size * glyph_scale / 24.0
    offset = (size - 24.0 * unit) / 2.0
    half = STROKE * unit / 2.0
    radius = size * radius_ratio
    rows = []
    for y in range(size):
        row = bytearray()
        py = y + 0.5
        for x in range(size):
            px = x + 0.5
            gx, gy = (px - offset) / unit, (py - offset) / unit
            d = min(dist_to_segment(gx, gy, a, b) for a, b in SEGMENTS) * unit
            ink = max(0.0, min(1.0, half - d + 0.5))
            r, g, b = (round(BUTTER[i] + (INK[i] - BUTTER[i]) * ink) for i in range(3))
            row += bytes((r, g, b, round(255 * corner_alpha(px, py, size, radius))))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    size = len(rows)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {os.path.relpath(path)} ({len(png)} bytes)")


def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out, exist_ok=True)
    # Regular icons have rounded corners. The maskable icon and the iOS icon
    # fill the square, because the system cuts its own shape out of them.
    write_png(os.path.join(out, "icon-192.png"), render(192, 0.70, 0.22))
    write_png(os.path.join(out, "icon-512.png"), render(512, 0.70, 0.22))
    write_png(os.path.join(out, "icon-maskable-512.png"), render(512, 0.56, 0))
    write_png(os.path.join(out, "apple-touch-icon.png"), render(180, 0.66, 0))


if __name__ == "__main__":
    main()
