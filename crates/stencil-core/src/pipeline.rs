//! Document -> regions -> bridges -> band stack -> mesh.

use crate::bridges::{self, Bridge};
use crate::doc::*;
use crate::geom::{self, Region};
use crate::layout;
use crate::mesh::{self, Band, Mesh};
use serde::Serialize;
use std::collections::HashMap;
use tsify_next::Tsify;

pub type Fonts = HashMap<String, Vec<u8>>;

const MIN_ISLAND_AREA: f64 = 0.25; // mm², smaller bits are dropped
const PINCH_EPS: f64 = 0.02; // mm, radius of the pinch-removing opening
const PINCH_GAP: f64 = 0.01; // mm, minimum gap left where shapes used to touch

pub struct Computed {
    pub bounds: [f64; 4],
    pub slab: Region,
    pub material: Region,
    pub open: Region,
    pub bridges: Vec<Bridge>,
    pub classic: Region,
    pub floating: Region,
    pub unreachable: Vec<usize>,
    pub island_ids: Vec<usize>,
    pub dropped_bits: usize,
    pub thickness: f64,
    pub float_h: f64,
}

fn mirror_x(r: &Region) -> Region {
    let contours = r.iter().flatten().map(|c| c.iter().map(|p| [-p[0], p[1]]).collect()).collect();
    geom::from_contours_nonzero(contours)
}

fn pick_font<'a>(fonts: &'a Fonts, id: &str) -> Option<&'a Vec<u8>> {
    fonts.get(id).or_else(|| fonts.get("default")).or_else(|| fonts.values().next())
}

pub fn content_region(doc: &Doc, fonts: &Fonts) -> Result<Region, String> {
    let mut parts = Vec::new();
    for o in doc.objects.iter().filter(|o| o.visible) {
        match &o.content {
            Content::Text(t) => {
                if t.text.trim().is_empty() {
                    continue;
                }
                let data = pick_font(fonts, &t.font).ok_or("no font loaded")?;
                let r = layout::text_region(data, t)?;
                parts.push(layout::place(&r, o));
            }
        }
    }
    Ok(geom::union_all(parts))
}

fn remove_holes(r: &Region) -> Region {
    r.iter().map(|s| vec![s[0].clone()]).collect()
}

fn slab_region(doc: &Doc, content: &Region) -> Region {
    let s = &doc.slab;
    let cb = geom::bounds(content).unwrap_or([-50.0, -25.0, 50.0, 25.0]);
    let m = &s.margins;
    let (mut x0, mut y0, mut x1, mut y1) = if s.fit {
        (cb[0] - m.left, cb[1] - m.bottom, cb[2] + m.right, cb[3] + m.top)
    } else {
        (-s.width / 2.0, -s.height / 2.0, s.width / 2.0, s.height / 2.0)
    };
    let mut base = match s.shape {
        SlabShape::Rect => geom::rect(x0, y0, x1, y1),
        SlabShape::Rounded => geom::rounded_rect(x0, y0, x1, y1, s.radius, false),
        SlabShape::Chamfer => geom::rounded_rect(x0, y0, x1, y1, s.radius, true),
        SlabShape::Pill => geom::rounded_rect(x0, y0, x1, y1, (y1 - y0) / 2.0, false),
        SlabShape::Ellipse => {
            let (cx, cy) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0);
            let k = if s.fit { std::f64::consts::SQRT_2 } else { 1.0 };
            let (rx, ry) = ((x1 - x0) / 2.0 * k, (y1 - y0) / 2.0 * k);
            x0 = cx - rx;
            x1 = cx + rx;
            y0 = cy - ry;
            y1 = cy + ry;
            geom::ellipse(cx, cy, rx, ry)
        }
        SlabShape::Contour => {
            let g = m.left.max(m.right).max(m.top).max(m.bottom);
            let grown = geom::offset(content, g.max(1.0));
            remove_holes(&grown)
        }
    };
    if s.mount_holes {
        let b = geom::bounds(&base).unwrap_or([x0, y0, x1, y1]);
        let r = s.hole_diameter / 2.0;
        let i = s.hole_inset;
        let mut holes = vec![];
        for (hx, hy) in [(b[0] + i, b[1] + i), (b[2] - i, b[1] + i), (b[2] - i, b[3] - i), (b[0] + i, b[3] - i)] {
            holes.push(geom::circle(hx, hy, r));
        }
        base = geom::difference(&base, &geom::union_all(holes));
    }
    base
}

