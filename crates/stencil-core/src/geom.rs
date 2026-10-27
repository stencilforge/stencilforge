//! 2D region primitives. All coordinates are millimetres (f64).
//! A `Region` is a list of shapes; a shape is an outer contour (CCW) followed by holes (CW).

use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use i_overlay::mesh::float::outline::offset::OutlineOffset;
use i_overlay::mesh::float::style::{LineJoin, OutlineStyle};

pub type P2 = [f64; 2];
pub type Contour = Vec<P2>;
pub type Shape = Vec<Contour>;
pub type Region = Vec<Shape>;

const EMPTY: Region = Vec::new();

/// Build a clean region from raw contours using the non-zero fill rule (font outlines).
pub fn from_contours_nonzero(contours: Vec<Contour>) -> Region {
    if contours.is_empty() {
        return Vec::new();
    }
    contours.overlay(&EMPTY_CONTOURS, OverlayRule::Subject, FillRule::NonZero)
}
const EMPTY_CONTOURS: Vec<Contour> = Vec::new();

fn op(a: &Region, b: &Region, rule: OverlayRule) -> Region {
    if a.is_empty() && matches!(rule, OverlayRule::Difference | OverlayRule::Intersect) {
        return Vec::new();
    }
    if b.is_empty() {
        return match rule {
            OverlayRule::Intersect => Vec::new(),
            _ => a.clone(),
        };
    }
    a.overlay(b, rule, FillRule::NonZero)
}

pub fn union(a: &Region, b: &Region) -> Region {
    if a.is_empty() {
        return b.clone();
    }
    op(a, b, OverlayRule::Union)
}
pub fn difference(a: &Region, b: &Region) -> Region {
    op(a, b, OverlayRule::Difference)
}
pub fn intersect(a: &Region, b: &Region) -> Region {
    op(a, b, OverlayRule::Intersect)
}

pub fn union_all(regions: impl IntoIterator<Item = Region>) -> Region {
    let mut acc: Region = EMPTY;
    for r in regions {
        acc = union(&acc, &r);
    }
    acc
}

/// Offset a region by `d` mm (positive grows, negative shrinks). Round joins.
pub fn offset(r: &Region, d: f64) -> Region {
    if r.is_empty() || d == 0.0 {
        return r.clone();
    }
    // Round joins: pick the arc step so the chord error stays under ~3µm.
    let rad = d.abs();
    let step = (2.0 * (1.0 - 0.003 / rad).clamp(-1.0, 1.0).acos()).clamp(0.12, 1.0);
    let style = OutlineStyle::new(d).line_join(LineJoin::Round(step));
    r.outline(&style)
}

/// Morphological opening: erode then dilate. Leaves only parts at least `2*r` thick.
pub fn open(r: &Region, rad: f64) -> Region {
    offset(&offset(r, -rad), rad)
}

/// Opening that also guarantees a gap of at least `gap` at pinch points: erodes by `rad + gap`
/// and dilates by `rad`, so the result is `gap` smaller on every side.
pub fn open_gap(r: &Region, rad: f64, gap: f64) -> Region {
    offset(&offset(r, -(rad + gap)), rad)
}

pub fn contour_area(c: &Contour) -> f64 {
    let n = c.len();
    let mut s = 0.0;
    for i in 0..n {
        let (a, b) = (c[i], c[(i + 1) % n]);
        s += a[0] * b[1] - b[0] * a[1];
    }
    s * 0.5
}

pub fn area(r: &Region) -> f64 {
    r.iter()
        .map(|s| s.iter().map(contour_area).sum::<f64>())
        .sum()
}

/// (min_x, min_y, max_x, max_y); None if empty.
pub fn bounds(r: &Region) -> Option<[f64; 4]> {
    let mut b = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
    let mut any = false;
    for s in r {
        for c in s {
            for p in c {
                any = true;
                b[0] = b[0].min(p[0]);
                b[1] = b[1].min(p[1]);
                b[2] = b[2].max(p[0]);
                b[3] = b[3].max(p[1]);
            }
        }
    }
    any.then_some(b)
}

pub fn transform(r: &Region, f: impl Fn(P2) -> P2) -> Region {
    r.iter()
        .map(|s| s.iter().map(|c| c.iter().map(|&p| f(p)).collect()).collect())
        .collect()
}

pub fn rect(x0: f64, y0: f64, x1: f64, y1: f64) -> Region {
    vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
}

/// Rounded rectangle with independent chamfer/round corner handling via `r` (radius) and `chamfer` flag.
pub fn rounded_rect(x0: f64, y0: f64, x1: f64, y1: f64, r: f64, chamfer: bool) -> Region {
    let r = r.min((x1 - x0) / 2.0).min((y1 - y0) / 2.0).max(0.0);
    if r <= 1e-6 {
        return rect(x0, y0, x1, y1);
    }
    let mut c: Contour = Vec::new();
    // corners in CCW order, each with arc start angle
    let corners = [
        (x1 - r, y0 + r, -90.0_f64),
        (x1 - r, y1 - r, 0.0),
        (x0 + r, y1 - r, 90.0),
        (x0 + r, y0 + r, 180.0),
    ];
    let steps = if chamfer { 1 } else { 12 };
    for (cx, cy, a0) in corners {
        for i in 0..=steps {
            let a = (a0 + 90.0 * i as f64 / steps as f64).to_radians();
            c.push([cx + r * a.cos(), cy + r * a.sin()]);
        }
    }
    vec![vec![c]]
}

pub fn ellipse(cx: f64, cy: f64, rx: f64, ry: f64) -> Region {
    let n = ((rx.max(ry) * 4.0) as usize).clamp(48, 360);
    let c: Contour = (0..n)
        .map(|i| {
            let a = std::f64::consts::TAU * i as f64 / n as f64;
            [cx + rx * a.cos(), cy + ry * a.sin()]
        })
        .collect();
    vec![vec![c]]
}

pub fn circle(cx: f64, cy: f64, r: f64) -> Region {
    ellipse(cx, cy, r, r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_has_hole() {
        let ring = difference(&rect(0., 0., 10., 10.), &rect(3., 3., 7., 7.));
        assert_eq!(ring.len(), 1);
        assert_eq!(ring[0].len(), 2);
        assert!((area(&ring) - 84.0).abs() < 1e-9);
    }

    #[test]
    fn offset_grows_and_shrinks() {
        let sq = rect(0., 0., 10., 10.);
        assert!(area(&offset(&sq, 1.0)) > 130.0);
        let s = area(&offset(&sq, -1.0));
        assert!((s - 64.0).abs() < 0.5, "got {s}");
    }

    #[test]
    fn opening_removes_thin_parts() {
        // 10x10 block with a 0.2mm-wide whisker
        let r = union(&rect(0., 0., 10., 10.), &rect(10., 4.9, 20., 5.1));
        let o = open(&r, 0.5);
        let b = bounds(&o).unwrap();
        assert!(b[2] < 11.0, "whisker should be gone, max_x={}", b[2]);
    }
}
