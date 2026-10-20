"""Visuels produits générés en SVG : des body pillows (housses de coussin long) à l'effigie de
personnages de jeu vidéo originaux, adultes et entièrement habillés.

Chaque produit stocke une « fiche d'apparence » (JSON, colonne products.art) que ce module
transforme en illustration. Face A (recto) : le personnage. Face B (verso) : la version nuit.
"""

import math
import random

W, H = 200, 540  # une housse, en unités SVG (proportions d'un body pillow)
INK = "#1e1b2e"


def _mix(color: str, other: str, t: float) -> str:
    a = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(other[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


def _mirror(svg: str) -> str:
    return f'<g transform="translate({W},0) scale(-1,1)">{svg}</g>'


# ---------------------------------------------------------------- motifs de fond


def _stars(rng: random.Random, count: int = 22) -> str:
    out = []
    for _ in range(count):
        x, y = rng.uniform(8, W - 8), rng.uniform(8, H - 8)
        out.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(1, 2.4):.1f}" fill="#fff" '
            f'opacity="{rng.uniform(.35, .85):.2f}"/>'
        )
    for _ in range(6):
        x, y, s = rng.uniform(15, W - 15), rng.uniform(15, H - 15), rng.uniform(5, 9)
        out.append(
            f'<path d="M{x:.1f},{y - s:.1f} Q{x:.1f},{y:.1f} {x + s:.1f},{y:.1f} Q{x:.1f},{y:.1f} {x:.1f},{y + s:.1f} '
            f'Q{x:.1f},{y:.1f} {x - s:.1f},{y:.1f} Q{x:.1f},{y:.1f} {x:.1f},{y - s:.1f} Z" fill="#fff" opacity=".8"/>'
        )
    return "".join(out)


def _hex(rng: random.Random) -> str:
    r = 18
    dx, dy = r * math.sqrt(3), r * 1.5
    out = []
    for row in range(int(H / dy) + 2):
        for col in range(int(W / dx) + 2):
            cx = col * dx + (dx / 2 if row % 2 else 0)
            cy = row * dy
            pts = " ".join(
                f"{cx + r * math.cos(math.radians(60 * k + 30)):.1f},{cy + r * math.sin(math.radians(60 * k + 30)):.1f}"
                for k in range(6)
            )
            lit = rng.random() < .12
            out.append(
                f'<polygon points="{pts}" fill="{"#fff" if lit else "none"}" fill-opacity=".14" '
                f'stroke="#fff" stroke-width="1.2" stroke-opacity="{.35 if lit else .14}"/>'
            )
    return "".join(out)


def _moon(rng: random.Random) -> str:
    return (
        '<circle cx="152" cy="66" r="40" fill="#fef9c3" opacity=".95"/>'
        '<circle cx="140" cy="56" r="7" fill="#fde68a"/><circle cx="164" cy="80" r="5" fill="#fde68a"/>'
        '<circle cx="162" cy="50" r="3.5" fill="#fde68a"/>' + _stars(rng, 16)
    )


def _runes(rng: random.Random) -> str:
    cx, cy = 100, 300
    out = [
        f'<circle cx="{cx}" cy="{cy}" r="88" fill="none" stroke="#fff" stroke-width="2.5" opacity=".45"/>',
        f'<circle cx="{cx}" cy="{cy}" r="72" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 7" opacity=".45"/>',
    ]
    for offset in (90, 270):  # hexagramme
        pts = " ".join(
            f"{cx + 72 * math.cos(math.radians(offset + 120 * k)):.1f},{cy + 72 * math.sin(math.radians(offset + 120 * k)):.1f}"
            for k in range(3)
        )
        out.append(f'<polygon points="{pts}" fill="none" stroke="#fff" stroke-width="1.5" opacity=".35"/>')
    for k in range(16):
        a = math.radians(k * 22.5)
        out.append(
            f'<line x1="{cx + 76 * math.cos(a):.1f}" y1="{cy + 76 * math.sin(a):.1f}" '
            f'x2="{cx + 85 * math.cos(a):.1f}" y2="{cy + 85 * math.sin(a):.1f}" stroke="#fff" stroke-width="2" opacity=".5"/>'
        )
    return "".join(out) + _stars(rng, 10)


