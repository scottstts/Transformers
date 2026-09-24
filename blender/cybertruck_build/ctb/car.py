"""Cybertruck exterior panels cut from the body skins (see car_body)."""
from . import kit
from . import car_body as B
from .car_body import (NOSE, TAIL, APEX, A_BASE, B_SEAM, R_SEAM, R_SEAM_TOP, F_SEAM_TOP, VAULT, WS_BASE, WS_SPLIT,
                       XS, FA, RA, G, belt, ztop, xtop, s1_x, MITER, NOSE_SEAM_F, FASCIA_BOTTOM,
                       TAILGATE_BOTTOM, LIGHTBAR_BOTTOM, LIGHTBAR_TOP, ARCH_HW)

CORNER = 0.035          # quarter panel wrap onto the rear face
SEAL = 0.028            # window seal height above the belt (z)
PILLAR = 0.075          # B-pillar black trim width (f)
CREASE_TOP = 0.012      # crease trim width on the deck (x)
RAIL = 0.035            # vault rail width on the deck (x)
X_BIG = 1.45
WIN_K = 0.07           # side glazing top at 93 % of the tumblehome height


def xr(f, k=0.015):
    """Chamfer boundary just below the roof edge (u = 1 - k), top-view x."""
    return xtop(f) + k * (XS - xtop(f))


def side_x(s):
    return (0.35, X_BIG) if s > 0 else (-X_BIG, -0.35)


def mx(poly, s):
    return poly if s > 0 else B.mirror_poly_x(poly)


def seam_f(p0, p1, z):
    return B.line_f_at_z(p0, p1, z)