pub fn compute(doc: &Doc, fonts: &Fonts) -> Result<Computed, String> {
    let mut content = content_region(doc, fonts)?;
    if doc.mirror {
        content = mirror_x(&content);
    }
    let slab = slab_region(doc, &content);
    let sb = geom::bounds(&slab).unwrap_or([0.0, 0.0, 100.0, 50.0]);
    let slab_solid = if doc.slab.mount_holes { remove_holes(&slab) } else { slab.clone() };

    let (mut material, _) = match doc.mode {
        Mode::Negative => (geom::difference(&slab, &content), ()),
        Mode::Positive => {
            let clipped = geom::intersect(&content, &slab);
            let m = if doc.slab.frame > 0.0 {
                let ring = geom::difference(&slab, &geom::offset(&slab_solid, -doc.slab.frame));
                geom::union(&clipped, &ring)
            } else {
                clipped
            };
            (m, ())
        }
    };

    // Remove zero-width pinch points on both sides (they would make non-manifold edges):
    // a tiny opening of the material, then of the open space.
    material = clean_solid(&material, &slab);

    // drop specks that cannot be printed
    let before = material.len();
    material.retain(|s| geom::area(&vec![s.clone()]) >= MIN_ISLAND_AREA);
    let dropped_bits = before - material.len();

    let open = geom::difference(&slab, &material);

    // Geometry stays in document space so manual bridges remain attached to their letters while the
    // slab grows or shrinks; exports shift the slab corner to the origin.
    let bounds = sb;

    let infos: Vec<bridges::CompInfo> = material.iter().map(bridges::comp_info).collect();
    let root = if infos.is_empty() { 0 } else { bridges::root_index(&infos) };
    let plan = if material.is_empty() {
        bridges::Plan { bridges: vec![], unreachable: vec![] }
    } else {
        bridges::plan(&material, &infos, root, &doc.bridges)
    };

    let thickness = doc.thickness.max(0.4);
    let float_h = doc.bridges.float_height.clamp(0.2, thickness * 0.85);
    let mut classic = Vec::new();
    let mut floating = Vec::new();
    for b in &plan.bridges {
        let ext = (0.25 * b.width + 0.15).min(1.0);
        let r = bridges::bridge_region(b, ext);
        match b.kind {
            BridgeKind::Classic => classic.push(r),
            BridgeKind::Floating => floating.push(r),
        }
    }
    let classic = geom::intersect(&geom::union_all(classic), &slab);
    let floating = geom::intersect(&geom::union_all(floating), &slab);

    let island_ids: Vec<usize> = (0..material.len()).filter(|&i| i != root).collect();
    Ok(Computed {
        bounds,
        slab,
        material,
        open,
        bridges: plan.bridges,
        classic,
        floating,
        unreachable: plan.unreachable,
        island_ids,
        dropped_bits,
        thickness,
        float_h,
    })
}

/// Remove zero-width pinch points from a solid region. Every pinch has material and open space
/// alternating around it, so opening only the open side is enough. The open side is taken within a
/// domain larger than the slab, and the result is clipped back to the slab, so the slab outline
/// itself is never altered.
fn clean_solid(solid: &Region, slab: &Region) -> Region {
    let domain = geom::offset(slab, 1.0);
    let open = geom::difference(&domain, solid);
    let open = geom::open_gap(&open, PINCH_EPS, PINCH_GAP);
    geom::intersect(slab, &geom::difference(&domain, &open))
}

