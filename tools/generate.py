"""
Generates the stylized base map (assets/leonida.svg) and the placeholder
marker data (data/markers.js).

The map art is an original, hand-tuned approximation drawn from scratch —
it is NOT Rockstar's map. Marker positions are placeholders scattered by
rule (towns, coasts, water) so the UI has something to show; replace
data/markers.js with real coordinates as you collect them.

Run:  python tools/generate.py
"""
import json
import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = H = 1000
rng = random.Random(6)

# ---------------------------------------------------------------- geometry
MAINLAND = [
    (-20, -20), (1020, -20), (1020, 140), (960, 158), (905, 182), (858, 214),
    (818, 256), (792, 300), (778, 350), (772, 400), (776, 450), (774, 500),
    (766, 548), (754, 596), (740, 642), (720, 688), (694, 726), (660, 758),
    (622, 776), (586, 778), (556, 762), (536, 732), (520, 690), (502, 640),
    (478, 590), (452, 540), (426, 490), (406, 440), (388, 396), (362, 360),
    (322, 334), (272, 316), (218, 306), (164, 306), (112, 316), (62, 334),
    (18, 352), (-20, 360),
]
LAKE = [(560, 300), (600, 282), (648, 290), (672, 318), (664, 352), (628, 370),
        (586, 366), (560, 342)]
BARRIER = [(796, 452), (808, 450), (812, 520), (806, 600), (796, 650), (788, 652),
           (792, 590), (798, 520)]
ISLANDS = [  # leonida keys chain + a few gulf/bay islands
    [(560, 800), (590, 796), (604, 808), (584, 820), (556, 814)],
    [(508, 826), (540, 822), (548, 834), (520, 842), (500, 838)],
    [(452, 850), (488, 846), (494, 860), (464, 868), (446, 862)],
    [(392, 872), (432, 866), (440, 882), (402, 890), (386, 884)],
    [(330, 890), (372, 886), (378, 902), (340, 910), (324, 902)],
    [(262, 900), (304, 898), (312, 916), (270, 924), (254, 914)],
    [(196, 906), (236, 904), (240, 920), (204, 928), (190, 918)],
    [(735, 455), (752, 450), (758, 470), (742, 478)],
    [(300, 372), (322, 366), (330, 382), (308, 390)],
    [(860, 330), (884, 324), (890, 344), (868, 352)],
]
COUNTIES = {  # rough polygons used for labels/region shapes + county chips
    "Lummox County": [(0, 0), (420, 0), (420, 300), (380, 370), (300, 330), (0, 350)],
    "Leonard County": [(420, 0), (1000, 0), (1000, 150), (820, 250), (700, 260), (420, 300)],
    "Kelly County": [(420, 300), (700, 260), (820, 250), (780, 420), (560, 450), (430, 490)],
    "Mariana County": [(430, 490), (560, 450), (700, 440), (690, 730), (600, 790), (540, 750)],
    "Vice-Dale County": [(700, 440), (780, 420), (830, 440), (820, 680), (690, 730)],
    "Leonida Keys": [(180, 780), (620, 760), (620, 840), (180, 950)],
}
TOWNS = {  # name: (x, y, radius, weight)
    "Vice City": (728, 560, 62, 7),
    "Vice Beach": (802, 545, 16, 3),
    "Port Gellhorn": (150, 300, 32, 4),
    "Ambrosia": (500, 230, 30, 3),
    "Hamlet": (610, 210, 20, 2),
    "Grassrivers": (610, 610, 34, 1),
    "Leonida Keys": (440, 860, 22, 2),
    "Mount Kalaga": (260, 150, 36, 1),
}


def pip(pt, poly):
    x, y = pt
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def on_land(p):
    if pip(p, LAKE):
        return False
    return pip(p, MAINLAND) or pip(p, BARRIER) or any(pip(p, i) for i in ISLANDS)