def _flames(rng: random.Random) -> str:
    embers = "".join(
        f'<circle cx="{rng.uniform(10, W - 10):.1f}" cy="{rng.uniform(260, 430):.1f}" r="{rng.uniform(1.5, 3.5):.1f}" '
        f'fill="#fde047" opacity="{rng.uniform(.4, .8):.2f}"/>'
        for _ in range(14)
    )
    return (
        f'<path d="M0,{H} L0,430 C18,392 28,452 46,410 C64,366 76,446 96,400 C114,356 128,440 148,392 '
        f'C166,352 180,420 200,380 L200,{H} Z" fill="#fff" opacity=".22"/>'
        f'<path d="M0,{H} L0,470 C20,440 34,490 54,456 C74,420 86,486 106,452 C126,418 140,480 160,446 '
        f'C178,416 190,462 200,440 L200,{H} Z" fill="#fde047" opacity=".3"/>' + embers
    )


def _bubbles(rng: random.Random) -> str:
    return "".join(
        f'<circle cx="{rng.uniform(10, W - 10):.1f}" cy="{rng.uniform(10, H - 10):.1f}" r="{rng.uniform(4, 16):.1f}" '
        f'fill="#fff" fill-opacity=".18" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>'
        for _ in range(20)
    )


def _pixels(rng: random.Random) -> str:
    size = 20
    return "".join(
        f'<rect x="{x}" y="{y}" width="{size}" height="{size}" fill="#fff" opacity="{rng.uniform(.1, .3):.2f}"/>'
        for y in range(0, H, size)
        for x in range(0, W, size)
        if rng.random() < .16
    )


PATTERNS = {
    "stars": _stars,
    "hex": _hex,
    "moon": _moon,
    "runes": _runes,
    "flames": _flames,
    "bubbles": _bubbles,
    "pixels": _pixels,
}


# ---------------------------------------------------------------- personnage « humanoïde »

HAIR_BACK = {
    "long": "M70,104 Q68,62 100,60 Q132,62 130,104 L142,232 Q100,248 58,232 Z",
    "bob": "M70,104 Q68,62 100,60 Q132,62 130,104 L134,150 Q100,160 66,150 Z",
    "ponytail": "M70,104 Q68,62 100,60 Q132,62 130,104 L130,128 Q100,134 70,128 Z "
                "M124,82 C164,92 166,170 146,226 C150,170 140,124 118,104 Z",
}

HAIR_FRONT = {
    "long": "M72,112 C66,62 134,62 128,112 C122,92 112,84 104,84 C106,92 102,97 98,98 C94,90 86,86 80,90 C76,96 73,104 72,112 Z",
    "short": "M72,106 C68,64 132,64 128,106 C122,88 110,82 100,84 C90,82 78,88 72,106 Z",
    "spiky": "M71,108 L62,86 L77,88 L72,62 L89,76 L100,50 L111,76 L128,62 L123,88 L138,86 L129,108 "
             "C121,92 110,86 100,88 C90,86 79,92 71,108 Z",
    "mohawk": "M92,86 L93,48 L100,38 L107,48 L108,86 Z",
}
HAIR_FRONT["bob"] = HAIR_FRONT["ponytail"] = HAIR_FRONT["long"]


def _wings(color: str) -> str:
    edge = _mix(color, "#000000", .35)
    wing = (
        f'<path d="M80,178 L14,92 Q22,138 4,158 Q30,160 26,190 Q50,182 50,212 Q64,202 74,220 Z" fill="{color}"/>'
        f'<path d="M80,178 L14,92 M80,178 L26,190 M80,178 L50,212" stroke="{edge}" stroke-width="3" '
        f'fill="none" stroke-linecap="round"/>'
    )
    return wing + _mirror(wing)


def _tail(color: str) -> str:
    return (
        f'<path d="M112,300 C176,326 186,410 154,458" fill="none" stroke="{color}" stroke-width="15" stroke-linecap="round"/>'
        f'<path d="M154,454 L136,470 L152,490 L170,470 Z" fill="{color}"/>'
    )


