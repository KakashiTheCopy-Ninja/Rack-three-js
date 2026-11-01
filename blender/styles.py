"""Garment styles. All numbers are metres, pattern lies in the XZ plane, z = 0 at the neck/shoulder line, +x = wearer's left."""
import math

STYLES = {
    # ---------------------------------------------------------------- shirts
    "tee_classic": dict(kind="tee", label="Classic tee", chest=0.27, hem=0.27, length=0.70, armpit=0.22, shoulder=0.22, shoulder_drop=0.035,
                        sleeve_len=0.21, sleeve_open=0.17, sleeve_cuff=0.15, sleeve_angle=28, neck_w=0.095, neck_front=0.085, neck_back=0.022,
                        stiff=1.0, mass=0.22, pins=0.17),
    "tee_boxy": dict(kind="tee", label="Boxy oversized tee", chest=0.325, hem=0.335, length=0.60, armpit=0.25, shoulder=0.285, shoulder_drop=0.07,
                     sleeve_len=0.24, sleeve_open=0.215, sleeve_cuff=0.20, sleeve_angle=20, neck_w=0.105, neck_front=0.075, neck_back=0.02,
                     stiff=2.2, mass=0.32, pins=0.19),
    "tee_long": dict(kind="tee", label="Long-sleeve tee", chest=0.265, hem=0.265, length=0.71, armpit=0.22, shoulder=0.215, shoulder_drop=0.04,
                     sleeve_len=0.58, sleeve_open=0.15, sleeve_cuff=0.085, sleeve_angle=24, neck_w=0.09, neck_front=0.08, neck_back=0.02,
                     stiff=0.9, mass=0.2, pins=0.17),
    # ---------------------------------------------------------------- sweatshirts
    "sweat_crew": dict(kind="sweat", label="Crewneck sweatshirt", chest=0.285, hem=0.255, length=0.68, armpit=0.24, shoulder=0.23, shoulder_drop=0.05,
                       sleeve_len=0.56, sleeve_open=0.185, sleeve_cuff=0.075, sleeve_angle=22, neck_w=0.10, neck_front=0.07, neck_back=0.02,
                       stiff=3.0, mass=0.42, pins=0.19),
    "sweat_oversized": dict(kind="sweat", label="Oversized sweatshirt", chest=0.345, hem=0.31, length=0.72, armpit=0.28, shoulder=0.30, shoulder_drop=0.09,
                            sleeve_len=0.6, sleeve_open=0.23, sleeve_cuff=0.085, sleeve_angle=16, neck_w=0.11, neck_front=0.07, neck_back=0.02,
                            stiff=3.4, mass=0.5, pins=0.21),
    # ---------------------------------------------------------------- hoodies
    "hoodie_pullover": dict(kind="hoodie", label="Pullover hoodie", chest=0.295, hem=0.27, length=0.70, armpit=0.25, shoulder=0.235, shoulder_drop=0.055,
                            sleeve_len=0.57, sleeve_open=0.19, sleeve_cuff=0.08, sleeve_angle=22, neck_w=0.115, neck_front=0.11, neck_back=0.03,
                            stiff=3.2, mass=0.5, pins=0.2, hood=True, uv_top=0.11),
    "hoodie_oversized": dict(kind="hoodie", label="Oversized hoodie", chest=0.355, hem=0.325, length=0.74, armpit=0.29, shoulder=0.31, shoulder_drop=0.10,
                             sleeve_len=0.62, sleeve_open=0.235, sleeve_cuff=0.09, sleeve_angle=15, neck_w=0.125, neck_front=0.115, neck_back=0.03,
                             stiff=3.6, mass=0.58, pins=0.22, hood=True, uv_top=0.12),
}

def half_outline(p, neck_depth):
    """Right-hand half outline from hem centre, counter-clockwise, ending at the neck centre. Returns list of (name, (x, z)) with seam/opening tags."""
    th = math.radians(p["sleeve_angle"])
    d = (math.cos(th), -math.sin(th))            # sleeve axis, pointing out and down
    n = (-math.sin(th), -math.cos(th))           # perpendicular, pointing down/in
    S = (p["shoulder"], -p["shoulder_drop"])     # shoulder tip
    A = (p["chest"], -p["armpit"])               # armpit
    T = (S[0] + d[0] * p["sleeve_len"], S[1] + d[1] * p["sleeve_len"])         # sleeve end, top corner
    # sleeve end bottom corner: width = sleeve_cuff, measured across the sleeve
    B = (T[0] + n[0] * p["sleeve_cuff"], T[1] + n[1] * p["sleeve_cuff"])
    # sleeve opening at the armpit must meet A: nudge A so the underarm seam is straight
    H = (p["hem"], -p["length"])
    N = (p["neck_w"], 0.0)
    return dict(H=H, A=A, B=B, T=T, S=S, N=N, neck_depth=neck_depth, d=d, n=n)