def jitter(poly, amount, steps=3):
    """Subdivide a polygon and nudge points for an organic coastline."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        for s in range(steps):
            t = s / steps
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            if s:
                x += rng.uniform(-amount, amount)
                y += rng.uniform(-amount, amount)
            out.append((x, y))
    return out


def smooth_path(poly, closed=True):
    """Catmull-Rom spline -> cubic Bezier path."""
    pts = poly
    n = len(pts)
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        p0 = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + (" Z" if closed else "")


def polyline(pts):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)


# ---------------------------------------------------------------- the SVG
def build_svg():
    p = []
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
    p.append("""<defs>
  <radialGradient id="sea" cx="55%" cy="55%" r="75%">
    <stop offset="0" stop-color="#2f8fb4"/><stop offset="1" stop-color="#14506e"/>
  </radialGradient>
  <linearGradient id="land" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#6f8f5a"/><stop offset=".55" stop-color="#86a46a"/><stop offset="1" stop-color="#9db479"/>
  </linearGradient>
  <pattern id="marsh" width="10" height="10" patternUnits="userSpaceOnUse">
    <rect width="10" height="10" fill="#6e9466"/>
    <path d="M1 7 q2 -4 4 0 M5 3 q2 -3 4 0" stroke="#567d55" stroke-width=".8" fill="none"/>
  </pattern>
  <pattern id="waves" width="24" height="12" patternUnits="userSpaceOnUse">
    <path d="M0 6 q6 -4 12 0 t12 0" stroke="#ffffff" stroke-opacity=".05" fill="none" stroke-width="1"/>
  </pattern>
