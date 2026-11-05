//! Island detection and automatic bridge placement.
//!
//! The material region `M` is split into connected components (one `Shape` each).
//! Bridges are rectangles spanning the open gap between two components. Candidates are found by
//! casting rays from island boundaries; a Kruskal pass guarantees every island is anchored,
//! then extra bridges are added (angularly spread) until each island has `min_per_island`.

use crate::doc::{BridgeKind, Bridges, Strategy};
use crate::geom::{self, Region, Shape, P2};

#[derive(Clone, Debug)]
pub struct Bridge {
    pub a: P2,
    pub b: P2,
    pub width: f64,
    pub kind: BridgeKind,
    pub manual: bool,
    pub manual_id: Option<String>,
}

struct Seg {
    a: P2,
    b: P2,
    comp: usize,
}

#[derive(Clone)]
#[allow(dead_code)]
struct Cand {
    from: usize,
    to: usize,
    p: P2,
    q: P2,
    len: f64,
    score: f64,
}

pub struct CompInfo {
    pub bbox: [f64; 4],
    pub area: f64,
    pub centroid: P2,
    pub perimeter: f64,
}

pub fn comp_info(s: &Shape) -> CompInfo {
    let r = vec![s.clone()];
    let bbox = geom::bounds(&r).unwrap_or([0.0; 4]);
    let area = geom::area(&r);
    let (mut cx, mut cy, mut wsum, mut per) = (0.0, 0.0, 0.0, 0.0);
    for c in s {
        let n = c.len();
        for i in 0..n {
            let (p, q) = (c[i], c[(i + 1) % n]);
            let l = ((q[0] - p[0]).powi(2) + (q[1] - p[1]).powi(2)).sqrt();
            per += l;
            cx += (p[0] + q[0]) * 0.5 * l;
            cy += (p[1] + q[1]) * 0.5 * l;
            wsum += l;
        }
    }
    let centroid = if wsum > 0.0 { [cx / wsum, cy / wsum] } else { [bbox[0], bbox[1]] };
    CompInfo { bbox, area, centroid, perimeter: per }
}

fn dot(a: P2, b: P2) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}
fn norm(a: P2) -> P2 {
    let l = (a[0] * a[0] + a[1] * a[1]).sqrt();
    if l < 1e-12 {
        [0.0, 0.0]
    } else {
        [a[0] / l, a[1] / l]
    }
}
fn dist(a: P2, b: P2) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

/// Nearest ray/segment hit distance (t in mm along unit `d`), if any with t > eps.
fn ray_seg(o: P2, d: P2, s: &Seg) -> Option<f64> {
    let e = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    let denom = d[0] * e[1] - d[1] * e[0];
    if denom.abs() < 1e-12 {
        return None;
    }
    let w = [s.a[0] - o[0], s.a[1] - o[1]];
    let t = (w[0] * e[1] - w[1] * e[0]) / denom;
    let u = (w[0] * d[1] - w[1] * d[0]) / denom;
    if t > 1e-4 && (-1e-9..=1.0 + 1e-9).contains(&u) {
        Some(t)
    } else {
        None
    }
}

/// Point-in-shape (outer minus holes) using even-odd over all contours.
pub fn point_in_shape(s: &Shape, p: P2) -> bool {
    let mut inside = false;
    for c in s {
        let n = c.len();
        let mut j = n - 1;
        for i in 0..n {
            let (a, b) = (c[i], c[j]);
            if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
                inside = !inside;
            }
            j = i;
        }
    }
    inside
}

pub fn locate(region: &Region, infos: &[CompInfo], p: P2) -> Option<usize> {
    region.iter().enumerate().find_map(|(i, s)| {
        let b = infos[i].bbox;
        (p[0] >= b[0] - 1e-6 && p[0] <= b[2] + 1e-6 && p[1] >= b[1] - 1e-6 && p[1] <= b[3] + 1e-6 && point_in_shape(s, p)).then_some(i)
    })
}

