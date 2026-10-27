//! Turns a `TextObj` into a `Region` (mm, y-up) centred on its bounding box.

use crate::doc::{Align, Arc, Obj, TextObj};
use crate::font::{self, Variation};
use crate::geom::{self, Contour, Region};

pub fn text_region(font_data: &[u8], t: &TextObj) -> Result<Region, String> {
    let vars: Vec<Variation> = t.variations.iter().map(|a| Variation { tag: a.tag.clone(), value: a.value }).collect();
    let face = font::parse(font_data, &vars)?;
    let size = t.size.max(0.5);
    let pitch = size * t.leading.max(0.2);

    let lines: Vec<font::ShapedLine> = t
        .text
        .split('\n')
        .map(|l| font::shape_line(&face, l, size, t.tracking, t.kerning))
        .collect();
    let max_w = lines.iter().map(|l| l.width).fold(0.0, f64::max);

    let mut contours: Vec<Contour> = Vec::new();
    for (k, line) in lines.iter().enumerate() {
        let x_off = match t.align {
            Align::Left => 0.0,
            Align::Center => (max_w - line.width) / 2.0,
            Align::Right => max_w - line.width,
        };
        let base_y = -(k as f64) * pitch;
        for g in &line.glyphs {
            for c in &g.contours {
                let pts: Contour = match &t.arc {
                    None => c.iter().map(|p| [p[0] + x_off, p[1] + base_y]).collect(),
                    Some(arc) => c
                        .iter()
                        .map(|p| arc_map(arc, p[0] + x_off, p[1], g.center_x + x_off, max_w, k as f64 * pitch))
                        .collect(),
                };
                contours.push(pts);
            }
        }
    }
    let mut region = geom::from_contours_nonzero(contours);
    if t.weight != 0.0 {
        region = geom::offset(&region, t.weight);
    }
    // centre on bbox
    if let Some(b) = geom::bounds(&region) {
        let (cx, cy) = ((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0);
        region = geom::transform(&region, |p| [p[0] - cx, p[1] - cy]);
    }
    Ok(region)
}

/// Wrap glyph point (x along the line, y above the baseline) onto a circle.
fn arc_map(arc: &Arc, x: f64, y: f64, glyph_cx: f64, line_w: f64, line_drop: f64) -> [f64; 2] {
    let r_base = arc.radius.max(1.0);
    let mid = line_w / 2.0;
    // arc length from the text centre to this glyph's centre
    let s = glyph_cx - mid;
    let centre = arc.center_angle.to_radians();
    let dx = x - glyph_cx;
    if !arc.inside {
        // reads clockwise along the top; later lines move towards the centre
        let r = (r_base - line_drop).max(1.0);
        let phi = centre - s / r;
        let (c, sn) = (phi.cos(), phi.sin());
        let rad = r + y;
        [rad * c + dx * sn, rad * sn - dx * c]
    } else {
        // reads anticlockwise along the bottom with glyph tops pointing at the centre
        let r = r_base + line_drop;
        let phi = centre + s / r;
        let (c, sn) = (phi.cos(), phi.sin());
        let rad = r - y;
        [rad * c - dx * sn, rad * sn + dx * c]
    }
}

/// Apply object transform (rotation about its centre, scale, translation).
pub fn place(region: &Region, o: &Obj) -> Region {
    let (sn, cs) = o.rotation.to_radians().sin_cos();
    let s = o.scale;
    geom::transform(region, |p| {
        let (x, y) = (p[0] * s, p[1] * s);
        [x * cs - y * sn + o.x, x * sn + y * cs + o.y]
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::TextObj;

    fn font() -> Option<Vec<u8>> {
        std::fs::read("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf").ok()
    }

    #[test]
    fn multiline_and_arc_work() {
        let Some(f) = font() else { return };
        let t = TextObj { text: "AB\nCD".into(), size: 30.0, ..Default::default() };
        let r = text_region(&f, &t).unwrap();
        let b = geom::bounds(&r).unwrap();
        assert!((b[0] + b[2]).abs() < 1e-6, "centred");
        assert!(b[3] - b[1] > 45.0, "two lines tall");
        let arc = TextObj { text: "CIRCLE".into(), size: 20.0, arc: Some(Arc::default()), ..Default::default() };
        let r2 = text_region(&f, &arc).unwrap();
        assert!(geom::area(&r2) > 100.0);
    }
}
