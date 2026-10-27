pub mod bridges;
pub mod doc;
pub mod font;
pub mod geom;
pub mod layout;
pub mod mesh;
pub mod pipeline;

use doc::Doc;
use pipeline::{Fonts, Out2D};
use serde::Serialize;
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AxisInfo {
    pub tag: String,
    pub min: f32,
    pub default: f32,
    pub max: f32,
}

#[derive(Serialize, Tsify, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct FontInfo {
    pub family: String,
    pub glyph_count: u16,
    pub axes: Vec<AxisInfo>,
}

/// Triangle mesh handed to the viewer (positions in mm).
#[wasm_bindgen]
pub struct MeshData {
    positions: Vec<f32>,
    indices: Vec<u32>,
    open_edges: u32,
    bad_edges: u32,
    volume: f64,
}

#[wasm_bindgen]
impl MeshData {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f32> {
        self.positions.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn indices(&self) -> Vec<u32> {
        self.indices.clone()
    }
    #[wasm_bindgen(getter, js_name = openEdges)]
    pub fn open_edges(&self) -> u32 {
        self.open_edges
    }
    #[wasm_bindgen(getter, js_name = badEdges)]
    pub fn bad_edges(&self) -> u32 {
        self.bad_edges
    }
    #[wasm_bindgen(getter)]
    pub fn volume(&self) -> f64 {
        self.volume
    }
}

#[wasm_bindgen]
pub struct Engine {
    fonts: Fonts,
}

fn err(e: impl ToString) -> JsError {
    JsError::new(&e.to_string())
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Engine {
        Engine { fonts: Fonts::new() }
    }

    /// Register a font under `id`. Returns metadata, including variable axes.
    #[wasm_bindgen(js_name = loadFont)]
    pub fn load_font(&mut self, id: &str, data: Vec<u8>) -> Result<FontInfo, JsError> {
        let info = {
            let face = font::parse(&data, &[]).map_err(err)?;
            let ttf: &rustybuzz::ttf_parser::Face = face.as_ref();
            let mut family = String::new();
            for n in ttf.names() {
                if (n.name_id == 16 || (n.name_id == 1 && family.is_empty())) && n.is_unicode() {
                    if let Some(s) = n.to_string() {
                        family = s;
                    }
                }
            }
            let axes = ttf
                .variation_axes()
                .into_iter()
                .map(|a| AxisInfo {
                    tag: String::from_utf8_lossy(&a.tag.to_bytes()).to_string(),
                    min: a.min_value,
                    default: a.def_value,
                    max: a.max_value,
                })
                .collect();
            FontInfo { family, glyph_count: ttf.number_of_glyphs(), axes }
        };
        self.fonts.insert(id.to_string(), data);
        Ok(info)
    }

    #[wasm_bindgen(js_name = hasFont)]
    pub fn has_font(&self, id: &str) -> bool {
        self.fonts.contains_key(id)
    }

    #[wasm_bindgen(js_name = compute2d)]
    pub fn compute_2d(&self, doc: Doc) -> Result<Out2D, JsError> {
        let c = pipeline::compute(&doc, &self.fonts).map_err(err)?;
        Ok(pipeline::out2d(&doc, &c))
    }

    #[wasm_bindgen(js_name = computeMesh)]
    pub fn compute_mesh(&self, doc: Doc) -> Result<MeshData, JsError> {
        let c = pipeline::compute(&doc, &self.fonts).map_err(err)?;
        let m = pipeline::build_mesh(&doc, &c);
        let (open, bad) = mesh::validate(&m);
        Ok(MeshData {
            positions: mesh::positions_f32(&m, [c.bounds[0], c.bounds[1]]),
            indices: mesh::indices_flat(&m),
            open_edges: open as u32,
            bad_edges: bad as u32,
            volume: mesh::volume(&m),
        })
    }

    /// Binary STL. `flip` rotates the part so the spray face lies on the print bed.
    #[wasm_bindgen(js_name = exportStl)]
    pub fn export_stl(&self, doc: Doc, flip: bool) -> Result<Vec<u8>, JsError> {
        let c = pipeline::compute(&doc, &self.fonts).map_err(err)?;
        let m = pipeline::build_mesh(&doc, &c);
        Ok(pipeline::stl_bytes(&m, c.bounds, c.thickness, flip))
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}