fn all_segs(m: &Region) -> Vec<Seg> {
    let mut segs = Vec::new();
    for (ci, s) in m.iter().enumerate() {
        for c in s {
            let n = c.len();
            for i in 0..n {
                segs.push(Seg { a: c[i], b: c[(i + 1) % n], comp: ci });
            }
        }
    }
    segs
}

/// Move a manual bridge's endpoints onto the nearest material boundary along its axis, so a
/// roughly placed bridge still reaches solid material on both ends. Returns the snapped endpoints
/// and the components they land in.
pub fn snap_manual(m: &Region, infos: &[CompInfo], a: P2, b: P2) -> (P2, P2, Option<usize>, Option<usize>) {
    let d = norm([b[0] - a[0], b[1] - a[1]]);
    if d == [0.0, 0.0] {
        return (a, b, None, None);
    }
    let reach = dist(a, b) + 20.0;
    let segs = all_segs(m);
    let (in_a, in_b) = (locate(m, infos, a), locate(m, infos, b));
    let cast = |p: P2, dir: P2, exclude: Option<usize>| -> Option<(P2, usize)> {
        let mut best: Option<(f64, usize)> = None;
        for s in &segs {
            if Some(s.comp) == exclude {
                continue;
            }
            if let Some(t) = ray_seg(p, dir, s) {
                if t <= reach && best.map_or(true, |bst| t < bst.0) {
                    best = Some((t, s.comp));
                }
            }
        }
        best.map(|(t, c)| ([p[0] + dir[0] * t, p[1] + dir[1] * t], c))
    };
    // An endpoint dropped in the gap extends *outwards* (away from the other end) to the nearest
    // material, never back into the component the other end already sits on.
    let snap_end = |p: P2, here: Option<usize>, other: Option<usize>, toward: P2| -> (P2, Option<usize>) {
        if here.is_some() {
            return (p, here);
        }
        let away = [-toward[0], -toward[1]];
        for dir in [away, toward] {
            if let Some((q, c)) = cast(p, dir, other) {
                return (q, Some(c));
            }
        }
        (p, None)
    };
    let (pa, ca) = snap_end(a, in_a, in_b, d);
    let (pb, cb) = snap_end(b, in_b, in_a, [-d[0], -d[1]]);
    (pa, pb, ca, cb)
}

struct Dsu(Vec<usize>);
impl Dsu {
    fn find(&mut self, x: usize) -> usize {
        if self.0[x] != x {
            let r = self.find(self.0[x]);
            self.0[x] = r;
        }
        self.0[x]
    }
    fn union(&mut self, a: usize, b: usize) -> bool {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra == rb {
            return false;
        }
        self.0[ra] = rb;
        true
    }
}

/// Which component acts as the anchor (largest by bbox area of its outer contour).
pub fn root_index(infos: &[CompInfo]) -> usize {
    infos
        .iter()
        .enumerate()
        .max_by(|a, b| {
            let wa = (a.1.bbox[2] - a.1.bbox[0]) * (a.1.bbox[3] - a.1.bbox[1]);
            let wb = (b.1.bbox[2] - b.1.bbox[0]) * (b.1.bbox[3] - b.1.bbox[1]);
            wa.partial_cmp(&wb).unwrap()
        })
        .map(|x| x.0)
        .unwrap_or(0)
}

fn directions(strategy: &Strategy, angle_deg: f64, normal: P2, p: P2, centroid: P2) -> Vec<(P2, f64)> {
    // returns (direction, penalty in mm)
    match strategy {
        Strategy::Shortest => vec![(normal, 0.0)],
        Strategy::Angle => {
            let a = angle_deg.to_radians();
            let d = [a.cos(), a.sin()];
            let mut v = vec![];
            for s in [1.0, -1.0] {
                let dd = [d[0] * s, d[1] * s];
                if dot(dd, normal) > 0.2 {
                    // penalty grows with deviation from the requested angle (here exact)
                    v.push((dd, 0.0));
                }
            }
            v
        }
        Strategy::Axis => {
            let mut v = vec![];
            for d in [[1.0, 0.0], [-1.0, 0.0], [0.0, 1.0], [0.0, -1.0]] {
                if dot(d, normal) > 0.35 {
                    v.push((d, 0.0));
                }
            }
            v
        }
        Strategy::Radial => {
            let d = norm([p[0] - centroid[0], p[1] - centroid[1]]);
            if dot(d, normal) > 0.3 {
                vec![(d, 0.0)]
            } else {
                vec![]
            }
        }
    }
}

