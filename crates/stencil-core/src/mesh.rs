//! Band-stack mesher. Works in integer micrometres so welding is exact.
//!
//! A *stack* is a list of `Band { z0, z1, region }`. Bands are resolved into z-slabs
//! (between consecutive distinct levels) whose region is the union of covering bands.
//! Each slab gets side walls; level planes get cap faces for the difference of the
//! slabs below/above. T-junctions are then removed so the mesh is watertight.

use crate::geom::Region;
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay::Overlay;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::core::single::SingleIntOverlay;
use i_overlay::i_float::int::point::IntPoint;
use i_triangle::int::triangulatable::IntTriangulatable;
use std::collections::HashMap;

pub const UNIT: f64 = 1000.0; // integer units per mm

pub type IShapes = Vec<Vec<Vec<IntPoint>>>;

pub struct Band {
    pub z0: i32,
    pub z1: i32,
    pub region: IShapes,
}

#[derive(Default, Clone)]
pub struct Mesh {
    /// Integer vertices (µm).
    pub verts: Vec<[i32; 3]>,
    pub tris: Vec<[u32; 3]>,
}

pub fn to_int(r: &Region) -> IShapes {
    let raw: IShapes = r
        .iter()
        .map(|s| {
            s.iter()
                .map(|c| c.iter().map(|p| IntPoint::new((p[0] * UNIT).round() as i32, (p[1] * UNIT).round() as i32)).collect())
                .collect()
        })
        .collect();
    clean(&raw)
}

pub fn clean(s: &IShapes) -> IShapes {
    let empty: IShapes = Vec::new();
    if s.is_empty() {
        return empty;
    }
    s.overlay(&empty, OverlayRule::Subject, FillRule::NonZero)
}

pub fn mm(v: f64) -> i32 {
    (v * UNIT).round() as i32
}

fn ou(a: &IShapes, b: &IShapes, rule: OverlayRule) -> IShapes {
    if b.is_empty() {
        return if matches!(rule, OverlayRule::Intersect) { Vec::new() } else { a.clone() };
    }
    if a.is_empty() {
        return match rule {
            OverlayRule::Union | OverlayRule::Xor => b.clone(),
            _ => Vec::new(),
        };
    }
    a.overlay(b, rule, FillRule::NonZero)
}

pub fn iunion(a: &IShapes, b: &IShapes) -> IShapes {
    ou(a, b, OverlayRule::Union)
}
pub fn idiff(a: &IShapes, b: &IShapes) -> IShapes {
    ou(a, b, OverlayRule::Difference)
}

struct Builder {
    verts: Vec<[i32; 3]>,
    map: HashMap<[i32; 3], u32>,
    tris: Vec<[u32; 3]>,
}

impl Builder {
    fn v(&mut self, p: [i32; 3]) -> u32 {
        if let Some(&i) = self.map.get(&p) {
            return i;
        }
        let i = self.verts.len() as u32;
        self.verts.push(p);
        self.map.insert(p, i);
        i
    }
    fn tri(&mut self, a: u32, b: u32, c: u32) {
        if a != b && b != c && a != c {
            self.tris.push([a, b, c]);
        }
    }
    fn cap(&mut self, shapes: &IShapes, z: i32, up: bool) {
        for shape in shapes {
            let t = shape.triangulate().into_triangulation::<u32>();
            for tri in t.indices.chunks_exact(3) {
                let p: Vec<IntPoint> = tri.iter().map(|&i| t.points[i as usize]).collect();
                // i_triangle emits CCW triangles; zero-area ones have no usable orientation, drop them.
                let a2 = (p[1].x as i64 - p[0].x as i64) * (p[2].y as i64 - p[0].y as i64)
                    - (p[2].x as i64 - p[0].x as i64) * (p[1].y as i64 - p[0].y as i64);
                if a2 == 0 {
                    continue;
                }
                let ids: Vec<u32> = p.iter().map(|q| self.v([q.x, q.y, z])).collect();
                if up {
                    self.tri(ids[0], ids[1], ids[2]);
                } else {
                    self.tri(ids[0], ids[2], ids[1]);
                }
            }
        }
    }
    fn walls(&mut self, shapes: &IShapes, z0: i32, z1: i32) {
        for shape in shapes {
            for c in shape {
                let n = c.len();
                for i in 0..n {
                    let (a, b) = (c[i], c[(i + 1) % n]);
                    if a == b {
                        continue;
                    }
                    let a0 = self.v([a.x, a.y, z0]);
                    let b0 = self.v([b.x, b.y, z0]);
                    let b1 = self.v([b.x, b.y, z1]);
                    let a1 = self.v([a.x, a.y, z1]);
                    self.tri(a0, b0, b1);
                    self.tri(a0, b1, a1);
                }
            }
        }
    }
}