def build(coll):
    parts = {}

    steel = B.make_skin('skin.steel', B.SKIN, 'steel', coll)
    glass = B.make_skin('skin.glass', B.GLASS, 'glass', coll)
    trim = B.make_skin('skin.trim', 0.02, 'plastic', coll)
    seal = B.make_skin('skin.seal', 0.009, 'plastic', coll)     # thin window seals: the lowered glass passes inside them
    vault = B.make_skin('skin.vault', 0.03, 'tonneau', coll)

    # wheel arches (skin runs under the cladding by 45 mm)
    arch_cuts = []
    for a in (FA, RA):
        poly = kit.offset_poly(kit.ccw(B.arch_opening(a)), 0.045)
        for s in (1, -1):
            arch_cuts.append(B.side_prism(poly, *side_x(s), shrink=0))
    B.cut_away(steel, arch_cuts)

    def panel(name, skin, cutters, finish=0.004, seg=2, angle=15.0, pockets=()):
        o = B.cut_region(skin, name, cutters, coll)
        if pockets:
            B.cut_away(o, pockets)
        kit.finish(o, finish, seg, angle)
        parts[name] = o
        return o

    df_a = (A_BASE, belt(A_BASE))
    df_b = (F_SEAM_TOP, ztop(F_SEAM_TOP))
    dr_a = (R_SEAM, belt(R_SEAM))
    dr_b = (R_SEAM_TOP, ztop(R_SEAM_TOP))
    top_ext_f = seam_f(df_a, df_b, 3.2)
    top_ext_r = seam_f(dr_a, dr_b, 3.2)

    for S, s in (('L', 1), ('R', -1)):
        sx = side_x(s)

        # ---------------------------------------------------------- front deck
        # glass panels are split at WS_SPLIT (windshield) and B_SEAM (roof glass): see docs/cybertruck.md
        cowl_f = WS_BASE + B.COWL
        panel('hood.' + S, steel, [B.top_prism(mx([(0, cowl_f), (s1_x(cowl_f), cowl_f), (s1_x(NOSE_SEAM_F), NOSE_SEAM_F), (0, NOSE_SEAM_F)], s), 0.5, 3)])
        panel('cowl.' + S, trim, [B.top_prism(mx([(0, WS_BASE), (s1_x(WS_BASE), WS_BASE), (s1_x(cowl_f), cowl_f), (0, cowl_f)], s), 0.5, 3)], 0.003)

        def deck_glass(name, f0, f1):
            return panel(name, glass, [B.top_prism(mx([(0, f0), (xtop(f0) - CREASE_TOP, f0), (xtop(f1) - CREASE_TOP, f1), (0, f1)], s), 0.5, 3)], 0.002)

        def crease(name, f0, f1):
            return panel(name, trim, [B.top_prism(mx([(xtop(f0) - CREASE_TOP, f0), (xtop(f1) - CREASE_TOP, f1),
                                                     (xr(f1, WIN_K), f1), (xr(f0, WIN_K), f0)], s), 0.5, 3)], 0.002)

        deck_glass('windshield.' + S, APEX, WS_SPLIT)
        deck_glass('windshieldLo.' + S, WS_SPLIT, WS_BASE)
        deck_glass('roofglass.' + S, VAULT, B_SEAM)
        deck_glass('roofglassF.' + S, B_SEAM, APEX)

        # ------------------------------------------------------------- nose
        # split at x = NOSE_SPLIT: inner half becomes the toe cap, outer half the foot's side guard
        seam = B.nose_seam()
        xm = B.NOSE_SPLIT
        nose_in = [(0.0, NOSE_SEAM_F), (xm, NOSE_SEAM_F), (xm, 3.4), (0.0, 3.4)]
        nose_out = [(xm, NOSE_SEAM_F)] + seam[1:] + [(X_BIG, 3.4), (xm, 3.4)]
        fascia = B.side_prism([(2.0, FASCIA_BOTTOM), (3.5, FASCIA_BOTTOM), (3.5, 3.0), (2.0, 3.0)], -X_BIG, X_BIG)
        panel('nose.' + S, steel, [B.top_prism(mx(nose_in, s), 0.5, 3), fascia])
        panel('noseO.' + S, steel, [B.top_prism(mx(nose_out, s), 0.5, 3), fascia])

        # ----------------------------------------------------------- fender
        # deck strip only ahead of the cowl; behind it the fender keeps just the tumblehome facet
        fender_top = [(xr(0.5, WIN_K), 0.5), (X_BIG, 0.5), (X_BIG, X_BIG + MITER), seam[2], seam[1],
                      (s1_x(WS_BASE), WS_BASE), (xr(WS_BASE, WIN_K), WS_BASE)]
        f_bump = B.BUMPER_F
        fender_side = [(A_BASE, 0.1), (f_bump, 0.1), (f_bump, FASCIA_BOTTOM), (3.5, FASCIA_BOTTOM), (3.5, 3.2), (top_ext_f, 3.2), df_b, df_a]
        marker_pocket = B.side_prism([(NOSE - 0.23, 0.87), (NOSE - 0.09, 0.87), (NOSE - 0.09, 0.90), (NOSE - 0.23, 0.90)],
                                     *((XS - 0.004, X_BIG) if s > 0 else (-X_BIG, -(XS - 0.004))), shrink=0)
        panel('fender.' + S, steel, [B.top_prism(mx(fender_top, s), 0.2, 3), B.side_prism(fender_side, *sx)], pockets=[marker_pocket])

        # ------------------------------------------------------------- doors
        panel('door.' + S, steel, [B.side_prism([(B_SEAM, 0.1), (A_BASE, 0.1), (A_BASE, belt(A_BASE) + 0.004), (B_SEAM, belt(B_SEAM) + 0.004)], *sx)])
        panel('rdoor.' + S, steel, [B.side_prism([(R_SEAM, 0.1), (B_SEAM, 0.1), (B_SEAM, belt(B_SEAM) + 0.004), (R_SEAM, belt(R_SEAM) + 0.004)], *sx)])

        # glazing on the tumblehome: seal strip, glass, B-pillar trim
        # glazing stops at u = 1 - WIN_K; the black roof-edge band covers the rest (the glass must fit the door when lowered)
        cham_top = B.top_prism(mx([(xr(-1.5, WIN_K), -1.5), (X_BIG, -1.5), (X_BIG, 2.0), (xr(2.0, WIN_K), 2.0), (xr(APEX, WIN_K), APEX)], s), 0.5, 3, shrink=0)
        z_seal = lambda f: belt(f) + SEAL
        f_front_seal = seam_f(df_a, df_b, belt(A_BASE) + SEAL)
        f_rear_seal = seam_f(dr_a, dr_b, belt(R_SEAM) + SEAL)
        panel('sealF.' + S, seal, [cham_top, B.side_prism([(B_SEAM, belt(B_SEAM) + 0.004), (A_BASE, belt(A_BASE) + 0.004),
                                                          (f_front_seal, z_seal(A_BASE)), (B_SEAM, z_seal(B_SEAM))], *sx, shrink=G * 0.6)], 0.002)
        panel('sealR.' + S, seal, [cham_top, B.side_prism([(R_SEAM, belt(R_SEAM) + 0.004), (B_SEAM, belt(B_SEAM) + 0.004),
                                                          (B_SEAM, z_seal(B_SEAM)), (f_rear_seal, z_seal(R_SEAM))], *sx, shrink=G * 0.6)], 0.002)
        panel('winF.' + S, glass, [cham_top, B.side_prism([(B_SEAM, z_seal(B_SEAM)), (f_front_seal, z_seal(A_BASE)), df_b, (top_ext_f, 3.2), (B_SEAM, 3.2)], *sx)], 0.002)
        panel('pillar.' + S, trim, [cham_top, B.side_prism([(B_SEAM - PILLAR, z_seal(B_SEAM - PILLAR)), (B_SEAM, z_seal(B_SEAM)), (B_SEAM, 3.2), (B_SEAM - PILLAR, 3.2)], *sx)], 0.002)
        panel('winR.' + S, glass, [cham_top, B.side_prism([(f_rear_seal, z_seal(R_SEAM)), (B_SEAM - PILLAR, z_seal(B_SEAM - PILLAR)), (B_SEAM - PILLAR, 3.2), (top_ext_r, 3.2), dr_b], *sx)], 0.002)

        # roof-edge crease trim: A-pillar (front deck) and roof rail (rear deck), split with the glass
        crease('creaseF.' + S, APEX, WS_SPLIT)
        crease('creaseFLo.' + S, WS_SPLIT, WS_BASE)
        crease('creaseR.' + S, VAULT, B_SEAM)
        crease('creaseRF.' + S, B_SEAM, APEX)

        # ---------------------------------------------------------- quarter
        f_rb = B.REAR_BUMPER_F
        quarter_side = [(-3.5, TAILGATE_BOTTOM), (f_rb, TAILGATE_BOTTOM), (f_rb, 0.1), (R_SEAM, 0.1), dr_a, dr_b, (top_ext_r, 3.2), (-3.5, 3.2)]
        f_cap = TAIL + 0.04
        # behind the crease trim (VAULT..) the sail meets the roof-edge band at u = 1 - WIN_K, further back the vault rail
        # (the corner line sits under rear_env, which alone cuts the reveal to the rear bands: no coplanar faces)
        quarter_top = [(xr(0.0, WIN_K), 0.0), (X_BIG, 0.0), (X_BIG, -3.5), (XS - CORNER - 0.01, -3.5), (XS - CORNER - 0.01, f_cap), (xr(f_cap), f_cap),
                       (xr(VAULT), VAULT), (xr(VAULT, WIN_K), VAULT)]
        # the raked rear face runs ahead of f_cap low down: its inboard part belongs to the rear bands
        rear_env = B.side_prism(B.rear_face_region(0.0, 3.2), -(XS - CORNER + G), XS - CORNER + G, shrink=0)
        panel('quarter.' + S, steel, [B.top_prism(mx(quarter_top, s), 0.2, 3), B.side_prism(quarter_side, *sx)], pockets=[rear_env])

        # vault rail over the rear crease
        rail = [(xtop(f_cap) - RAIL, f_cap), (xr(f_cap), f_cap), (xr(VAULT), VAULT), (xtop(VAULT) - RAIL, VAULT)]
        # deck parts start just under the tail top: lower down the raked rear face lies ahead of f_cap
        z_deck = B.Z_TAIL - 0.05
        panel('rail.' + S, trim, [B.top_prism(mx(rail, s), z_deck, 3)], 0.003)

        # vault cover slats
        n = 8
        for i in range(n):
            f0 = f_cap + (VAULT - f_cap) * i / n
            f1 = f_cap + (VAULT - f_cap) * (i + 1) / n
            slat = [(0, f0), (xtop(f0) - RAIL, f0), (xtop(f1) - RAIL, f1), (0, f1)]
            panel('vault%d.%s' % (i, S), vault, [B.top_prism(mx(slat, s), z_deck, 3, shrink=0.0015)], 0.003)

    # ---------------------------------------------------------------- rear face
    # one closed region per rear-face band: stacking the strip and a z-slab as two EXACT intersects
    # silently fails on these thin bands (the slab clip was dropped and the bands overlapped)
    def rear_band(z0, z1):
        return [B.side_prism(B.rear_face_region(z0, z1), -(XS - CORNER - G), XS - CORNER - G)]
    zg = B.LIGHTBAR_GROOVE
    groove = B.side_prism(B.rear_face_region(zg[0], zg[1], 0.004), -0.955, 0.955, shrink=0)
    panel('tailcap', steel, rear_band(LIGHTBAR_TOP, 3.0))
    panel('lightband', trim, rear_band(LIGHTBAR_BOTTOM, LIGHTBAR_TOP), 0.003, pockets=[groove])
    panel('tailgate', steel, rear_band(TAILGATE_BOTTOM, LIGHTBAR_BOTTOM))

    for sk in (steel, glass, trim, vault, seal):
        data = sk.data
        kit.bpy.data.objects.remove(sk, do_unlink=True)
        kit.bpy.data.meshes.remove(data)
    return parts