/// Stack of z-bands (mm) describing the 3D solid. z=0 is the wall-contact face, z=t the spray face.
/// Bands are consecutive, non-overlapping z-intervals; each region is pinch-cleaned so the mesh is manifold.
pub fn bands(doc: &Doc, c: &Computed) -> Vec<Band> {
    let t = c.thickness;
    let steps = if doc.edge.chamfer > 0.0 { doc.edge.steps.clamp(1, 12) as usize } else { 1 };
    let mut levels: Vec<f64> = (0..=steps).map(|k| t * k as f64 / steps as f64).collect();
    let has_float = !c.floating.is_empty();
    if has_float {
        levels.push(t - c.float_h);
    }
    levels.sort_by(|a, b| a.partial_cmp(b).unwrap());
    levels.dedup_by(|a, b| (*a - *b).abs() < 1e-6);

    let mut out: Vec<Band> = Vec::new();
    let mut cache: Vec<(i64, Region)> = Vec::new(); // reuse identical regions between neighbouring bands
    for w in levels.windows(2) {
        let (z0, z1) = (w[0], w[1]);
        let mid = (z0 + z1) / 2.0;
        let k = ((mid / t * steps as f64).floor() as usize).min(steps - 1);
        let floating_here = has_float && mid > t - c.float_h;
        let cut = if steps > 1 { doc.edge.chamfer * k as f64 / (steps - 1) as f64 } else { 0.0 };
        let key = (k as i64) * 2 + floating_here as i64;
        let region = if let Some((_, r)) = cache.iter().find(|(kk, _)| *kk == key) {
            r.clone()
        } else {
            let mut r = if steps == 1 {
                geom::union(&c.material, &c.classic)
            } else {
                let eroded = geom::difference(&c.material, &geom::offset(&c.open, cut));
                geom::union(&eroded, &c.classic)
            };
            if floating_here {
                r = geom::union(&r, &c.floating);
            }
            let r = clean_solid(&r, &c.slab);
            cache.push((key, r.clone()));
            r
        };
        out.push(Band { z0: mesh::mm(z0), z1: mesh::mm(z1), region: mesh::to_int(&region) });
    }
    out
}

pub fn build_mesh(doc: &Doc, c: &Computed) -> Mesh {
    mesh::build(&bands(doc, c))
}

// ---------------------------------------------------------------------------------------------
// 2D output for the UI