def _weapon(kind: str, color: str) -> str:
    wood, steel, steel_edge = "#7c4a1e", "#e2e8f0", "#94a3b8"
    if kind == "sword":
        return (
            f'<path d="M144,262 L152,262 L154,118 L148,100 L142,118 Z" fill="{steel}" stroke="{steel_edge}" stroke-width="1.5"/>'
            f'<line x1="148" y1="122" x2="148" y2="250" stroke="{steel_edge}" stroke-width="1.5"/>'
            f'<rect x="132" y="256" width="32" height="8" rx="4" fill="{color}"/>'
            f'<rect x="145" y="262" width="6" height="26" rx="2" fill="#44403c"/><circle cx="148" cy="292" r="5" fill="{color}"/>'
        )
    if kind == "katana":
        return (
            f'<path d="M147,262 Q154,190 166,104 L170,106 Q160,190 152,262 Z" fill="#f1f5f9" stroke="{steel_edge}" stroke-width="1"/>'
            f'<ellipse cx="149.5" cy="262" rx="10" ry="3.5" fill="{color}"/>'
            f'<rect x="146" y="264" width="7" height="30" rx="2" fill="#18181b"/>'
        )
    if kind == "staff":
        return (
            f'<line x1="148" y1="104" x2="148" y2="476" stroke="{wood}" stroke-width="7" stroke-linecap="round"/>'
            f'<path d="M134,102 Q148,116 162,102" fill="none" stroke="{wood}" stroke-width="4" stroke-linecap="round"/>'
            f'<circle cx="148" cy="90" r="23" fill="{color}" opacity=".3"/><circle cx="148" cy="90" r="13" fill="{color}"/>'
            f'<circle cx="144" cy="86" r="4" fill="#fff" opacity=".75"/>'
        )
    if kind == "axe":
        head = "M148,158 C178,144 194,176 184,208 C174,196 162,194 148,198 Z"
        return (
            f'<line x1="148" y1="150" x2="148" y2="430" stroke="{wood}" stroke-width="7" stroke-linecap="round"/>'
            f'<path d="{head}" fill="{steel}" stroke="{steel_edge}" stroke-width="1.5"/>'
            f'<path d="M148,158 C122,148 110,176 116,202 C126,192 136,192 148,196 Z" fill="{steel}" stroke="{steel_edge}" stroke-width="1.5"/>'
        )
    if kind == "scythe":
        return (
            f'<line x1="152" y1="84" x2="144" y2="476" stroke="#3f3f46" stroke-width="6" stroke-linecap="round"/>'
            f'<path d="M151,90 C172,68 196,82 198,114 C182,102 168,100 151,108 Z" fill="{steel}" stroke="{steel_edge}" stroke-width="1.5"/>'
            f'<circle cx="152" cy="86" r="5" fill="{color}"/>'
        )
    if kind == "bow":
        return (
            f'<path d="M152,150 Q192,268 152,386" fill="none" stroke="#92400e" stroke-width="6" stroke-linecap="round"/>'
            f'<line x1="152" y1="150" x2="152" y2="386" stroke="#e5e7eb" stroke-width="1.5"/>'
        )
    if kind == "blaster":
        return (
            f'<rect x="132" y="250" width="46" height="20" rx="6" fill="#334155"/>'
            f'<rect x="176" y="255" width="16" height="10" rx="3" fill="#1e293b"/>'
            f'<rect x="138" y="257" width="32" height="4" rx="2" fill="{color}"/>'
            f'<rect x="142" y="266" width="11" height="22" rx="3" fill="#1e293b"/>'
        )
    return ""


