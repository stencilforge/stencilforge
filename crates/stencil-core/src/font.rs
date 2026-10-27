//! Font loading, shaping (rustybuzz) and outline flattening (ttf-parser).
//! Output coordinates are millimetres, y-up, origin at the line's baseline start.

use crate::geom::{Contour, P2};
use rustybuzz::ttf_parser::{self, OutlineBuilder, Tag};
use rustybuzz::{Face, UnicodeBuffer};

pub const FLATTEN_TOL: f64 = 0.01;

pub struct Glyph {
    pub contours: Vec<Contour>,
    /// Pen x of the glyph origin along the line (mm).
    pub pen_x: f64,
    /// Horizontal centre of the advance box, used for arc placement.
    pub center_x: f64,
    pub advance: f64,
}

pub struct ShapedLine {
    pub glyphs: Vec<Glyph>,
    pub width: f64,
}

pub struct FontMetrics {
    pub ascent: f64,
    pub descent: f64,
    pub cap_height: f64,
    pub line_gap: f64,
}

pub struct Variation {
    pub tag: String,
    pub value: f32,
}

struct Flattener {
    out: Vec<Contour>,
    cur: Contour,
    last: P2,
    s: f64,
    ox: f64,
}

impl Flattener {
    fn pt(&self, x: f32, y: f32) -> P2 {
        [self.ox + x as f64 * self.s, y as f64 * self.s]
    }
}

impl OutlineBuilder for Flattener {
    fn move_to(&mut self, x: f32, y: f32) {
        self.close();
        self.last = self.pt(x, y);
        self.cur.push(self.last);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.last = self.pt(x, y);
        self.cur.push(self.last);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let (p0, p1, p2) = (self.last, self.pt(x1, y1), self.pt(x, y));
        let d = ((p0[0] - 2.0 * p1[0] + p2[0]).powi(2) + (p0[1] - 2.0 * p1[1] + p2[1]).powi(2)).sqrt();
        let n = ((d / (4.0 * FLATTEN_TOL)).sqrt().ceil() as usize).clamp(2, 64);
        for i in 1..=n {
            let t = i as f64 / n as f64;
            let u = 1.0 - t;
            self.cur.push([
                u * u * p0[0] + 2.0 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2.0 * u * t * p1[1] + t * t * p2[1],
            ]);
        }
        self.last = p2;
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let (p0, p1, p2, p3) = (self.last, self.pt(x1, y1), self.pt(x2, y2), self.pt(x, y));
        let m = |a: P2, b: P2, c: P2| ((a[0] - 2.0 * b[0] + c[0]).powi(2) + (a[1] - 2.0 * b[1] + c[1]).powi(2)).sqrt();
        let big = m(p0, p1, p2).max(m(p1, p2, p3));
        let n = ((0.75 * big / FLATTEN_TOL).sqrt().ceil() as usize).clamp(2, 64);
        for i in 1..=n {
            let t = i as f64 / n as f64;
            let u = 1.0 - t;
            let (a, b, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
            self.cur.push([
                a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
            ]);
        }
        self.last = p3;
    }
    fn close(&mut self) {
        if self.cur.len() >= 3 {
            let mut c = std::mem::take(&mut self.cur);
            if c.first() == c.last() {
                c.pop();
            }
            self.out.push(c);
        } else {
            self.cur.clear();
        }
    }
}

pub fn parse<'a>(data: &'a [u8], variations: &[Variation]) -> Result<Face<'a>, String> {
    let mut face = Face::from_slice(data, 0).ok_or("could not parse font file")?;
    for v in variations {
        let b = v.tag.as_bytes();
        if b.len() == 4 {
            face.set_variation(Tag::from_bytes(&[b[0], b[1], b[2], b[3]]), v.value);
        }
    }
    Ok(face)
}

pub fn metrics(face: &Face, size_mm: f64) -> FontMetrics {
    let upm = face.units_per_em() as f64;
    let s = size_mm / upm;
    let f: &ttf_parser::Face = face.as_ref();
    FontMetrics {
        ascent: f.ascender() as f64 * s,
        descent: f.descender() as f64 * s,
        cap_height: f.capital_height().map(|h| h as f64 * s).unwrap_or(f.ascender() as f64 * s * 0.7),
        line_gap: f.line_gap() as f64 * s,
    }
}

/// Shape one line. `size_mm` is the em size. `tracking_mm` is extra advance per glyph.
pub fn shape_line(face: &Face, text: &str, size_mm: f64, tracking_mm: f64, kerning: bool) -> ShapedLine {
    let upm = face.units_per_em() as f64;
    let s = size_mm / upm;
    let mut buf = UnicodeBuffer::new();
    buf.push_str(text);
    let features = if kerning {
        vec![]
    } else {
        vec![rustybuzz::Feature::new(Tag::from_bytes(b"kern"), 0, ..)]
    };
    let out = rustybuzz::shape(face, &features, buf);
    let (infos, poss) = (out.glyph_infos(), out.glyph_positions());
    let ttf: &ttf_parser::Face = face.as_ref();
    let mut pen = 0.0;
    let mut glyphs = Vec::with_capacity(infos.len());
    for (info, pos) in infos.iter().zip(poss) {
        let gid = ttf_parser::GlyphId(info.glyph_id as u16);
        let origin = pen + pos.x_offset as f64 * s;
        let mut fl = Flattener { out: vec![], cur: vec![], last: [0.0; 2], s, ox: origin };
        // y offset applied after outline build
        ttf.outline_glyph(gid, &mut fl);
        fl.close();
        let yo = pos.y_offset as f64 * s;
        let mut contours = fl.out;
        if yo != 0.0 {
            for c in &mut contours {
                for p in c {
                    p[1] += yo;
                }
            }
        }
        let adv = pos.x_advance as f64 * s;
        glyphs.push(Glyph { contours, pen_x: pen, center_x: pen + adv / 2.0, advance: adv });
        pen += adv + tracking_mm;
    }
    ShapedLine { glyphs, width: (pen - tracking_mm).max(0.0) }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn find_system_font() -> Option<Vec<u8>> {
        for p in [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            "/mnt/c/Windows/Fonts/arialbd.ttf",
        ] {
            if let Ok(d) = std::fs::read(p) {
                return Some(d);
            }
        }
        None
    }

    #[test]
    fn shapes_text_if_font_available() {
        let Some(data) = find_system_font() else { return };
        let face = parse(&data, &[]).unwrap();
        let line = shape_line(&face, "OAB8", 50.0, 0.0, true);
        assert_eq!(line.glyphs.len(), 4);
        assert!(line.width > 80.0);
        assert!(line.glyphs[0].contours.len() >= 2, "O has outer + counter");
    }
}