/// Result of overlaying two adjacent slabs through one shared arrangement, so that all four
/// outputs use exactly the same cut vertices.
struct Pair {
    a: IShapes,
    b: IShapes,
    a_minus_b: IShapes,
    b_minus_a: IShapes,
}

fn pair(a: &IShapes, b: &IShapes) -> Pair {
    if a.is_empty() || b.is_empty() {
        return Pair { a: a.clone(), b: b.clone(), a_minus_b: a.clone(), b_minus_a: b.clone() };
    }
    let mut ov = Overlay::from_subj_and_clip(a, b);
    ov.options.preserve_input_collinear = true;
    ov.options.preserve_output_collinear = true;
    let mut buf = Default::default();
    match ov.build_graph_view(FillRule::NonZero) {
        Some(g) => Pair {
            a: g.extract_shapes(OverlayRule::Subject, &mut buf),
            b: g.extract_shapes(OverlayRule::Clip, &mut buf),
            a_minus_b: g.extract_shapes(OverlayRule::Difference, &mut buf),
            b_minus_a: g.extract_shapes(OverlayRule::InverseDifference, &mut buf),
        },
        None => Pair { a: a.clone(), b: b.clone(), a_minus_b: vec![], b_minus_a: vec![] },
    }
}

pub fn build(bands: &[Band]) -> Mesh {
    let mut levels: Vec<i32> = bands.iter().flat_map(|b| [b.z0, b.z1]).collect();
    levels.sort_unstable();
    levels.dedup();
    if levels.len() < 2 {
        return Mesh::default();
    }
    // slab regions
    let mut slabs: Vec<IShapes> = Vec::new();
    for w in levels.windows(2) {
        let (lo, hi) = (w[0], w[1]);
        let mut acc: IShapes = Vec::new();
        for b in bands {
            if b.z0 <= lo && b.z1 >= hi {
                acc = iunion(&acc, &b.region);
            }
        }
        slabs.push(acc);
    }
    let mut bld = Builder { verts: vec![], map: HashMap::new(), tris: vec![] };
    let n = slabs.len();
    // Pairwise shared arrangements between adjacent slabs.
    let pairs: Vec<Pair> = (0..n.saturating_sub(1)).map(|i| pair(&slabs[i], &slabs[i + 1])).collect();
    // Each slab's wall region: the version consistent with its upper cap when there is one.
    let wall_region = |i: usize| -> &IShapes {
        if i + 1 < n {
            &pairs[i].a
        } else if i > 0 {
            &pairs[i - 1].b
        } else {
            &slabs[i]
        }
    };
    for i in 0..n {
        bld.walls(wall_region(i), levels[i], levels[i + 1]);
    }
    bld.cap(wall_region(0), levels[0], false);
    bld.cap(wall_region(n - 1), levels[n], true);
    for (i, p) in pairs.iter().enumerate() {
        let z = levels[i + 1];
        bld.cap(&p.a_minus_b, z, true); // lower slab pokes out -> faces up
        bld.cap(&p.b_minus_a, z, false); // upper slab overhangs -> faces down
    }
    let mut mesh = Mesh { verts: bld.verts, tris: bld.tris };
    fix_t_junctions(&mut mesh);
    mesh
}