def _human(a: dict, night: bool) -> str:
    o = a.get("outfit", {})
    style = o.get("style", "tunic")
    top = o.get("top", "#475569")
    bottom = o.get("bottom", "#1f2937")
    under = o.get("under", bottom)
    boots = o.get("boots", "#292524")
    accent = o.get("accent", "#fbbf24")
    belt = o.get("belt", "#3f2a1d")
    skin = a.get("skin", "#f2c9a0")
    hair = a.get("hair", "#3f2a1d")
    hs = a.get("hair_style", "short")
    hw = a.get("headwear")
    weapon = a.get("weapon")
    wc = a.get("weapon_color", "#fbbf24")
    face_hidden = hw in ("helmet", "spacehelmet")
    s = []

    # --- derrière le personnage
    if a.get("wings"):
        s.append(_wings(a["wings"]))
    if a.get("cape"):
        s.append(
            f'<path d="M64,158 L136,158 L170,464 Q100,484 30,464 Z" fill="{a["cape"]}"/>'
            f'<path d="M100,160 L136,158 L170,464 Q136,476 100,480 Z" fill="#000" opacity=".15"/>'
        )
    if a.get("tail"):
        s.append(_tail(a["tail"]))
    if hw == "hood":
        s.append(f'<path d="M60,126 C54,54 146,54 140,126 L148,180 Q100,194 52,180 Z" fill="{a.get("hood", top)}"/>')
    elif hs in HAIR_BACK and not face_hidden:
        s.append(f'<path d="{HAIR_BACK[hs]}" fill="{hair}"/>')

    # --- jambes et bottes
    if style == "robe":
        s.append(f'<ellipse cx="84" cy="486" rx="14" ry="8" fill="{boots}"/><ellipse cx="116" cy="486" rx="14" ry="8" fill="{boots}"/>')
    else:
        leg = top if style == "suit" else bottom
        s.append(
            f'<rect x="77" y="290" width="21" height="150" rx="9" fill="{leg}"/>'
            f'<rect x="102" y="290" width="21" height="150" rx="9" fill="{leg}"/>'
        )
        if style == "suit":
            s.append(f'<rect x="79" y="352" width="17" height="14" rx="4" fill="{accent}"/>'
                     f'<rect x="104" y="352" width="17" height="14" rx="4" fill="{accent}"/>')
        boot_top = 372 if style == "armor" else 404
        greave = top if style == "armor" else boots
        for x in (74, 100):
            s.append(
                f'<rect x="{x}" y="{boot_top}" width="26" height="{470 - boot_top}" rx="7" fill="{greave}"/>'
                f'<rect x="{x - 1}" y="{boot_top}" width="28" height="7" rx="3" fill="{accent}"/>'
            )
        s.append(f'<ellipse cx="82" cy="474" rx="15" ry="8" fill="{boots}"/><ellipse cx="118" cy="474" rx="15" ry="8" fill="{boots}"/>')

    # --- cou
    s.append(f'<rect x="91" y="126" width="18" height="30" rx="7" fill="{skin}"/>'
             f'<rect x="91" y="138" width="18" height="12" fill="#000" opacity=".1"/>')

    # --- torse
    if style == "robe":
        s.append(
            f'<path d="M66,156 Q100,146 134,156 L158,476 Q100,496 42,476 Z" fill="{top}"/>'
            f'<path d="M108,152 Q124,152 134,156 L158,476 Q140,484 118,488 Z" fill="#000" opacity=".14"/>'
            f'<path d="M46,462 Q100,482 154,462" fill="none" stroke="{accent}" stroke-width="6"/>'
            f'<path d="M100,170 L100,486" stroke="{accent}" stroke-width="4" opacity=".8"/>'
            f'<path d="M64,262 Q100,272 136,262 L137,276 Q100,286 63,276 Z" fill="{accent}"/>'
        )
    elif style == "suit":
        s.append(
            f'<path d="M68,156 Q100,146 132,156 L136,302 Q100,316 64,302 Z" fill="{top}"/>'
            f'<path d="M110,152 Q124,152 132,156 L136,302 Q126,308 114,312 Z" fill="#000" opacity=".14"/>'
            f'<path d="M84,162 L90,298 M116,162 L110,298" stroke="{accent}" stroke-width="3" fill="none" opacity=".9"/>'
            f'<circle cx="100" cy="206" r="14" fill="{accent}" opacity=".25"/><circle cx="100" cy="206" r="8" fill="{accent}"/>'
            f'<rect x="64" y="282" width="72" height="8" rx="4" fill="{accent}" opacity=".85"/>'
        )
    else:
        s.append(
            f'<path d="M66,156 Q100,146 134,156 L144,332 Q100,346 56,332 Z" fill="{under if style == "armor" else top}"/>'
            f'<path d="M110,152 Q126,152 134,156 L144,332 Q132,338 118,341 Z" fill="#000" opacity=".14"/>'
            f'<path d="M58,322 Q100,336 142,322" fill="none" stroke="{accent}" stroke-width="4"/>'
        )
        if style == "armor":
            s.append(
                f'<path d="M70,160 Q100,150 130,160 L128,250 Q100,268 72,250 Z" fill="{top}" stroke="{accent}" stroke-width="3"/>'
                f'<path d="M80,166 Q88,162 95,161 L93,246 Q86,244 80,240 Z" fill="#fff" opacity=".28"/>'
            )
        s.append(
            f'<rect x="60" y="268" width="80" height="14" rx="4" fill="{belt}"/>'
            f'<rect x="92" y="266" width="16" height="18" rx="3" fill="none" stroke="{accent}" stroke-width="3"/>'
        )
        if style == "armor":
            s.append(_mirror(f'<path d="M64,284 L97,286 L95,328 L68,322 Z" fill="{top}" stroke="{accent}" stroke-width="2"/>')
                     + f'<path d="M64,284 L97,286 L95,328 L68,322 Z" fill="{top}" stroke="{accent}" stroke-width="2"/>')
    if style != "armor":
        s.append(f'<path d="M84,154 Q100,166 116,154" fill="none" stroke="{accent}" stroke-width="5" stroke-linecap="round"/>')

    # --- bras, bouclier, arme
    sleeve = under if style == "armor" else top
    arm_w = 26 if style == "robe" else 20
    right = (148, 268) if weapon else (145, 292)
    s.append(f'<line x1="68" y1="168" x2="56" y2="284" stroke="{sleeve}" stroke-width="{arm_w}" stroke-linecap="round"/>')
    if style == "armor":
        s.append(f'<circle cx="56" cy="282" r="12" fill="{top}"/>')
    s.append(f'<circle cx="55" cy="292" r="10" fill="{skin}"/>')
    if a.get("shield"):
        s.append(
            f'<path d="M26,250 L84,250 L84,292 Q84,328 55,346 Q26,328 26,292 Z" fill="{a["shield"]}" stroke="#e2e8f0" '
            f'stroke-width="4" stroke-linejoin="round"/>'
            f'<path d="M55,264 L55,330 M38,286 L72,286" stroke="#fbbf24" stroke-width="6" stroke-linecap="round"/>'
        )
    s.append(f'<line x1="132" y1="168" x2="{right[0]}" y2="{right[1] - 8}" stroke="{sleeve}" stroke-width="{arm_w}" stroke-linecap="round"/>')
    if style == "armor":
        s.append(f'<circle cx="{right[0]}" cy="{right[1] - 10}" r="12" fill="{top}"/>')
    if weapon:
        s.append(_weapon(weapon, wc))
    s.append(f'<circle cx="{right[0]}" cy="{right[1]}" r="10" fill="{skin}"/>')
    if style == "armor":
        s.append(f'<ellipse cx="64" cy="166" rx="20" ry="15" fill="{top}" stroke="{accent}" stroke-width="3"/>'
                 f'<ellipse cx="136" cy="166" rx="20" ry="15" fill="{top}" stroke="{accent}" stroke-width="3"/>')
    if a.get("fur_collar"):
        s.append(f'<path d="M58,162 Q100,134 142,162 Q142,180 100,175 Q58,180 58,162 Z" fill="{a["fur_collar"]}"/>')

    # --- tête
    if a.get("ears") == "elf":
        ear = f'<path d="M76,104 L44,82 L77,124 Z" fill="{skin}"/><path d="M72,106 L52,90 L74,118" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/>'
        s.append(ear + _mirror(ear))
    s.append(f'<ellipse cx="100" cy="108" rx="27" ry="30" fill="{skin}"/>')
    if a.get("muzzle"):
        s.append(f'<ellipse cx="100" cy="124" rx="13" ry="9" fill="{_mix(skin, "#ffffff", .5)}"/>'
                 f'<ellipse cx="100" cy="118" rx="4.5" ry="3.2" fill="#1c1917"/>')

    if not face_hidden and hw != "visor":
        eyes = a.get("eyes", "#3b2a1a")
        if night:
            s.append('<path d="M84,113 Q89,118 94,113 M106,113 Q111,118 116,113" fill="none" stroke="#3f2a1d" '
                     'stroke-width="2.4" stroke-linecap="round"/>')
        else:
            s.append(f'<ellipse cx="89" cy="112" rx="4" ry="5" fill="{eyes}"/><ellipse cx="111" cy="112" rx="4" ry="5" fill="{eyes}"/>'
                     '<circle cx="90.5" cy="110" r="1.5" fill="#fff"/><circle cx="112.5" cy="110" r="1.5" fill="#fff"/>')
        brow = _mix(hair, "#000000", .25)
        s.append(f'<path d="M83,102 Q89,99 95,101 M105,101 Q111,99 117,102" fill="none" stroke="{brow}" stroke-width="2.5" stroke-linecap="round"/>'
                 '<ellipse cx="83" cy="122" rx="5" ry="3" fill="#fb7185" opacity=".35"/>'
                 '<ellipse cx="117" cy="122" rx="5" ry="3" fill="#fb7185" opacity=".35"/>')
        mouth_y = 130 if a.get("muzzle") else 127
        s.append(f'<path d="M95,{mouth_y} Q100,{mouth_y + 4} 105,{mouth_y}" fill="none" stroke="#9f4b3a" stroke-width="2" stroke-linecap="round"/>')
        if a.get("tusks"):
            s.append('<path d="M92,131 L95,121 L98,131 Z M102,131 L105,121 L108,131 Z" fill="#fefce8" stroke="#a8a29e" stroke-width=".8"/>')
        if a.get("fangs"):
            s.append('<path d="M96,128 L97.5,133 L99,128 Z M101,128 L102.5,133 L104,128 Z" fill="#fff"/>')

    if not face_hidden and hs in HAIR_FRONT:
        s.append(f'<path d="{HAIR_FRONT[hs]}" fill="{hair}"/>')
        if hs != "mohawk":
            s.append('<path d="M84,74 Q100,66 116,74" fill="none" stroke="#fff" stroke-width="3" opacity=".25" stroke-linecap="round"/>')

    # --- couvre-chef
    s.append(_headwear(a, hw, top, accent, night))
    return "".join(s)