fn candidates(m: &Region, infos: &[CompInfo], cfg: &Bridges, only_islands: &[usize]) -> Vec<Cand> {
    let segs = all_segs(m);
    let mut out = Vec::new();
    for &ci in only_islands {
        let info = &infos[ci];
        let spacing = (info.perimeter / 220.0).max(0.5);
        for c in &m[ci] {
            let start = out.len();
            let n = c.len();
            let mut carry = 0.0;
            for i in 0..n {
                let (a, b) = (c[i], c[(i + 1) % n]);
                let l = dist(a, b);
                if l < 1e-9 {
                    continue;
                }
                let dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
                // open space is on the right of the travel direction
                let normal = [dir[1], -dir[0]];
                let mut t = if carry > 0.0 { carry } else { spacing * 0.5 };
                while t < l {
                    let p = [a[0] + dir[0] * t, a[1] + dir[1] * t];
                    for (d, pen) in directions(&cfg.strategy, cfg.angle, normal, p, info.centroid) {
                        let mut best: Option<(f64, usize)> = None;
                        for s in &segs {
                            if let Some(h) = ray_seg(p, d, s) {
                                if best.map_or(true, |b| h < b.0) {
                                    best = Some((h, s.comp));
                                }
                            }
                        }
                        if let Some((h, hc)) = best {
                            if hc != ci && h <= cfg.max_length && h >= 0.2 {
                                let q = [p[0] + d[0] * h, p[1] + d[1] * h];
                                // slightly prefer perpendicular-to-surface hits
                                let skew = 1.0 - dot(d, normal).abs();
                                // classic stencil look: near-ties go to horizontal / vertical bridges
                                let axis = match cfg.strategy {
                                    Strategy::Shortest | Strategy::Radial => AXIS_BIAS * h * axis_dev(d),
                                    _ => 0.0,
                                };
                                out.push(Cand { from: ci, to: hc, p, q, len: h, score: h * (1.0 + 0.5 * skew) + pen + axis });
                            }
                        }
                    }
                    t += spacing;
                }
                carry = t - l;
            }
            center_runs(&mut out[start..], spacing);
        }
    }
    out
}

/// Weight of the horizontal / vertical preference (fraction of the bridge length at 45 deg).
const AXIS_BIAS: f64 = 0.06;

/// 0 when `d` is axis-aligned, 1 when it is diagonal.
fn axis_dev(d: P2) -> f64 {
    let a = d[1].atan2(d[0]).abs() % std::f64::consts::FRAC_PI_2;
    let dev = a.min(std::f64::consts::FRAC_PI_2 - a);
    dev / std::f64::consts::FRAC_PI_4
}

/// Candidates along a flat stretch of boundary all have (nearly) the same length, so the sort
/// would pick whichever sample came first, usually a corner. Penalise samples by their distance
/// from the middle of the stretch so near-ties resolve towards the centre. The penalty stays
/// within the length tolerance, so a genuinely shorter bridge still wins.
fn center_runs(cs: &mut [Cand], spacing: f64) {
    let n = cs.len();
    if n < 3 {
        return;
    }
    let tol = |len: f64| (0.03 * len).max(0.3);
    let dir = |c: &Cand| norm([c.q[0] - c.p[0], c.q[1] - c.p[1]]);
    // does sample k continue the run of its predecessor (circularly)?
    let linked = |k: usize| {
        let (a, b) = (&cs[(k + n - 1) % n], &cs[k]);
        a.from == b.from
            && a.to == b.to
            && dist(a.p, b.p) <= spacing * 2.5
            && (a.len - b.len).abs() <= tol(b.len)
            && dot(dir(a), dir(b)) > 0.99
    };
    let breaks: Vec<bool> = (0..n).map(|k| !linked(k)).collect();
    let Some(first) = breaks.iter().position(|&b| b) else {
        return; // one closed loop of equal lengths (e.g. concentric rings): no centre to find
    };
    let mut pen = vec![0.0; n];
    let mut k = 0;
    while k < n {
        let begin = (first + k) % n;
        let mut len = 1;
        while k + len < n && !breaks[(first + k + len) % n] {
            len += 1;
        }
        if len >= 3 {
            let mid = (len - 1) as f64 / 2.0;
            let t = tol(cs[begin].len);
            for j in 0..len {
                pen[(begin + j) % n] = 0.5 * t * ((j as f64 - mid).abs() / mid);
            }
        }
        k += len;
    }
    for (c, p) in cs.iter_mut().zip(pen) {
        c.score += p;
    }
}

