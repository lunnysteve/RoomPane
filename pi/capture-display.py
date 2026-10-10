#!/usr/bin/env python3
"""Capture the active X11 screen using libX11 and Python's standard library."""
import ctypes as c
import os
from pathlib import Path
import struct
import sys
import zlib


class XImage(c.Structure):
    _fields_ = [
        ('width', c.c_int), ('height', c.c_int), ('xoffset', c.c_int),
        ('format', c.c_int), ('data', c.c_void_p), ('byte_order', c.c_int),
        ('bitmap_unit', c.c_int), ('bitmap_bit_order', c.c_int),
        ('bitmap_pad', c.c_int), ('depth', c.c_int), ('bytes_per_line', c.c_int),
        ('bits_per_pixel', c.c_int), ('red_mask', c.c_ulong),
        ('green_mask', c.c_ulong), ('blue_mask', c.c_ulong),
    ]


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: sudo python3 capture-display.py /path/to/screen.png')
    os.environ.setdefault('DISPLAY', ':0')
    if os.geteuid() == 0:
        os.environ.setdefault('XAUTHORITY', '/var/run/lightdm/root/:0')
    lib = c.CDLL('libX11.so.6')
    lib.XOpenDisplay.argtypes = [c.c_char_p]
    lib.XOpenDisplay.restype = c.c_void_p
    lib.XDefaultScreen.argtypes = [c.c_void_p]
    lib.XDefaultScreen.restype = c.c_int
    lib.XDefaultRootWindow.argtypes = [c.c_void_p]
    lib.XDefaultRootWindow.restype = c.c_ulong
    for name in ['XDisplayWidth', 'XDisplayHeight']:
        getattr(lib, name).argtypes = [c.c_void_p, c.c_int]
        getattr(lib, name).restype = c.c_int
    lib.XGetImage.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int, c.c_uint, c.c_uint, c.c_ulong, c.c_int]
    lib.XGetImage.restype = c.POINTER(XImage)
    lib.XDestroyImage.argtypes = [c.POINTER(XImage)]
    lib.XCloseDisplay.argtypes = [c.c_void_p]
    display = lib.XOpenDisplay(None)
    if not display:
        raise SystemExit('Cannot access the active X11 session. Run with sudo.')
    image = None
    try:
        screen = lib.XDefaultScreen(display)
        width = lib.XDisplayWidth(display, screen)
        height = lib.XDisplayHeight(display, screen)
        image = lib.XGetImage(display, lib.XDefaultRootWindow(display), 0, 0, width, height, c.c_ulong(-1).value, 2)
        if not image:
            raise SystemExit('X11 could not capture the screen.')
        info = image.contents
        if info.bits_per_pixel not in (16, 24, 32):
            raise SystemExit(f'Unsupported pixel format: {info.bits_per_pixel}')
        raw = c.string_at(info.data, info.bytes_per_line * height)
        pixel_size = info.bits_per_pixel // 8
        byte_order = 'little' if info.byte_order == 0 else 'big'
        masks = [info.red_mask, info.green_mask, info.blue_mask]
        if not all(masks):
            raise SystemExit('Screen does not use TrueColor pixels.')
        shifts = [(mask & -mask).bit_length() - 1 for mask in masks]
        maxima = [mask >> shift for mask, shift in zip(masks, shifts)]
        rows = bytearray()
        for y in range(height):
            rows.append(0)
            for x in range(width):
                offset = y * info.bytes_per_line + x * pixel_size
                pixel = int.from_bytes(raw[offset:offset + pixel_size], byte_order)
                rows.extend(((pixel & mask) >> shift) * 255 // maximum for mask, shift, maximum in zip(masks, shifts, maxima))
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        png += chunk(b'IDAT', zlib.compress(rows, 1)) + chunk(b'IEND', b'')
        target = Path(sys.argv[1])
        target.write_bytes(png)
        os.chmod(target, 0o644)
        print(f'Saved {width}x{height} screen capture to {target}')
    finally:
        if image:
            lib.XDestroyImage(image)
        lib.XCloseDisplay(display)


if __name__ == '__main__':
    main()