def _headwear(a: dict, hw: str | None, top: str, accent: str, night: bool) -> str:
    if hw == "horns":
        horn = a.get("horn", "#fef3c7")
        h = (f'<path d="M82,86 C68,62 72,40 92,30 C84,48 86,64 92,82 Z" fill="{horn}" stroke="{_mix(horn, "#000000", .3)}" stroke-width="1.5"/>')
        return h + _mirror(h)
    if hw == "hood":
        hood = a.get("hood", top)
        return (f'<path d="M76,110 C74,76 126,76 124,110 C116,92 84,92 76,110 Z" fill="#000" opacity=".25"/>'
                f'<path d="M70,128 C62,66 138,66 130,128" fill="none" stroke="{hood}" stroke-width="10" stroke-linecap="round"/>')
    if hw == "helmet":
        plume = a.get("plume", accent)
        return (
            f'<path d="M100,74 C108,40 140,36 152,58 C136,52 120,60 108,80 Z" fill="{plume}"/>'
            f'<path d="M71,120 C66,66 134,66 129,120 L130,140 Q100,150 70,140 Z" fill="{top}" stroke="{accent}" stroke-width="2"/>'
            f'<path d="M80,80 Q90,72 98,72 L96,130 Q86,128 78,122 Z" fill="#fff" opacity=".25"/>'
            f'<rect x="80" y="106" width="40" height="7" rx="3" fill="#0f172a"/>'
            f'<line x1="100" y1="72" x2="100" y2="104" stroke="{accent}" stroke-width="3"/>'
            + "".join(f'<circle cx="{x}" cy="126" r="1.8" fill="#0f172a"/>' for x in (92, 100, 108))
        )
    if hw == "spacehelmet":
        visor = a.get("visor", "#22d3ee")
        if night:
            visor = _mix(visor, "#0f172a", .55)
        return (
            f'<line x1="124" y1="78" x2="140" y2="52" stroke="{top}" stroke-width="3"/><circle cx="140" cy="50" r="4" fill="{visor}"/>'
            f'<circle cx="100" cy="106" r="36" fill="{top}"/>'
            f'<path d="M72,100 Q100,90 128,100 L126,122 Q100,132 74,122 Z" fill="{visor}"/>'
            f'<path d="M80,101 Q92,96 104,96" fill="none" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>'
            f'<path d="M78,80 Q90,72 104,72" fill="none" stroke="#fff" stroke-width="3" opacity=".3" stroke-linecap="round"/>'
        )
    if hw == "visor":
        visor = a.get("visor", "#f0abfc")
        if night:
            visor = _mix(visor, "#0f172a", .55)
        return (
            f'<path d="M73,116 Q100,146 127,116 L128,134 Q100,152 72,134 Z" fill="{top}"/>'
            f'<path d="M128,104 C150,100 160,112 172,104 M128,112 C148,112 156,124 168,120" fill="none" stroke="{visor}" stroke-width="4" stroke-linecap="round"/>'
            f'<rect x="70" y="102" width="60" height="14" rx="7" fill="{visor}" stroke="{visor}" stroke-width="6" stroke-opacity=".3"/>'
        )
    if hw == "witchhat":
        hat = a.get("hat", "#1e1b4b")
        return (
            f'<ellipse cx="100" cy="84" rx="46" ry="9" fill="{hat}"/>'
            f'<path d="M74,84 C86,62 90,42 96,14 C104,30 116,44 112,52 C120,62 124,72 126,84 Z" fill="{hat}"/>'
            f'<path d="M76,80 Q100,86 124,80 L124,72 Q100,78 76,72 Z" fill="{accent}"/>'
        )
    if hw == "crown":
        return ('<path d="M78,82 L82,58 L92,72 L100,52 L108,72 L118,58 L122,82 Z" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>'
                '<circle cx="100" cy="70" r="3" fill="#ef4444"/><circle cx="86" cy="74" r="2" fill="#3b82f6"/><circle cx="114" cy="74" r="2" fill="#3b82f6"/>')
    if hw == "halo":
        return ('<ellipse cx="100" cy="56" rx="26" ry="7" fill="none" stroke="#fde047" stroke-width="12" opacity=".25"/>'
                '<ellipse cx="100" cy="56" rx="26" ry="7" fill="none" stroke="#fde047" stroke-width="4.5"/>')
    if hw == "wolf":
        fur = a.get("hair", "#57534e")
        ear = f'<path d="M74,92 L76,48 L98,76 Z" fill="{fur}"/><path d="M79,84 L80,60 L92,76 Z" fill="#fda4af"/>'
        return ear + _mirror(ear)
    if hw == "bandana":
        band = a.get("bandana", "#b91c1c")
        return (f'<path d="M72,90 Q100,80 128,90 L129,100 Q100,90 71,100 Z" fill="{band}"/>'
                f'<path d="M127,93 L146,84 L142,100 Z M127,96 L144,110 L133,111 Z" fill="{band}"/>')
    return ""