/// Repair T-junctions: split unmatched horizontal edges at other unmatched-edge vertices
/// of the same plane that lie on them (within 1µm). Matched edges are never touched.
fn fix_t_junctions(m: &mut Mesh) {
    const CELL: i32 = 4096;
    for _ in 0..8 {
        let mut cnt: HashMap<(u32, u32), u32> = HashMap::new();
        for t in &m.tris {
            for e in 0..3 {
                *cnt.entry((t[e], t[(e + 1) % 3])).or_default() += 1;
            }
        }
        let is_open = |a: u32, b: u32| -> bool { !cnt.contains_key(&(b, a)) };
        let mut open_vert = vec![false; m.verts.len()];
        let mut any = false;
        for t in &m.tris {
            for e in 0..3 {
                let (a, b) = (t[e], t[(e + 1) % 3]);
                if is_open(a, b) && m.verts[a as usize][2] == m.verts[b as usize][2] {
                    open_vert[a as usize] = true;
                    open_vert[b as usize] = true;
                    any = true;
                }
            }
        }
        if !any {
            return;
        }
        let verts = &m.verts;
        let mut grid: HashMap<(i32, i32, i32), Vec<u32>> = HashMap::new();
        for (i, v) in verts.iter().enumerate() {
            if open_vert[i] {
                grid.entry((v[2], v[0].div_euclid(CELL), v[1].div_euclid(CELL))).or_default().push(i as u32);
            }
        }
        let on_edge = |a: u32, b: u32, opp: u32| -> Vec<u32> {
            let (pa, pb) = (verts[a as usize], verts[b as usize]);
            let z = pa[2];
            let (x0, x1) = (pa[0].min(pb[0]) - 1, pa[0].max(pb[0]) + 1);
            let (y0, y1) = (pa[1].min(pb[1]) - 1, pa[1].max(pb[1]) + 1);
            let (dx, dy) = ((pb[0] - pa[0]) as f64, (pb[1] - pa[1]) as f64);
            let len2 = dx * dx + dy * dy;
            if len2 == 0.0 {
                return vec![];
            }
            let len = len2.sqrt();
            let mut found: Vec<(f64, u32)> = vec![];
            for cx in x0.div_euclid(CELL)..=x1.div_euclid(CELL) {
                for cy in y0.div_euclid(CELL)..=y1.div_euclid(CELL) {
                    if let Some(list) = grid.get(&(z, cx, cy)) {
                        for &k in list {
                            if k == a || k == b || k == opp {
                                continue;
                            }
                            let q = verts[k as usize];
                            let (qx, qy) = ((q[0] - pa[0]) as f64, (q[1] - pa[1]) as f64);
                            let t = (qx * dx + qy * dy) / len2;
                            if t <= 0.0 || t >= 1.0 {
                                continue;
                            }
                            if (qx * dy - qy * dx).abs() / len <= 1.0 {
                                found.push((t, k));
                            }
                        }
                    }
                }
            }
            found.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap());
            found.into_iter().map(|f| f.1).collect()
        };
        let mut changed = false;
        let mut out: Vec<[u32; 3]> = Vec::with_capacity(m.tris.len());
        for t in &m.tris {
            let mut done = false;
            for e in 0..3 {
                let (a, b, opp) = (t[e], t[(e + 1) % 3], t[(e + 2) % 3]);
                if !is_open(a, b) || verts[a as usize][2] != verts[b as usize][2] {
                    continue;
                }
                let mid = on_edge(a, b, opp);
                if mid.is_empty() {
                    continue;
                }
                let mut chain = vec![a];
                chain.extend(mid);
                chain.push(b);
                for w in chain.windows(2) {
                    if w[0] != w[1] {
                        out.push([w[0], w[1], opp]);
                    }
                }
                done = true;
                changed = true;
                break;
            }
            if !done {
                out.push(*t);
            }
        }
        m.tris = out;
        if !changed {
            return;
        }
    }
}

/// Returns number of open (unmatched) and non-manifold (>1 usage) directed edges.
pub fn validate(m: &Mesh) -> (usize, usize) {
    let mut cnt: HashMap<(u32, u32), u32> = HashMap::new();
    for t in &m.tris {
        for e in 0..3 {
            *cnt.entry((t[e], t[(e + 1) % 3])).or_default() += 1;
        }
    }
    let mut open = 0;
    let mut bad = 0;
    for (&(a, b), &c) in &cnt {
        if c > 1 {
            bad += 1;
        }
        if !cnt.contains_key(&(b, a)) {
            open += 1;
        }
    }
    (open, bad)
}