</defs>""")
    p.append(f'<rect width="{W}" height="{H}" fill="url(#sea)"/>')
    p.append(f'<rect width="{W}" height="{H}" fill="url(#waves)"/>')

    main = jitter(MAINLAND, 5, 3)
    barrier = jitter(BARRIER, 1.2, 2)
    islands = [jitter(i, 2.5, 2) for i in ISLANDS]
    lake = jitter(LAKE, 4, 3)

    # shallow-water halo + beach rims
    for poly, w in [(main, 26), (barrier, 14)] + [(i, 12) for i in islands]:
        for k, op in [(1.0, .12), (.6, .16), (.3, .2)]:
            p.append(f'<path d="{smooth_path(poly)}" fill="none" stroke="#5fc1d6" stroke-opacity="{op}" stroke-width="{w*k:.1f}" stroke-linejoin="round"/>')
    for poly in [main, barrier] + islands:
        p.append(f'<path d="{smooth_path(poly)}" fill="#e7d6a3" stroke="#e7d6a3" stroke-width="5" stroke-linejoin="round"/>')
        p.append(f'<path d="{smooth_path(poly)}" fill="url(#land)"/>')

    # wetlands (Grassrivers)
    marsh = jitter([(520, 520), (600, 470), (690, 480), (720, 560), (700, 660),
                    (640, 730), (580, 740), (540, 680), (500, 600)], 10, 3)
    p.append(f'<path d="{smooth_path(marsh)}" fill="url(#marsh)" opacity=".9"/>')
    for _ in range(140):  # small ponds / channels in the marsh
        x, y = rng.uniform(520, 710), rng.uniform(490, 730)
        if pip((x, y), marsh):
            p.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rng.uniform(1.5,5):.1f}" ry="{rng.uniform(1,3):.1f}" fill="#4f9fb4" opacity=".7" transform="rotate({rng.uniform(0,180):.0f} {x:.1f} {y:.1f})"/>')

    # forests in the north
    for _ in range(260):
        x, y = rng.uniform(20, 760), rng.uniform(20, 300)
        if on_land((x, y)):
            r = rng.uniform(5, 14)
            p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#4f7347" opacity="{rng.uniform(.25,.5):.2f}"/>')

    # Mount Kalaga contour rings
    cx, cy = 262, 150
    for k in range(7, 0, -1):
        ring = [(cx + math.cos(a) * k * 11 * rng.uniform(.85, 1.15),
                 cy + math.sin(a) * k * 8 * rng.uniform(.85, 1.15))
                for a in [i * math.pi * 2 / 14 for i in range(14)]]
        shade = 70 + k * 10
        p.append(f'<path d="{smooth_path(ring)}" fill="rgb({shade+20},{shade+30},{shade})" opacity=".55" stroke="#3f5a38" stroke-opacity=".35" stroke-width=".8"/>')

    # lake + rivers
    p.append(f'<path d="{smooth_path(lake)}" fill="#3a9cc0" stroke="#e7d6a3" stroke-width="2"/>')
    rivers = [
        [(612, 368), (606, 410), (620, 450), (610, 500), (628, 560), (612, 620), (640, 690), (630, 770)],
        [(250, 210), (220, 250), (200, 280), (176, 310)],
        [(470, 80), (500, 140), (540, 200), (575, 290)],
    ]
    for r in rivers:
        p.append(f'<path d="{smooth_path(r, closed=False)}" fill="none" stroke="#3a9cc0" stroke-width="3" stroke-linecap="round"/>')

    # town blocks
    for name, (tx, ty, rad, wgt) in TOWNS.items():
        if name in ("Grassrivers", "Mount Kalaga"):
            continue
        step = 4 if wgt >= 3 else 5
        for gx in range(int(tx - rad), int(tx + rad), step):
            for gy in range(int(ty - rad), int(ty + rad), step):
                d = math.hypot(gx - tx, gy - ty)
                if d < rad * rng.uniform(.75, 1.05) and on_land((gx + 2, gy + 2)) and on_land((gx - 1, gy - 1)):
                    shade = rng.choice(["#cfc8b8", "#d9d2c2", "#c4bdae", "#bdb6a8", "#e4ddcd"])
                    p.append(f'<rect x="{gx}" y="{gy}" width="{step-1.1}" height="{step-1.1}" rx=".4" fill="{shade}" opacity="{1 - d/rad*0.35:.2f}"/>')


    # roads: highways (thick) and secondary
    highways = [
        [(1000, 170), (900, 200), (840, 250), (800, 330), (788, 420), (782, 500), (770, 580), (752, 650), (720, 700), (680, 740), (620, 770), (590, 790),
         (560, 808), (524, 830), (470, 856), (412, 878), (350, 896), (284, 910), (216, 916)],
        [(0, 240), (120, 250), (220, 262), (330, 260), (440, 240), (520, 232), (620, 214), (760, 210), (860, 190), (1000, 150)],
        [(150, 300), (240, 290), (340, 300), (420, 360), (470, 440), (520, 500), (600, 540), (700, 560), (742, 560)],
        [(500, 230), (520, 300), (540, 380), (560, 460), (620, 520), (742, 560)],
    ]
    secondary = [
        [(742, 560), (800, 545)], [(742, 520), (802, 500)], [(742, 600), (796, 600)],
        [(610, 210), (620, 120), (660, 40)], [(262, 150), (300, 220), (330, 260)],
        [(150, 300), (110, 200), (90, 60)], [(400, 120), (500, 230)],
        [(700, 440), (780, 420)], [(470, 440), (560, 460)], [(540, 640), (610, 610), (700, 640)],
    ]
    for r in secondary:
        p.append(f'<polyline points="{polyline(r)}" fill="none" stroke="#f1e9d5" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')
    for r in highways:
        p.append(f'<path d="{smooth_path(r, closed=False)}" fill="none" stroke="#5b5348" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>')
        p.append(f'<path d="{smooth_path(r, closed=False)}" fill="none" stroke="#f6c86b" stroke-width="2.6" stroke-linecap="round"/>')

    # airports / runways
    for (ax, ay, rot) in [(700, 500, -30), (190, 330, 10), (520, 260, 70)]:
        p.append(f'<g transform="rotate({rot} {ax} {ay})"><rect x="{ax-22}" y="{ay-2.5}" width="44" height="5" fill="#8a8a84"/><rect x="{ax-18}" y="{ay+6}" width="36" height="3.5" fill="#8a8a84"/></g>')

    # fog the northern / western map edges so the land fades out instead of being cut
    p.append("""<defs>
  <linearGradient id="fogN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14506e"/><stop offset="1" stop-color="#14506e" stop-opacity="0"/></linearGradient>
  <linearGradient id="fogW" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14506e"/><stop offset="1" stop-color="#14506e" stop-opacity="0"/></linearGradient>
  <linearGradient id="fogE" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#14506e"/><stop offset="1" stop-color="#14506e" stop-opacity="0"/></linearGradient>
  <linearGradient id="fogS" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#14506e"/><stop offset="1" stop-color="#14506e" stop-opacity="0"/></linearGradient>