# ---------------------------------------------------------------- slime et pixel art


def _slime(a: dict, night: bool) -> str:
    c = a.get("slime", "#4ade80")
    eyes = (
        '<path d="M72,330 Q82,338 92,330 M108,330 Q118,338 128,330" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round"/>'
        if night else
        '<ellipse cx="82" cy="326" rx="10" ry="14" fill="#0f172a"/><ellipse cx="118" cy="326" rx="10" ry="14" fill="#0f172a"/>'
        '<circle cx="85" cy="320" r="4" fill="#fff"/><circle cx="121" cy="320" r="4" fill="#fff"/>'
    )
    return (
        f'<path d="M26,472 C10,360 52,196 100,186 C148,196 190,360 174,472 Q100,494 26,472 Z" fill="{c}"/>'
        f'<path d="M120,190 C160,220 190,360 174,472 Q150,482 128,486 C150,400 150,260 120,190 Z" fill="#000" opacity=".1"/>'
        f'<path d="M48,472 q6,22 14,0 M132,478 q5,18 12,0" fill="{c}" stroke="{c}" stroke-width="6" stroke-linecap="round"/>'
        '<ellipse cx="66" cy="280" rx="12" ry="34" fill="#fff" opacity=".45" transform="rotate(-15 66 280)"/>'
        '<circle cx="76" cy="232" r="6" fill="#fff" opacity=".6"/>'
        + eyes +
        '<path d="M90,358 Q100,368 110,358" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>'
        '<ellipse cx="68" cy="350" rx="8" ry="5" fill="#fb7185" opacity=".4"/><ellipse cx="132" cy="350" rx="8" ry="5" fill="#fb7185" opacity=".4"/>'
        '<path d="M72,196 L76,160 L90,178 L100,150 L110,178 L124,160 L128,196 Q100,204 72,196 Z" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>'
        '<circle cx="100" cy="182" r="4" fill="#ef4444"/>'
    )