fn angle_of(c: P2, p: P2) -> f64 {
    (p[1] - c[1]).atan2(p[0] - c[0])
}

fn ang_diff(a: f64, b: f64) -> f64 {
    let d = (a - b).abs() % std::f64::consts::TAU;
    d.min(std::f64::consts::TAU - d)
}

/// Bridges on one island may leave at most this much of the circle empty before a balancing
/// bridge is added (225 deg: all bridges within a 135 deg arc count as lopsided).
pub const MAX_GAP: f64 = 225.0 * std::f64::consts::PI / 180.0;
/// How strongly redundancy picks favour the side opposite the existing bridges.
const BALANCE_WEIGHT: f64 = 0.15;

/// Largest empty arc between bridge attachment points around `centroid`: (size, middle angle).
pub fn largest_gap(centroid: P2, pts: &[P2]) -> (f64, f64) {
    if pts.is_empty() {
        return (std::f64::consts::TAU, 0.0);
    }
    let mut a: Vec<f64> = pts.iter().map(|p| angle_of(centroid, *p)).collect();
    a.sort_by(|x, y| x.partial_cmp(y).unwrap());
    let mut best = (0.0, 0.0);
    for k in 0..a.len() {
        let from = a[k];
        let to = if k + 1 < a.len() { a[k + 1] } else { a[0] + std::f64::consts::TAU };
        let g = to - from;
        let g = if a.len() == 1 { std::f64::consts::TAU } else { g };
        if g > best.0 {
            best = (g, from + g / 2.0);
        }
    }
    best
}

pub struct Plan {
    pub bridges: Vec<Bridge>,
    /// Islands that no candidate could connect.
    pub unreachable: Vec<usize>,
}

