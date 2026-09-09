#!/usr/bin/env python3
"""
Generate official MIZAN Open Graph & Social Share Preview images.
Restores the original, prestigious ivory-canvas card featuring the approved
MIZAN brand emblem, Arabic calligraphy, and bilingual typography.
"""
import subprocess
import os
import base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(ROOT, "public", "brand", "mizan-logo-approved.png")
OUT_PUBLIC_JPG = os.path.join(ROOT, "public", "brand", "mizan-og.jpg")
OUT_PUBLIC_PNG = os.path.join(ROOT, "public", "brand", "mizan-og.png")
OUT_DIST_JPG = os.path.join(ROOT, "dist", "brand", "mizan-og.jpg")
OUT_DIST_PNG = os.path.join(ROOT, "dist", "brand", "mizan-og.png")
OUT_SVG = os.path.join(ROOT, "brand-source", "mizan-og.svg")

def generate():
    if not os.path.exists(LOGO_PATH):
        raise FileNotFoundError(f"Logo not found: {LOGO_PATH}")

    # 1. Read logo for SVG embedding
    with open(LOGO_PATH, "rb") as f:
        logo_data = f.read()
    logo_b64 = base64.b64encode(logo_data).decode("ascii")

    # 2. Build SVG source
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="mizan-bg" cx="50%" cy="48%" r="65%">
      <stop offset="0%" stop-color="#fffefb"/>
      <stop offset="55%" stop-color="#f7f5ef"/>
      <stop offset="100%" stop-color="#f1efe8"/>
    </radialGradient>
    <linearGradient id="gold-hairline" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b98b4e" stop-opacity="0.35"/>
      <stop offset="50%" stop-color="#e8cb93" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#b98b4e" stop-opacity="0.35"/>
    </linearGradient>
  </defs>

  <!-- Canvas Surface -->
  <rect width="1200" height="630" fill="url(#mizan-bg)"/>

  <!-- Subtle Prestige Framing -->
  <rect x="22" y="22" width="1156" height="586" rx="18" fill="none" stroke="url(#gold-hairline)" stroke-width="1.5"/>
  <rect x="30" y="30" width="1140" height="570" rx="14" fill="none" stroke="#214c40" stroke-opacity="0.08" stroke-width="1"/>

  <!-- Master Approved MIZAN Brand Emblem & Typography -->
  <image href="data:image/png;base64,{logo_b64}" x="384" y="60" width="432" height="510" preserveAspectRatio="xMidYMid meet"/>
</svg>
'''
    with open(OUT_SVG, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Wrote SVG source: {OUT_SVG}")

    # 3. Render pixel-perfect PNG using ImageMagick
    temp_bg = "/tmp/mizan_og_bg.png"
    temp_frame = "/tmp/mizan_og_frame.png"
    temp_full_png = "/tmp/mizan_og_master.png"
    temp_full_jpg = "/tmp/mizan_og_master.jpg"

    # Background
    subprocess.run([
        "convert", "-size", "1200x630",
        "radial-gradient:#fffefb-#f1efe8",
        temp_bg
    ], check=True)

    # Frame
    subprocess.run([
        "convert", temp_bg,
        "-fill", "none",
        "-stroke", "rgba(185,139,78,0.35)", "-strokewidth", "1.5",
        "-draw", "roundrectangle 22,22 1178,608 18,18",
        "-stroke", "rgba(33,76,64,0.08)", "-strokewidth", "1",
        "-draw", "roundrectangle 30,30 1170,600 14,14",
        temp_frame
    ], check=True)

    # Composite trimmed logo centered
    subprocess.run([
        "convert", temp_frame,
        "(", LOGO_PATH, "-trim", "+repage", "-resize", "x510", ")",
        "-gravity", "center",
        "-composite",
        temp_full_png
    ], check=True)

    # Generate high quality progressive JPEG (optimized for WhatsApp preview < 300KB)
    subprocess.run([
        "convert", temp_full_png,
        "-quality", "93",
        "-interlace", "Plane",
        temp_full_jpg
    ], check=True)

    # Write to target paths
    for p in [OUT_PUBLIC_PNG, OUT_DIST_PNG]:
        if os.path.exists(os.path.dirname(p)):
            subprocess.run(["cp", temp_full_png, p], check=True)
            print(f"Updated PNG: {p} ({os.path.getsize(p)} bytes)")

    for p in [OUT_PUBLIC_JPG, OUT_DIST_JPG]:
        if os.path.exists(os.path.dirname(p)):
            subprocess.run(["cp", temp_full_jpg, p], check=True)
            print(f"Updated JPG: {p} ({os.path.getsize(p)} bytes)")

if __name__ == "__main__":
    generate()