SPRITES = {
    "hero": {
        "caption": "1UP",
        "palette": {"k": "#1f1b2e", "s": "#f5c9a3", "e": "#1f1b2e", "p": "#fda4af", "o": "#c2410c", "h": "#6b3e1f",
                    "r": "#7c3aed", "b": "#0d9488", "B": "#115e59", "y": "#facc15", "l": "#334155", "n": "#7c4a1e"},
        "rows": [
            "...kkkkkk...", "..krrrrrrk..", ".krrrrrrrrk.", ".khhhhhhhhkr", ".khssssssk.r",
            ".kseesseesk.", ".kssssssssk.", ".kpsssssspk.", "..kssoossk..", "...kkkkkk...",
            "..kbbbbbbk..", ".kbbbbbbbbk.", "kbbbbbbbbbbk", "kbbbbbbbbbbk", "kbbbbbbbbbbk",
            "ksyyyyyyyysk", "kskbbbbbbksk", "..kbbbbbbk..", "..kbBbbBbk..", "..kllkkllk..",
            "..kllk.kllk.", "..kllk.kllk.", "..knnk.knnk.", ".knnnk.knnnk", ".kkkkk.kkkkk",
        ],
    },
    "queen": {
        "caption": "LEVEL ★",
        "palette": {"k": "#1f1b2e", "s": "#f8d7c4", "e": "#1f1b2e", "p": "#fb7185", "o": "#e11d48", "h": "#f59e0b",
                    "y": "#facc15", "r": "#ef4444", "m": "#ec4899", "M": "#be185d", "w": "#ffffff"},
        "rows": [
            "..y..yy..y..", "..yyyyyyyy..", "..yryyyyry..", ".khhhhhhhhk.", "khhsssssshhk",
            "khseesseeshk", "khsssssssshk", "khpssssssphk", "khhssoosshhk", "khh.kkkk.hhk",
            "khkmmwwmmkhk", "khkmmmmmmkhk", ".kmmmmmmmmk.", "kmmmmmmmmmmk", "ksmmmmmmmmsk",
            "kkyyyyyyyykk", ".kmmMmmMmmk.", ".kmmMmmMmmk.", "kmmmMmmMmmmk", "kmmmMmmMmmmk",
            "kmmMmmmmMmmk", "kmmMmmmmMmmk", "kmmmmmmmmmmk", "kwwwwwwwwwwk", ".kkkkkkkkkk.",
        ],
    },
}