/// Choose bridges for material region `m`. `root` is the anchor component.
pub fn plan(m: &Region, infos: &[CompInfo], root: usize, cfg: &Bridges) -> Plan {
    let n = m.len();
    let mut dsu = Dsu((0..n).collect());
    let mut chosen: Vec<Bridge> = Vec::new();
    let mut ends: Vec<(usize, P2, usize, P2)> = Vec::new(); // (compA, pA, compB, pB)

    // Manual bridges first: they count as connections.
    for mb in &cfg.manual {
        let w = mb.width.unwrap_or(cfg.width);
        let kind = mb.kind.clone().unwrap_or(cfg.kind.clone());
        let (pa, pb, ca, cb) = snap_manual(m, infos, mb.a, mb.b);
        chosen.push(Bridge { a: pa, b: pb, width: w, kind, manual: true, manual_id: Some(mb.id.clone()) });
        if let (Some(ca), Some(cb)) = (ca, cb) {
            dsu.union(ca, cb);
            ends.push((ca, pa, cb, pb));
        }
    }
    let islands: Vec<usize> = (0..n).filter(|&i| i != root).collect();
    if !cfg.enabled {
        // Only manual bridges: report islands that are still disconnected from the root.
        let rr = dsu.find(root);
        let unreachable = islands.iter().copied().filter(|&i| dsu.find(i) != rr).collect();
        return Plan { bridges: chosen, unreachable };
    }

    let mut cands = candidates(m, infos, cfg, &islands);
    let sup = &cfg.suppressed;
    cands.retain(|c| !sup.iter().any(|s| dist(*s, c.p) < cfg.width * 2.0 || dist(*s, c.q) < cfg.width * 2.0));
    cands.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());

    let mk = |c: &Cand| Bridge { a: c.p, b: c.q, width: cfg.width, kind: cfg.kind.clone(), manual: false, manual_id: None };

    // 1. Kruskal: connect everything to the root's group.
    let mut used = vec![false; cands.len()];
    for (k, c) in cands.iter().enumerate() {
        if dsu.find(c.from) != dsu.find(c.to) {
            dsu.union(c.from, c.to);
            used[k] = true;
            chosen.push(mk(c));
            ends.push((c.from, c.p, c.to, c.q));
        }
    }
    let rr = dsu.find(root);
    let unreachable: Vec<usize> = islands.iter().copied().filter(|&i| dsu.find(i) != rr).collect();

    // 2. Redundancy: each island gets >= min_per_island bridges, spread around it. If those all
    //    sit on one side (largest empty arc > MAX_GAP) one more balancing bridge is added.
    let want = cfg.min_per_island as usize;
    if want > 1 {
        for &i in &islands {
            let centroid = infos[i].centroid;
            let touching = |ends: &Vec<(usize, P2, usize, P2)>| -> Vec<P2> {
                ends.iter()
                    .filter_map(|e| if e.0 == i { Some(e.1) } else if e.2 == i { Some(e.3) } else { None })
                    .collect()
            };
            let mut pts = touching(&ends);
            let mut min_ang = std::f64::consts::TAU / (want as f64 + 1.0);
            let mut balance_left = 1;
            // scale for the balance term: the island's best candidate
            let scale = cands.iter().find(|c| c.from == i).map_or(1.0, |c| c.score.max(0.5));
            loop {
                let need = pts.len() < want;
                let (gap, gap_mid) = largest_gap(centroid, &pts);
                let balance = !need && balance_left > 0 && gap > MAX_GAP;
                if !need && !balance {
                    break;
                }
                let mut best: Option<(usize, f64)> = None;
                for (k, c) in cands.iter().enumerate() {
                    if used[k] || c.from != i || dist(c.p, c.q) < 0.2 {
                        continue;
                    }
                    let a = angle_of(centroid, c.p);
                    let ok = pts.iter().all(|p| ang_diff(angle_of(centroid, *p), a) >= min_ang)
                        && pts.iter().all(|p| dist(*p, c.p) > cfg.width * 3.0);
                    // a balancing bridge must land well inside the empty arc
                    if !ok || (balance && ang_diff(a, gap_mid) > gap / 2.0 - min_ang / 2.0) {
                        continue;
                    }
                    // prefer the bridge that sits opposite the existing ones
                    let toward_gap = if pts.is_empty() { 0.0 } else { ang_diff(a, gap_mid) / std::f64::consts::PI };
                    let score = c.score + BALANCE_WEIGHT * scale * toward_gap;
                    if best.map_or(true, |b| score < b.1) {
                        best = Some((k, score));
                    }
                }
                match best {
                    Some((k, _)) => {
                        used[k] = true;
                        let c = &cands[k];
                        chosen.push(mk(c));
                        ends.push((c.from, c.p, c.to, c.q));
                        pts.push(c.p);
                        if !need {
                            balance_left -= 1;
                        }
                    }
                    None => {
                        if !need || min_ang < 0.1 {
                            break;
                        }
                        min_ang *= 0.5;
                    }
                }
            }
        }
    }
    Plan { bridges: chosen, unreachable }
}