/// Signed volume in mm³ (positive for outward-facing winding).
pub fn volume(m: &Mesh) -> f64 {
    let mut v = 0.0;
    for t in &m.tris {
        let p: Vec<[f64; 3]> = t.iter().map(|&i| m.verts[i as usize].map(|c| c as f64 / UNIT)).collect();
        v += p[0][0] * (p[1][1] * p[2][2] - p[2][1] * p[1][2])
            - p[0][1] * (p[1][0] * p[2][2] - p[2][0] * p[1][2])
            + p[0][2] * (p[1][0] * p[2][1] - p[2][0] * p[1][1]);
    }
    v / 6.0
}

pub fn positions_f32(m: &Mesh, origin: [f64; 2]) -> Vec<f32> {
    m.verts
        .iter()
        .flat_map(|v| [(v[0] as f64 / UNIT - origin[0]) as f32, (v[1] as f64 / UNIT - origin[1]) as f32, (v[2] as f64 / UNIT) as f32])
        .collect()
}

pub fn indices_flat(m: &Mesh) -> Vec<u32> {
    m.tris.iter().flatten().copied().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geom::*;

    fn band(z0: f64, z1: f64, r: &Region) -> Band {
        Band { z0: mm(z0), z1: mm(z1), region: to_int(r) }
    }

    #[test]
    fn extruded_ring_is_watertight() {
        let ring = difference(&rect(0., 0., 20., 20.), &circle(10., 10., 6.));
        let m = build(&[band(0., 2., &ring)]);
        assert_eq!(validate(&m), (0, 0));
        let expect = area(&ring) * 2.0;
        assert!((volume(&m) - expect).abs() / expect < 0.002, "{} vs {}", volume(&m), expect);
    }

    #[test]
    fn stepped_bands_with_floating_bridge_are_watertight() {
        let slab = rect(0., 0., 40., 20.);
        let hole = rect(5., 5., 35., 15.);
        let island = rect(15., 8., 25., 12.);
        let m_region = union(&difference(&slab, &hole), &island);
        let bridge = rect(19., 11., 21., 16.); // floats, overlaps island and border
        let base = band(0., 1.0, &m_region);
        let top = band(1.0, 2.0, &union(&m_region, &bridge));
        let m = build(&[base, top]);
        assert_eq!(validate(&m), (0, 0), "mesh must be closed");
        assert!(volume(&m) > 0.0);
    }

    #[test]
    fn chamfer_like_offsets_are_watertight() {
        let slab = rect(0., 0., 30., 30.);
        let hole = circle(15., 15., 8.);
        let m_region = difference(&slab, &hole);
        let b0 = band(0., 0.4, &difference(&slab, &offset(&hole, 0.6)));
        let b1 = band(0.4, 0.8, &difference(&slab, &offset(&hole, 0.3)));
        let b2 = band(0.8, 1.2, &m_region);
        let m = build(&[b0, b1, b2]);
        assert_eq!(validate(&m), (0, 0));
    }
}

#[cfg(test)]
pub fn debug_bad(m: &Mesh) -> Vec<String> {
    let mut cnt: HashMap<(u32, u32), u32> = HashMap::new();
    for t in &m.tris {
        for e in 0..3 {
            *cnt.entry((t[e], t[(e + 1) % 3])).or_default() += 1;
        }
    }
    let mut out = vec![];
    for (&(a, b), &c) in &cnt {
        let open = !cnt.contains_key(&(b, a));
        if c > 1 || open {
            out.push(format!("{:?}->{:?} count={} open={}", m.verts[a as usize], m.verts[b as usize], c, open));
        }
    }
    out
}

#[cfg(test)]
mod orient_probe {
    use super::*;
    use crate::geom::*;
    #[test]
    fn triangulator_orientation_is_consistent() {
        let r = to_int(&difference(&rect(0., 0., 30., 30.), &circle(15., 15., 9.)));
        let mut neg = 0;
        let mut pos = 0;
        for shape in &r {
            let t = shape.triangulate().into_triangulation::<u32>();
            for tri in t.indices.chunks_exact(3) {
                let p: Vec<IntPoint> = tri.iter().map(|&i| t.points[i as usize]).collect();
                let a2 = (p[1].x as i64 - p[0].x as i64) * (p[2].y as i64 - p[0].y as i64) - (p[2].x as i64 - p[0].x as i64) * (p[1].y as i64 - p[0].y as i64);
                if a2 > 0 { pos += 1 } else if a2 < 0 { neg += 1 }
            }
        }
        println!("pos {pos} neg {neg}");
        assert!(pos == 0 || neg == 0);
    }
}