</defs>""")
    p.append(f'<rect width="{W}" height="70" fill="url(#fogN)"/>')
    p.append(f'<rect width="70" height="{H}" fill="url(#fogW)"/>')
    p.append(f'<rect x="{W-70}" width="70" height="{H}" fill="url(#fogE)"/>')
    p.append(f'<rect y="{H-70}" width="{W}" height="70" fill="url(#fogS)"/>')
    p.append("</svg>")
    return "\n".join(p)


# ---------------------------------------------------------------- markers
# section -> group -> [(type id, name, glyph, count, placement)]
# placement: town | anywhere | coast | water | wild | city
TYPES = {
    "Locations": {
        "color": "#38bdf8",
        "groups": {
            "Vehicles": [
                ("pay-n-spray", "Pay 'N' Spray", "🎨", 8, "town"),
                ("mod-shop", "Mod Shop", "🔧", 7, "town"),
                ("gas-station", "Gas Station", "⛽", 22, "road"),
                ("car-wash", "Car Wash", "🫧", 5, "town"),
                ("ev-charger", "Electric Charger", "🔌", 18, "town"),
                ("bus-stop", "Bus Stop", "🚏", 30, "city"),
                ("train-station", "Train Station", "🚆", 9, "road"),
                ("ferry", "Ferry Terminal", "⛴️", 2, "coast"),
                ("rental", "Rental Vehicle", "🔑", 3, "town"),
                ("garage", "Purchasable Garage", "🏠", 6, "town"),
                ("standout-vehicle", "Standout Vehicle", "🚗", 20, "anywhere"),
            ],
            "Robberies": [
                ("bank", "Bank", "🏦", 8, "town"),
                ("payday", "Payday Loans", "💵", 6, "town"),
                ("jewelry", "Jewelry Store", "💎", 8, "city"),
                ("pawn", "Pawn Shop", "🪙", 8, "town"),
                ("convenience", "Convenience Store", "🏪", 26, "road"),
                ("liquor", "Liquor Store", "🍾", 10, "town"),
                ("safe", "Safe", "🔐", 15, "anywhere"),
            ],
            "Food & Drink": [
                ("cafe", "Cafes & Takeout", "☕", 20, "town"),
                ("bar", "Bar", "🍺", 22, "town"),
                ("street-food", "Street Food", "🌮", 18, "city"),
                ("fast-food", "Fast Food", "🍔", 14, "road"),
            ],
            "Points of Interest": [
                ("atm", "ATM", "🏧", 30, "town"),
                ("gym", "Gym", "🏋️", 6, "town"),
                ("club", "Club", "🪩", 5, "city"),
                ("ammunation", "Ammu-Nation", "🔫", 12, "town"),
                ("hospital", "Hospital", "🏥", 5, "town"),
                ("police", "Police Station", "🚓", 7, "town"),
            ],
            "Style": [
                ("clothes", "Clothing Store", "👕", 14, "town"),
                ("footwear", "Footwear", "👟", 8, "city"),
                ("barber", "Hair & Beauty", "💈", 10, "town"),
                ("tattoo", "Tattoos", "🖋️", 7, "town"),
                ("electronics", "Electronics", "📱", 8, "city"),
            ],
        },
    },
    "Collections": {
        "color": "#f472b6",
        "groups": {
            "Collectible Cards": [
                ("card-a", "Playing Card", "🃏", 24, "anywhere"),
                ("card-b", "Trading Card", "🎴", 18, "anywhere"),
            ],
            "Sightseeing": [
                ("landmark", "Landmark", "🗽", 18, "anywhere"),
                ("curiosity", "Curiosity", "👁️", 16, "wild"),
                ("sculpture", "Sculpture", "🗿", 12, "town"),
            ],
            "Exploration": [
                ("book-swap", "Book Swap", "📚", 6, "town"),
                ("magazine", "Magazine", "📰", 14, "anywhere"),
                ("mural", "Mural", "🖼️", 8, "city"),
                ("signal-jammer", "Hidden Package", "📦", 20, "wild"),
            ],
        },
    },
    "Activities": {
        "color": "#a3e635",
        "groups": {
            "Stunts": [
                ("stunt-jump", "Stunt Jump", "🛣️", 30, "anywhere"),
                ("base-jump", "Base Jump", "🪂", 10, "wild"),
                ("knife-flight", "Knife Flight", "✈️", 12, "anywhere"),
                ("under-bridge", "Under the Bridge", "🌉", 20, "coast"),
            ],
            "Sports": [
                ("basketball", "Basketball Hoop", "🏀", 20, "town"),
                ("golf", "Golf Course", "⛳", 2, "town"),
                ("mini-golf", "Mini-Golf Course", "🏌️", 3, "town"),
                ("pool", "Pool Table", "🎱", 10, "town"),
                ("tennis", "Tennis Court", "🎾", 6, "town"),
            ],
            "Racing": [
                ("street-race", "Street Race", "🏁", 14, "road"),
                ("mud-club", "Mud Club", "🛻", 6, "wild"),
                ("speedway", "Speedway", "🏎️", 3, "road"),
                ("boat-race", "Boat Race", "🚤", 8, "water"),
                ("drone", "Drone Course", "🛸", 12, "anywhere"),
            ],
            "Leisure": [
                ("shooting-range", "Shooting Range", "🎯", 6, "town"),
                ("arcade", "Arcade Machine", "🕹️", 16, "city"),
                ("fishing", "Fishing Hotspot", "🎣", 18, "water"),
                ("hunting", "Hunting Ground", "🦌", 8, "wild"),
            ],
            "Side Jobs": [
                ("stranger", "Stranger", "❓", 18, "anywhere"),
                ("heist-contact", "Contact", "📞", 8, "town"),
                ("bounty", "Bounty", "💰", 12, "anywhere"),
            ],
        },
    },
}

ROADS_FOR_PLACING = [
    (782, 500), (770, 580), (752, 650), (720, 700), (620, 770), (470, 856), (350, 896),
    (240, 290), (420, 360), (470, 440), (600, 540), (520, 300), (560, 460), (440, 240),
    (620, 214), (760, 210), (120, 250), (800, 330), (900, 200),
]
WILD_SPOTS = [(262, 150), (610, 610), (380, 120), (80, 120), (680, 360), (900, 90), (560, 120)]
TOWN_W = [(v[0], v[1], v[2]) for v in TOWNS.values() for _ in range(v[3])]


def find_point(mode):
    for _ in range(4000):
        if mode in ("town", "city"):
            if mode == "city":
                tx, ty, r = rng.choice([TOWNS["Vice City"][:3]] * 4 + [TOWNS["Vice Beach"][:3]])
            else:
                tx, ty, r = rng.choice(TOWN_W)
            a, d = rng.uniform(0, math.tau), r * math.sqrt(rng.random())
            pt = (tx + math.cos(a) * d, ty + math.sin(a) * d)
        elif mode == "road":
            rx, ry = rng.choice(ROADS_FOR_PLACING)
            pt = (rx + rng.gauss(0, 14), ry + rng.gauss(0, 14))
        elif mode == "wild":
            wx, wy = rng.choice(WILD_SPOTS)
            pt = (wx + rng.gauss(0, 55), wy + rng.gauss(0, 55))
        else:
            pt = (rng.uniform(20, 980), rng.uniform(20, 960))

        if mode == "water":
            # near a coast but in the water
            if not on_land(pt) and any(on_land((pt[0] + dx, pt[1] + dy)) for dx, dy in [(25, 0), (-25, 0), (0, 25), (0, -25)]):
                return pt
            continue
        if mode == "coast":
            if on_land(pt) and any(not on_land((pt[0] + dx, pt[1] + dy)) for dx, dy in [(12, 0), (-12, 0), (0, 12), (0, -12)]):
                return pt
            continue
        if on_land(pt):
            return pt
    raise RuntimeError(f"could not place {mode}")


def nearest_area(pt):
    best, bd = None, 1e9
    for name, (tx, ty, r, _) in TOWNS.items():
        d = math.hypot(pt[0] - tx, pt[1] - ty) - r
        if d < bd:
            best, bd = name, d
    return best if bd < 60 else None


def county_of(pt):
    for name, poly in COUNTIES.items():
        if pip(pt, poly):
            return name
    return "Leonida"


def build_data():
    sections, markers = [], []
    for sname, s in TYPES.items():
        sec = {"name": sname, "color": s["color"], "groups": []}
        for gname, types in s["groups"].items():
            grp = {"name": gname, "types": []}
            for tid, tname, glyph, count, mode in types:
                grp["types"].append({"id": tid, "name": tname, "icon": glyph})
                for n in range(count):
                    x, y = find_point(mode)
                    area = nearest_area((x, y)) or county_of((x, y))
                    markers.append({
                        "id": f"{tid}-{n+1}",
                        "type": tid,
                        "title": f"{tname} #{n+1}",
                        "desc": f"Placeholder location near {area}.",
                        # Leaflet CRS.Simple: lat = up (H - y), lng = x
                        "lat": round(H - y, 1),
                        "lng": round(x, 1),
                    })
            sec["groups"].append(grp)
        sections.append(sec)

    labels = []
    for name, (tx, ty, r, wgt) in TOWNS.items():
        labels.append({"name": name, "lat": H - ty, "lng": tx, "kind": "town" if wgt >= 2 else "area"})
    labels += [
        {"name": "Gulf of Leonida", "lat": H - 600, "lng": 170, "kind": "water"},
        {"name": "Atlantic Ocean", "lat": H - 760, "lng": 900, "kind": "water"},
        {"name": "Lake Leonida", "lat": H - 326, "lng": 614, "kind": "water"},
    ]
    county_labels = {
        "Lummox County": (110, 210), "Leonard County": (760, 120), "Kelly County": (690, 400),
        "Mariana County": (560, 560), "Vice-Dale County": (790, 690), "Leonida Keys": (300, 860),
    }
    for name, (x, y) in county_labels.items():
        if name != "Leonida Keys":
            labels.append({"name": name, "lat": H - y, "lng": x, "kind": "county"})
    regions = [{"name": n, "points": [[H - y, x] for x, y in poly]} for n, poly in COUNTIES.items()]
    return {
        "meta": {
            "note": "Placeholder data. Positions are illustrative, not real in-game locations.",
            "size": [W, H],
        },
        "sections": sections,
        "labels": labels,
        "regions": regions,
        "markers": markers,
    }


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    svg = build_svg()
    with open(os.path.join(ROOT, "assets", "leonida.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    data = build_data()
    with open(os.path.join(ROOT, "data", "markers.js"), "w", encoding="utf-8") as f:
        f.write("// Generated by tools/generate.py. Edit freely or replace with real data.\n")
        f.write("window.LEONIDA_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"svg: {len(svg)//1024} KB, markers: {len(data['markers'])}")