/// Rectangle region for a bridge; ends are extended by `ext` into the neighbouring material.
pub fn bridge_region(b: &Bridge, ext: f64) -> Region {
    let d = norm([b.b[0] - b.a[0], b.b[1] - b.a[1]]);
    if d == [0.0, 0.0] {
        return vec![];
    }
    let n = [-d[1], d[0]];
    let hw = b.width / 2.0;
    let a = [b.a[0] - d[0] * ext, b.a[1] - d[1] * ext];
    let c = [b.b[0] + d[0] * ext, b.b[1] + d[1] * ext];
    vec![vec![vec![
        [a[0] - n[0] * hw, a[1] - n[1] * hw],
        [c[0] - n[0] * hw, c[1] - n[1] * hw],
        [c[0] + n[0] * hw, c[1] + n[1] * hw],
        [a[0] + n[0] * hw, a[1] + n[1] * hw],
    ]]]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geom::*;

    #[test]
    fn island_in_a_slab_gets_two_bridges_and_is_anchored() {
        // slab with a ring-shaped hole: the disc in the middle is an island
        let slab = rect(0., 0., 100., 60.);
        let ring_open = difference(&circle(50., 30., 20.), &circle(50., 30., 10.));
        let m = difference(&slab, &ring_open);
        assert_eq!(m.len(), 2);
        let infos: Vec<CompInfo> = m.iter().map(comp_info).collect();
        let root = root_index(&infos);
        let cfg = Bridges::default();
        let p = plan(&m, &infos, root, &cfg);
        assert!(p.unreachable.is_empty());
        assert!(p.bridges.len() >= 2, "got {}", p.bridges.len());
        // union with bridges must be a single connected shape
        let mut u = m.clone();
        for b in &p.bridges {
            u = union(&u, &bridge_region(b, 0.5));
        }
        assert_eq!(u.len(), 1);
    }

    #[test]
    fn nested_islands_chain_to_root() {
        let slab = rect(0., 0., 120., 80.);
        let open = union(
            &difference(&circle(60., 40., 35.), &circle(60., 40., 25.)),
            &difference(&circle(60., 40., 15.), &circle(60., 40., 6.)),
        );
        let m = difference(&slab, &open);
        assert_eq!(m.len(), 3);
        let infos: Vec<CompInfo> = m.iter().map(comp_info).collect();
        let p = plan(&m, &infos, root_index(&infos), &Bridges::default());
        assert!(p.unreachable.is_empty());
        let mut u = m.clone();
        for b in &p.bridges {
            u = union(&u, &bridge_region(b, 0.5));
        }
        assert_eq!(u.len(), 1);
    }

    #[test]
    fn disabled_auto_bridges_still_report_unanchored_islands() {
        let slab = rect(0., 0., 100., 60.);
        let open = difference(&circle(50., 30., 20.), &circle(50., 30., 10.));
        let m = difference(&slab, &open);
        let infos: Vec<CompInfo> = m.iter().map(comp_info).collect();
        let cfg = Bridges { enabled: false, ..Bridges::default() };
        let p = plan(&m, &infos, root_index(&infos), &cfg);
        assert_eq!(p.unreachable.len(), 1);
    }

    #[test]
    fn manual_bridge_snaps_to_material_and_anchors() {
        let slab = rect(0., 0., 100., 60.);
        let open = difference(&circle(50., 30., 20.), &circle(50., 30., 10.));
        let m = difference(&slab, &open);
        let infos: Vec<CompInfo> = m.iter().map(comp_info).collect();
        let root = root_index(&infos);
        // endpoints are dropped in the open ring, not on material
        let cfg = Bridges {
            enabled: false,
            manual: vec![crate::doc::ManualBridge { id: "m".into(), a: [50.0, 42.0], b: [50.0, 48.0], width: Some(2.0), kind: None }],
            ..Bridges::default()
        };
        let p = plan(&m, &infos, root, &cfg);
        assert_eq!(p.bridges.len(), 1);
        let b = &p.bridges[0];
        // snapped to the island edge (y = 40) and the slab-side ring edge (y = 50)
        assert!((b.a[1] - 40.0).abs() < 0.2 && (b.b[1] - 50.0).abs() < 0.2, "{:?}", (b.a, b.b));
        let u = union(&m, &bridge_region(b, 0.5));
        assert_eq!(u.len(), 1);
    }

    fn islands_of(m: &Region) -> (Vec<CompInfo>, usize) {
        let infos: Vec<CompInfo> = m.iter().map(comp_info).collect();
        let root = root_index(&infos);
        (infos, root)
    }

    fn connected(m: &Region, p: &Plan) -> bool {
        let mut u = m.clone();
        for b in &p.bridges {
            u = union(&u, &bridge_region(b, 0.5));
        }
        u.len() == 1
    }

    /// Is `e` (within a hair) on a contour of `s`?
    fn on_boundary(s: &Shape, e: P2) -> bool {
        s.iter().any(|c| {
            (0..c.len()).any(|k| {
                let (a, b) = (c[k], c[(k + 1) % c.len()]);
                let l = dist(a, b).max(1e-9);
                let t = (((e[0] - a[0]) * (b[0] - a[0]) + (e[1] - a[1]) * (b[1] - a[1])) / (l * l)).clamp(0.0, 1.0);
                dist(e, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]) < 0.05
            })
        })
    }

    #[test]
    fn bridge_on_a_flat_edge_is_centred_not_in_a_corner() {
        // a wide island floating above the slab's bottom edge: every downward ray is the same length
        let slab = rect(0., 0., 100., 60.);
        let open = difference(&rect(20., 15., 80., 45.), &rect(30., 25., 70., 35.));
        let m = difference(&slab, &open);
        let (infos, root) = islands_of(&m);
        let cfg = Bridges { min_per_island: 2, ..Bridges::default() };
        let p = plan(&m, &infos, root, &cfg);
        assert!(p.unreachable.is_empty());
        assert!(connected(&m, &p));
        for b in p.bridges.iter().filter(|b| (b.a[0] - b.b[0]).abs() < 1e-6) {
            let x = b.a[0];
            assert!((x - 50.0).abs() < 8.0, "vertical bridge hugging a corner at x = {x}");
        }
    }

    #[test]
    fn island_bridges_leave_on_opposite_sides() {
        let slab = rect(0., 0., 100., 60.);
        let open = difference(&rect(20., 10., 80., 50.), &rect(35., 20., 65., 40.));
        let m = difference(&slab, &open);
        let (infos, root) = islands_of(&m);
        let p = plan(&m, &infos, root, &Bridges::default());
        assert!(connected(&m, &p));
        let isl = (0..m.len()).find(|&i| i != root).unwrap();
        let c = infos[isl].centroid;
        let angs: Vec<f64> = p
            .bridges
            .iter()
            .map(|b| if dist(b.a, c) < dist(b.b, c) { b.a } else { b.b })
            .map(|e| angle_of(c, e))
            .collect();
        assert!(angs.len() >= 2);
        let spread = angs.iter().flat_map(|a| angs.iter().map(move |b| ang_diff(*a, *b))).fold(0.0, f64::max);
        assert!(spread >= 150f64.to_radians(), "bridges only {:.0} deg apart", spread.to_degrees());
    }

    #[test]
    fn stacked_islands_are_not_all_bridged_on_one_side() {
        // two counters, one above the other, inside a letter-like block (think "B")
        let slab = rect(0., 0., 100., 100.);
        let open = union(&rect(30., 55., 70., 80.), &rect(30., 20., 70., 45.));
        let block = difference(&rect(10., 10., 90., 90.), &open);
        let open_all = difference(&rect(5., 5., 95., 95.), &block);
        let m = difference(&slab, &open_all);
        let (infos, root) = islands_of(&m);
        let p = plan(&m, &infos, root, &Bridges::default());
        assert!(p.unreachable.is_empty());
        assert!(connected(&m, &p));
        for i in (0..m.len()).filter(|&i| i != root) {
            let c = infos[i].centroid;
            let pts: Vec<P2> = p
                .bridges
                .iter()
                .flat_map(|b| [b.a, b.b])
                .filter(|e| on_boundary(&m[i], *e))
                .collect();
            let (gap, _) = largest_gap(c, &pts);
            assert!(gap <= MAX_GAP + 1e-6, "island {i}: {:.0} deg empty arc", gap.to_degrees());
        }
    }
}