def _pixel(a: dict, night: bool) -> str:
    sprite = SPRITES[a.get("sprite", "hero")]
    rows, palette = sprite["rows"], sprite["palette"]
    px = 14
    cols = max(len(r) for r in rows)
    ox, oy = (W - cols * px) / 2, H - len(rows) * px - 64
    out = ['<g shape-rendering="crispEdges">']
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            color = palette["s"] if (ch == "e" and night) else palette[ch]
            out.append(f'<rect x="{ox + i * px:.0f}" y="{oy + j * px:.0f}" width="{px}" height="{px}" fill="{color}"/>')
    out.append("</g>")
    caption = "PAUSE" if night else sprite["caption"]
    out.append(f'<text x="100" y="{oy - 30:.0f}" text-anchor="middle" font-family="Courier New, monospace" '
               f'font-weight="700" font-size="28" fill="#fff">{caption}</text>')
    return "".join(out)


CHARACTERS = {"human": _human, "slime": _slime, "pixel": _pixel}

ZZZ = ('<g font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#fff" opacity=".9">'
       '<text x="140" y="72" font-size="28">Z</text><text x="160" y="54" font-size="21">z</text>'
       '<text x="175" y="40" font-size="15">z</text></g>')


# ---------------------------------------------------------------- assemblage


def _pillow(art: dict, face: str, uid: str, rng: random.Random) -> tuple[str, str]:
    """Une housse (W × H) : fond, motif, personnage, reflets et coutures."""
    night = face == "back"
    c1, c2 = art["bg"]
    defs = (
        f'<linearGradient id="{uid}g" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>'
        f'<clipPath id="{uid}c"><rect width="{W}" height="{H}" rx="40"/></clipPath>'
    )
    layers = [f'<rect width="{W}" height="{H}" fill="url(#{uid}g)"/>']
    if night:
        layers.append(f'<rect width="{W}" height="{H}" fill="#0b1026" opacity=".5"/>' + _stars(rng, 26))
    else:
        layers.append(PATTERNS[art.get("pattern", "stars")](rng))
    layers.append(CHARACTERS[art.get("type", "human")](art, night))
    if night:
        layers.append(f'<rect width="{W}" height="{H}" fill="#1e1b4b" opacity=".15"/>' + ZZZ)
    layers.append(f'<rect width="{W}" height="{H}" fill="url(#sheen)"/>')

    body = (
        f'<g clip-path="url(#{uid}c)">{"".join(layers)}</g>'
        f'<rect x="8" y="8" width="{W - 16}" height="{H - 16}" rx="33" fill="none" stroke="#fff" '
        f'stroke-opacity=".6" stroke-width="2" stroke-dasharray="7 6"/>'
        f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="39" fill="none" stroke="#0f172a" '
        f'stroke-opacity=".1" stroke-width="2"/>'
    )
    return defs, body


VIEWS = {
    # face, transformation (la housse est mise à l'échelle puis inclinée autour de son centre)
    "pair": [("back", "translate(268 50) scale(.92) rotate(7 100 270)"),
             ("front", "translate(146 40) scale(.92) rotate(-5 100 270)")],
    "front": [("front", "translate(208 52) scale(.92) rotate(-4 100 270)")],
    "back": [("back", "translate(208 52) scale(.92) rotate(4 100 270)")],
}


def render(art: dict, view: str = "pair", seed: str = "") -> str:
    """Scène carrée 600 × 600 façon photo produit : une housse (recto ou verso) ou les deux."""
    tint = _mix(art["bg"][1], "#ffffff", .78)
    defs = [
        f'<radialGradient id="scene" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#ffffff"/>'
        f'<stop offset="1" stop-color="{tint}"/></radialGradient>',
        '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".2" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/>'
        '</linearGradient>',
        '<filter id="shadow" x="-25%" y="-15%" width="150%" height="135%">'
        '<feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0f172a" flood-opacity=".25"/></filter>',
    ]
    parts = ['<rect width="600" height="600" fill="url(#scene)"/>']
    for i, (face, transform) in enumerate(VIEWS[view]):
        d, body = _pillow(art, face, f"p{i}", random.Random(f"{seed}-{face}"))
        defs.append(d)
        parts.append(f'<g transform="{transform}" filter="url(#shadow)">{body}</g>')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">'
        f'<defs>{"".join(defs)}</defs>{"".join(parts)}</svg>'
    )