fn path(r: &Region) -> String {
    use std::fmt::Write;
    let mut s = String::new();
    for sh in r {
        for c in sh {
            for (i, p) in c.iter().enumerate() {
                let _ = write!(s, "{}{:.3} {:.3}", if i == 0 { "M" } else { "L" }, p[0], p[1]);
            }
            s.push('Z');
        }
    }
    s
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IslandOut {
    pub path: String,
    pub anchored: bool,
    pub area: f64,
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BridgeOut {
    pub a: [f64; 2],
    pub b: [f64; 2],
    pub width: f64,
    pub kind: BridgeKind,
    pub manual: bool,
    pub manual_id: Option<String>,
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    /// "error" | "warning" | "info"
    pub severity: String,
    pub code: String,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub islands: usize,
    pub bridges: usize,
    pub width: f64,
    pub height: f64,
    pub material_area: f64,
    pub volume_mm3: f64,
    pub grams: f64,
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Out2D {
    pub bounds: [f64; 4],
    pub slab: String,
    pub material: String,
    pub open: String,
    pub bridges_classic: String,
    pub bridges_floating: String,
    pub islands: Vec<IslandOut>,
    pub bridges: Vec<BridgeOut>,
    pub issues: Vec<Issue>,
    pub stats: Stats,
}

pub fn out2d(doc: &Doc, c: &Computed) -> Out2D {
    let mut issues = Vec::new();
    if c.material.is_empty() {
        issues.push(Issue { severity: "info".into(), code: "empty".into(), message: "Nothing to show yet. Add some text.".into(), path: None });
    }
    if !c.unreachable.is_empty() {
        let p = path(&c.unreachable.iter().map(|&i| c.material[i].clone()).collect::<Vec<_>>());
        issues.push(Issue {
            severity: "error".into(),
            code: "unanchored".into(),
            message: format!("{} island(s) are not connected. Enable bridges, widen the max length or add a manual bridge.", c.unreachable.len()),
            path: Some(p),
        });
    }
    if c.dropped_bits > 0 {
        issues.push(Issue {
            severity: "info".into(),
            code: "specks".into(),
            message: format!("{} tiny fragment(s) under {} mm² were dropped.", c.dropped_bits, MIN_ISLAND_AREA),
            path: None,
        });
    }
    let solid = geom::union(&c.material, &c.classic);
    if !solid.is_empty() {
        let thin_r = doc.print.min_wall / 2.0;
        let thick = geom::open(&solid, thin_r);
        let thin = geom::difference(&solid, &geom::offset(&thick, 0.005));
        let thin: Region = thin.into_iter().filter(|s| geom::area(&vec![s.clone()]) > 0.4).collect();
        if !thin.is_empty() {
            issues.push(Issue {
                severity: "warning".into(),
                code: "thin".into(),
                message: format!("Walls thinner than {:.2} mm may not print reliably.", doc.print.min_wall),
                path: Some(path(&thin)),
            });
        }
    }
    let islands = c
        .island_ids
        .iter()
        .map(|&i| IslandOut {
            path: path(&vec![c.material[i].clone()]),
            anchored: !c.unreachable.contains(&i),
            area: geom::area(&vec![c.material[i].clone()]),
        })
        .collect();
    let a_solid = geom::area(&solid);
    let a_float = geom::area(&geom::difference(&c.floating, &solid));
    let volume = a_solid * c.thickness + a_float * c.float_h;
    Out2D {
        bounds: c.bounds,
        slab: path(&c.slab),
        material: path(&c.material),
        open: path(&c.open),
        bridges_classic: path(&c.classic),
        bridges_floating: path(&c.floating),
        islands,
        bridges: c
            .bridges
            .iter()
            .map(|b| BridgeOut { a: b.a, b: b.b, width: b.width, kind: b.kind.clone(), manual: b.manual, manual_id: b.manual_id.clone() })
            .collect(),
        issues,
        stats: Stats {
            islands: c.island_ids.len(),
            bridges: c.bridges.len(),
            width: c.bounds[2] - c.bounds[0],
            height: c.bounds[3] - c.bounds[1],
            material_area: geom::area(&c.material),
            volume_mm3: volume,
            grams: volume / 1000.0 * doc.print.density,
        },
    }
}

// ---------------------------------------------------------------------------------------------
// Export

/// Binary STL. If `flip` the part is rotated 180° about X so the spray face sits on the bed
/// (floating bridges then print as the first layers, with no supports).
pub fn stl_bytes(m: &Mesh, bounds: [f64; 4], thickness: f64, flip: bool) -> Vec<u8> {
    let height = bounds[3] - bounds[1];
    let mut out = Vec::with_capacity(84 + m.tris.len() * 50);
    out.extend_from_slice(&[0u8; 80]);
    out.extend_from_slice(&(m.tris.len() as u32).to_le_bytes());
    let conv = |v: [i32; 3]| -> [f32; 3] {
        let (x, y, z) = (v[0] as f64 / mesh::UNIT - bounds[0], v[1] as f64 / mesh::UNIT - bounds[1], v[2] as f64 / mesh::UNIT);
        if flip {
            [x as f32, (height - y) as f32, (thickness - z) as f32]
        } else {
            [x as f32, y as f32, z as f32]
        }
    };
    for t in &m.tris {
        let p: Vec<[f32; 3]> = t.iter().map(|&i| conv(m.verts[i as usize])).collect();
        let u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
        let v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
        let mut n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
        if l > 0.0 {
            n = [n[0] / l, n[1] / l, n[2] / l];
        }
        for c in n {
            out.extend_from_slice(&c.to_le_bytes());
        }
        for q in &p {
            for c in q {
                out.extend_from_slice(&c.to_le_bytes());
            }
        }
        out.extend_from_slice(&[0u8, 0u8]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fonts() -> Option<Fonts> {
        let d = std::fs::read("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf").ok()?;
        let mut f = Fonts::new();
        f.insert("default".into(), d);
        Some(f)
    }

    fn doc(text: &str) -> Doc {
        let mut d = Doc::default();
        if let Content::Text(t) = &mut d.objects[0].content {
            t.text = text.into();
            t.size = 50.0;
        }
        d
    }

    #[test]
    fn stencil_text_is_anchored_and_watertight() {
        let Some(f) = fonts() else { return };
        for kind in [BridgeKind::Classic, BridgeKind::Floating] {
            let mut d = doc("OAB8");
            d.bridges.kind = kind;
            let c = compute(&d, &f).unwrap();
            assert!(c.island_ids.len() >= 5, "O, A, B(2), 8(2) counters -> got {}", c.island_ids.len());
            assert!(c.unreachable.is_empty());
            let m = build_mesh(&d, &c);
            assert_eq!(mesh::validate(&m), (0, 0));
            assert!(mesh::volume(&m) > 1000.0);
        }
    }

    #[test]
    fn strategies_and_modes_work() {
        let Some(f) = fonts() else { return };
        for strat in [Strategy::Shortest, Strategy::Angle, Strategy::Axis, Strategy::Radial] {
            for mode in [Mode::Negative, Mode::Positive] {
                let mut d = doc("O8A");
                d.bridges.strategy = strat.clone();
                d.mode = mode.clone();
                let c = compute(&d, &f).unwrap();
                assert!(c.unreachable.is_empty(), "{strat:?} {mode:?}");
                let m = build_mesh(&d, &c);
                assert_eq!(mesh::validate(&m), (0, 0), "{strat:?} {mode:?}");
            }
        }
    }

    #[test]
    fn chamfer_and_mirror_stay_watertight() {
        let Some(f) = fonts() else { return };
        let mut d = doc("B2");
        d.edge.chamfer = 0.8;
        d.mirror = true;
        d.bridges.kind = BridgeKind::Floating;
        let c = compute(&d, &f).unwrap();
        let m = build_mesh(&d, &c);
        assert_eq!(mesh::validate(&m), (0, 0));
    }
}

#[cfg(test)]
mod stress {
    use super::*;

    #[test]
    fn many_glyphs_fonts_and_settings_stay_watertight() {
        let paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        ];
        let texts = ["0123456789", "ABCDEFGHIJKLM", "NOPQRSTUVWXYZ", "abcdefghijklm", "nopqrstuvwxyz", "&@%#$?!ßÄÖÜ"];
        let mut failures = Vec::new();
        let mut runs = 0;
        for path in paths {
            let Ok(data) = std::fs::read(path) else { continue };
            let mut f = Fonts::new();
            f.insert("default".into(), data);
            for text in texts {
                for kind in [BridgeKind::Classic, BridgeKind::Floating] {
                    for strat in [Strategy::Shortest, Strategy::Axis, Strategy::Angle, Strategy::Radial] {
                        for mode in [Mode::Negative, Mode::Positive] {
                            let mut d = Doc::default();
                            d.mode = mode.clone();
                            d.bridges.kind = kind.clone();
                            d.bridges.strategy = strat.clone();
                            if let Content::Text(t) = &mut d.objects[0].content {
                                t.text = text.into();
                                t.size = 40.0;
                            }
                            runs += 1;
                            let c = match compute(&d, &f) {
                                Ok(c) => c,
                                Err(e) => {
                                    failures.push(format!("{path} {text} compute error {e}"));
                                    continue;
                                }
                            };
                            if !c.unreachable.is_empty() {
                                failures.push(format!("{path} {text} {kind:?} {strat:?} {mode:?}: {} unanchored", c.unreachable.len()));
                            }
                            let m = build_mesh(&d, &c);
                            let v = mesh::validate(&m);
                            if v != (0, 0) {
                                failures.push(format!("{path} {text} {kind:?} {strat:?} {mode:?}: mesh {v:?}"));
                            }
                        }
                    }
                }
            }
        }
        for f in failures.iter().take(25) {
            println!("FAIL {f}");
        }
        println!("{} runs, {} failures", runs, failures.len());
        assert!(failures.is_empty());
    }
}

#[cfg(test)]
mod bundled_fonts {
    use super::*;

    #[test]
    fn every_bundled_font_produces_watertight_stencils() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public/fonts");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        let ascii: String = ('!'..='~').collect();
        let (mut fonts_n, mut failures) = (0, Vec::new());
        for entry in rd.flatten() {
            let p = entry.path();
            if p.extension().map_or(true, |e| e != "ttf") {
                continue;
            }
            fonts_n += 1;
            let mut f = Fonts::new();
            f.insert("default".into(), std::fs::read(&p).unwrap());
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            for chunk in ascii.as_bytes().chunks(16) {
                let text = String::from_utf8_lossy(chunk).to_string();
                for kind in [BridgeKind::Classic, BridgeKind::Floating] {
                    let mut d = Doc::default();
                    d.bridges.kind = kind.clone();
                    if let Content::Text(t) = &mut d.objects[0].content {
                        t.text = text.clone();
                        t.size = 40.0;
                    }
                    match compute(&d, &f) {
                        Err(e) => failures.push(format!("{name} '{text}': {e}")),
                        Ok(c) => {
                            if !c.unreachable.is_empty() {
                                failures.push(format!("{name} '{text}' {kind:?}: {} unanchored", c.unreachable.len()));
                            }
                            let v = mesh::validate(&build_mesh(&d, &c));
                            if v != (0, 0) {
                                failures.push(format!("{name} '{text}' {kind:?}: mesh {v:?}"));
                            }
                        }
                    }
                }
            }
        }
        for f in failures.iter().take(30) {
            println!("FAIL {f}");
        }
        println!("{fonts_n} fonts, {} failures", failures.len());
        assert!(failures.is_empty());
    }
}

/// Regression tests for how evenly bridges are spread (hand-checked against the "BRIDGE" hero).
#[cfg(test)]
mod bridge_balance {
    use super::*;
    use crate::bridges::{comp_info, largest_gap, root_index, MAX_GAP};

    fn seg_dist(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let l2 = (dx * dx + dy * dy).max(1e-12);
        let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2).clamp(0.0, 1.0);
        ((p[0] - a[0] - t * dx).powi(2) + (p[1] - a[1] - t * dy).powi(2)).sqrt()
    }

    fn on_shape(s: &geom::Shape, p: [f64; 2]) -> bool {
        s.iter().any(|c| (0..c.len()).any(|k| seg_dist(p, c[k], c[(k + 1) % c.len()]) < 0.05))
    }

    #[test]
    fn bridges_are_spread_around_each_island_and_off_the_corners() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public/fonts/ArchivoBlack-Regular.ttf");
        let Ok(data) = std::fs::read(&path) else { return };
        let mut f = Fonts::new();
        f.insert("default".into(), data);
        for text in ["BRIDGE", "OAB8 42", "RDBOP"] {
            let mut d = Doc::default();
            if let Content::Text(t) = &mut d.objects[0].content {
                t.text = text.into();
                t.size = 60.0;
            }
            let c = compute(&d, &f).unwrap();
            let infos: Vec<_> = c.material.iter().map(comp_info).collect();
            let root = root_index(&infos);
            let w = d.bridges.width;
            for (i, info) in infos.iter().enumerate().filter(|(i, _)| *i != root) {
                // where each bridge leaves this island
                let ends: Vec<[f64; 2]> = c
                    .bridges
                    .iter()
                    .flat_map(|b| [b.a, b.b])
                    .filter(|e| on_shape(&c.material[i], *e))
                    .collect();
                let (gap, _) = largest_gap(info.centroid, &ends);
                assert!(gap <= MAX_GAP + 1e-6, "{text}: island {i} has a {:.0} deg empty arc", gap.to_degrees());
                // a vertical bridge on a wide island must not hug its left / right edge
                let (x0, x1) = (info.bbox[0], info.bbox[2]);
                if x1 - x0 > 6.0 * w {
                    for b in c.bridges.iter().filter(|b| (b.a[0] - b.b[0]).abs() < 1e-6 && on_shape(&c.material[i], b.a)) {
                        let x = b.a[0];
                        assert!(x - x0 >= w && x1 - x >= w, "{text}: island {i} bridge at x={x:.1} hugs its edge ({x0:.1}..{x1:.1})");
                    }
                }
            }
        }
    }
}
