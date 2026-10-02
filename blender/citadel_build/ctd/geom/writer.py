"""Typed polygon writer. All construction remains in fort coordinates."""

import math
import sys
from collections import defaultdict

from .polygon import triangulate


def normal(vertices):
    n = [0.0, 0.0, 0.0]
    for a, b in zip(vertices, vertices[1:] + vertices[:1]):
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    length = math.sqrt(sum(x * x for x in n))
    if length < 1e-10:
        return (0.0, 0.0, 0.0)
    return tuple(x / length for x in n)


def toward(face, direction):
    """The face wound so its normal points along `direction` (an outline's own order says nothing about its sides)."""
    n = normal(face)
    return face if sum(n[i] * direction[i] for i in range(3)) >= 0 else face[::-1]


# Helpers that only forward geometry: an origin names the generator above them.
FORWARDING = {"polygon", "local_face", "local_beam", "block", "panel", "grid", "ribbon", "tube", "ring", "beam",
              "box", "loft", "radial", "annulus", "label", "oriented_ring", "facing", "<listcomp>", "<lambda>"}


class Writer:
    """Typed polygon writer. With `trace` on, every triangle also records the generator that emitted it."""

    trace = False

    def __init__(self):
        self.buffers = defaultdict(lambda: {"vertices": [], "faces": [], "normals": []})
        self.origins = defaultdict(list)
        self.solids = []
        self.rejected_faces = 0

    def polygon(self, vertices, slot="ceramic", lod="mass", bucket="D0", normals=None):
        vertices = [tuple(v) for v in vertices]
        n = normal(vertices)
        if n == (0.0, 0.0, 0.0):
            self.rejected_faces += 1
            return
        dominant = max(range(3), key=lambda i: abs(n[i]))
        axes = [i for i in range(3) if i != dominant]
        flat = [(v[axes[0]], v[axes[1]]) for v in vertices]
        triangles = triangulate(flat)
        buf = self.buffers[(bucket, slot, lod)]
        # Weld positions while retaining analytic/flat loop normals separately.
        lookup = buf.setdefault("lookup", {})
        ids = []
        for v in vertices:
            key = tuple(round(x, 7) for x in v)
            if key not in lookup:
                lookup[key] = len(buf["vertices"])
                buf["vertices"].append(v)
            ids.append(lookup[key])
        nn = normals or [n] * len(vertices)
        for tri in triangles:
            if len({ids[i] for i in tri}) < 3:
                self.rejected_faces += 1
                continue
            a, b, c = (vertices[i] for i in tri)
            ab, ac = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
            cross = (ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0])
            if sum(v * v for v in cross) < 1e-16:
                self.rejected_faces += 1
                continue
            buf["faces"].append(tuple(ids[i] for i in tri))
            buf["normals"].extend(nn[i] for i in tri)
            if self.trace:
                self.origins[(bucket, slot, lod)].append(self.origin())

    @staticmethod
    def origin():
        """module:function:line of the nearest generator frame, skipping forwarding helpers."""
        frame = sys._getframe(2)
        while frame is not None:
            name = frame.f_code.co_name
            if name not in FORWARDING:
                path = frame.f_code.co_filename.replace("\\", "/").split("/ctd/")[-1]
                return f"{path[:-3] if path.endswith('.py') else path}:{name}:{frame.f_lineno}"
            frame = frame.f_back
        return "unknown"

    def box(self, centre, size, slot="ceramic", lod="mass", bucket="D0"):
        x, y, z = centre
        a, b, c = (s * 0.5 for s in size)
        v = [(x - a, y - b, z - c), (x + a, y - b, z - c),
             (x + a, y - b, z + c), (x - a, y - b, z + c),
             (x - a, y + b, z - c), (x + a, y + b, z - c),
             (x + a, y + b, z + c), (x - a, y + b, z + c)]
        for indices in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
                        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            self.polygon([v[i] for i in indices], slot, lod, bucket)

    def loft(self, profiles, heights, slot="ceramic", lod="mass", bucket="D0", smooth=False, caps=True, bottom=False):
        rings = [[(x, y, z) for x, z in p] for p, y in zip(profiles, heights)]
        # Outlines are CCW in x,z, which points down in the y-up frame.
        if caps and bottom:
            self.polygon(rings[0], slot, lod, bucket)
        if caps:
            self.polygon(rings[-1][::-1], slot, lod, bucket)
        corner_normals = []
        for i, profile in enumerate(profiles):
            normals = getattr(profile, "normals", None)
            if normals is None:
                corner_normals.append(None)
                continue
            a, b = max(0, i - 1), min(len(profiles) - 1, i + 1)
            dy = heights[b] - heights[a]
            nn = []
            for j, (nx, nz) in enumerate(normals):
                dx = profiles[b][j][0] - profiles[a][j][0]
                dz = profiles[b][j][1] - profiles[a][j][1]
                ny = -(nx * dx + nz * dz) / max(dy, 1e-8)
                length = math.sqrt(nx * nx + ny * ny + nz * nz)
                nn.append((nx / length, ny / length, nz / length))
            corner_normals.append(nn)
        for row, (lower, upper) in enumerate(zip(rings, rings[1:])):
            for j in range(len(lower)):
                k = (j + 1) % len(lower)
                nn = None
                if corner_normals[row] is not None and corner_normals[row + 1] is not None:
                    nn = [corner_normals[row][j], corner_normals[row + 1][j],
                          corner_normals[row + 1][k], corner_normals[row][k]]
                self.polygon([lower[j], upper[j], upper[k], lower[k]], slot, lod, bucket, nn)

    def beam(self, a, b, width, depth=None, slot="alloyDark", lod="mass", bucket="D0"):
        dx, dy, dz = (b[i] - a[i] for i in range(3))
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        u = (dx / length, dy / length, dz / length)
        # Stable perpendicular frame including vertical beams.
        ref = (0, 1, 0) if abs(u[1]) < 0.95 else (1, 0, 0)
        v = (u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0])
        vl = math.sqrt(sum(x * x for x in v))
        v = tuple(x / vl for x in v)
        w = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        rings = []
        for p in (a, b):
            rings.append([tuple(p[i] + v[i] * sv * width * 0.5 + w[i] * sw * (depth or width) * 0.5
                                for i in range(3)) for sv, sw in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        self.polygon(rings[0][::-1], slot, lod, bucket)
        self.polygon(rings[1], slot, lod, bucket)
        for j in range(4):
            k = (j + 1) % 4
            self.polygon([rings[0][j], rings[0][k], rings[1][k], rings[1][j]], slot, lod, bucket)

    def ring(self, x, z, radius, width, y, height, slot="alloyLight", lod="mass", bucket="D11", sides=64,
             inner_wall=True):
        """A square-section hoop. A hoop that wraps a shell omits its inner wall, which would be buried."""
        profiles = []
        for r in (radius - width * 0.5, radius + width * 0.5):
            profiles.append([(x + r * math.cos(i * math.tau / sides), z + r * math.sin(i * math.tau / sides)) for i in range(sides)])
        inner, outer = profiles
        for j in range(sides):
            k = (j + 1) % sides
            v = lambda p, h: (p[0], h, p[1])
            faces = [[v(inner[j], y), v(outer[j], y), v(outer[k], y), v(inner[k], y)],
                     [v(inner[j], y + height), v(inner[k], y + height), v(outer[k], y + height), v(outer[j], y + height)],
                     [v(outer[j], y), v(outer[j], y + height), v(outer[k], y + height), v(outer[k], y)]]
            if inner_wall:
                faces.append([v(inner[j], y), v(inner[k], y), v(inner[k], y + height), v(inner[j], y + height)])
            for face in faces:
                self.polygon(face, slot, lod, bucket)

    def counts(self):
        buckets, classes = defaultdict(int), defaultdict(int)
        for (bucket, slot, lod), buf in self.buffers.items():
            buckets[bucket] += len(buf["faces"])
            classes[lod] += len(buf["faces"])
        return {"triangles": sum(classes.values()), "by_bucket": dict(buckets),
                "by_class": dict(classes), "meshes": len(self.buffers),
                "rejected_faces": self.rejected_faces}
