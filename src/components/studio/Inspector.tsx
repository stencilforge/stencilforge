"use client";
import * as React from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Anchor, Link2, Link2Off, Move, Slice, Square, Trash2, Type, Layers3, Ruler,
} from "lucide-react";
import { useStudio } from "@/lib/store";
import type { Doc, TextObj } from "@/lib/types";
import { Field, NumberField, Pill, Section, Segmented, Select, Slider, Switch, Button } from "@/components/ui/controls";
import { FontPicker } from "./FontPicker";

export function Inspector() {
  const doc = useStudio((s) => s.doc);
  const selectedId = useStudio((s) => s.selectedId);
  const obj = doc.objects.find((o) => o.id === selectedId);
  const result = useStudio((s) => s.result);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <ModeSection />
      {obj && obj.content.type === "text" && <TextSection id={obj.id} />}
      {obj && <TransformSection id={obj.id} />}
      <SlabSection />
      <BridgesSection islands={result?.stats.islands ?? 0} bridges={result?.stats.bridges ?? 0} />
      <EdgeSection />
      <PrintSection />
      <div className="h-8 shrink-0" />
    </div>
  );
}

/* ---------------------------------------------------------------- Mode */
function ModeSection() {
  const mode = useStudio((s) => s.doc.mode);
  const mirror = useStudio((s) => s.doc.mirror);
  const update = useStudio((s) => s.updateDoc);
  return (
    <Section title="Stencil mode" icon={<Layers3 className="size-3.5" />}>
      <Segmented
        value={mode}
        onChange={(v) => update((d) => void (d.mode = v))}
        className="w-full [&>button]:flex-1"
        options={[
          { value: "negative", label: "Cut-out", title: "Letters are holes — paint goes through them" },
          { value: "positive", label: "Inverse", title: "Letters are solid — paint the background" },
        ]}
      />
      <p className="text-[11px] leading-snug text-ink-300">
        {mode === "negative" ? "Letters are cut through the slab. Paint goes through the letters." : "Letters stay solid and protect the surface. Paint the background around them."}
      </p>
      <Field label="Mirror" hint="For painting behind glass">
        <Switch checked={mirror} onChange={(v) => update((d) => void (d.mirror = v))} />
      </Field>
    </Section>
  );
}

/* ---------------------------------------------------------------- Text */
function TextSection({ id }: { id: string }) {
  const t = useStudio((s) => (s.doc.objects.find((o) => o.id === id)?.content as TextObj & { type: "text" }) ?? null);
  const fontInfo = useStudio((s) => (t ? s.fonts[t.font]?.info : undefined));
  const updateText = useStudio((s) => s.updateText);
  if (!t) return null;
  const set = (patch: Partial<TextObj>) => updateText(id, patch);
  const axes = fontInfo?.axes ?? [];
  const axisValue = (tag: string, def: number) => t.variations.find((a) => a.tag === tag)?.value ?? def;
  const setAxis = (tag: string, value: number) => {
    const rest = t.variations.filter((a) => a.tag !== tag);
    set({ variations: [...rest, { tag, value }] });
  };

  return (
    <Section title="Text" icon={<Type className="size-3.5" />}>
      <textarea
        value={t.text}
        onChange={(e) => set({ text: e.target.value })}
        rows={3}
        spellCheck={false}
        placeholder="Type something…"
        className="w-full resize-none rounded-md border border-ink-500 bg-ink-850 px-3 py-2 text-[14px] leading-snug text-ink-50 outline-none transition placeholder:text-ink-300 hover:border-ink-400 focus:border-volt-500 focus:shadow-[0_0_0_3px_rgb(46_139_255/0.18)]"
      />
      <FontPicker value={t.font} onChange={(font) => set({ font, variations: [] })} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Field label="Size">
          <NumberField value={t.size} onChange={(size) => set({ size })} unit="mm" min={2} max={1000} step={1} className="w-full" />
        </Field>
        <Field label="Weight">
          <NumberField value={t.weight} onChange={(weight) => set({ weight })} unit="mm" min={-5} max={10} step={0.05} precision={2} className="w-full" />
        </Field>
        <Field label="Tracking">
          <NumberField value={t.tracking} onChange={(tracking) => set({ tracking })} unit="mm" min={-20} max={200} step={0.25} className="w-full" />
        </Field>
        <Field label="Leading">
          <NumberField value={t.leading} onChange={(leading) => set({ leading })} unit="x" min={0.3} max={4} step={0.02} className="w-full" />
        </Field>
      </div>
      <Field label="Align">
        <Segmented
          value={t.align}
          onChange={(align) => set({ align })}
          options={[
            { value: "left", label: <AlignLeft className="size-3.5" /> },
            { value: "center", label: <AlignCenter className="size-3.5" /> },
            { value: "right", label: <AlignRight className="size-3.5" /> },
          ]}
        />
      </Field>
      <Field label="Kerning">
        <Switch checked={t.kerning} onChange={(kerning) => set({ kerning })} />
      </Field>

      {axes.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
          <span className="font-mono text-[10px] tracking-wider text-ink-300 uppercase">Variable axes</span>
          {axes.map((a) => (
            <div key={a.tag} className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[10.5px] text-ink-200">
                <span>{a.tag}</span>
                <span className="tabular-nums">{Math.round(axisValue(a.tag, a.default))}</span>
              </div>
              <Slider min={a.min} max={a.max} step={1} value={axisValue(a.tag, a.default)} onChange={(v) => setAxis(a.tag, v)} />
            </div>
          ))}
        </div>
      )}

      <Field label="Text on arc" hint="Wrap along a circle">
        <Switch tone="volt" checked={!!t.arc} onChange={(on) => set({ arc: on ? { radius: 80, inside: false, centerAngle: 90 } : null })} />
      </Field>
      {t.arc && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
          <Field label="Radius">
            <NumberField value={t.arc.radius} onChange={(radius) => set({ arc: { ...t.arc!, radius } })} unit="mm" min={5} max={2000} step={1} />
          </Field>
          <Field label="Centre angle">
            <NumberField value={t.arc.centerAngle} onChange={(centerAngle) => set({ arc: { ...t.arc!, centerAngle } })} unit="deg" min={-360} max={360} step={1} />
          </Field>
          <Field label="Inside">
            <Switch
              tone="volt"
              checked={t.arc.inside}
              onChange={(inside) => set({ arc: { ...t.arc!, inside, centerAngle: inside ? 270 : 90 } })}
            />
          </Field>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ Transform */
function TransformSection({ id }: { id: string }) {
  const o = useStudio((s) => s.doc.objects.find((x) => x.id === id));
  const update = useStudio((s) => s.updateObj);
  const remove = useStudio((s) => s.removeObj);
  const count = useStudio((s) => s.doc.objects.length);
  if (!o) return null;
  return (
    <Section title="Transform" icon={<Move className="size-3.5" />} defaultOpen={false}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <NumberField label="X" value={o.x} onChange={(x) => update(id, (v) => void (v.x = x))} unit="mm" step={1} className="w-full" />
        <NumberField label="Y" value={o.y} onChange={(y) => update(id, (v) => void (v.y = y))} unit="mm" step={1} className="w-full" />
        <NumberField label="R" value={o.rotation} onChange={(r) => update(id, (v) => void (v.rotation = r))} unit="deg" step={1} className="w-full" />
        <NumberField label="S" value={o.scale} onChange={(s) => update(id, (v) => void (v.scale = s))} unit="x" step={0.05} min={0.05} max={50} className="w-full" />
      </div>
      {count > 1 && (
        <Button variant="outline" onClick={() => remove(id)} className="text-danger hover:text-danger">
          <Trash2 className="size-3.5" /> Remove object
        </Button>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- Slab */
function SlabSection() {
  const slab = useStudio((s) => s.doc.slab);
  const mode = useStudio((s) => s.doc.mode);
  const thickness = useStudio((s) => s.doc.thickness);
  const update = useStudio((s) => s.updateDoc);
  const [linked, setLinked] = React.useState(true);
  const setMargin = (side: keyof Doc["slab"]["margins"], v: number) =>
    update((d) => {
      if (linked) d.slab.margins = { top: v, right: v, bottom: v, left: v };
      else d.slab.margins[side] = v;
    });
  const hasRadius = slab.shape === "rounded" || slab.shape === "chamfer";

  return (
    <Section title="Slab & border" icon={<Square className="size-3.5" />}>
      <Field label="Shape">
        <Select
          className="w-[150px]"
          value={slab.shape}
          onChange={(shape) => update((d) => void (d.slab.shape = shape))}
          options={[
            { value: "rect", label: "Rectangle" },
            { value: "rounded", label: "Rounded" },
            { value: "chamfer", label: "Chamfered" },
            { value: "pill", label: "Pill" },
            { value: "ellipse", label: "Ellipse" },
            { value: "contour", label: "Follow outline" },
          ]}
        />
      </Field>
      <Field label="Thickness">
        <NumberField value={thickness} onChange={(v) => update((d) => void (d.thickness = v))} unit="mm" min={0.6} max={10} step={0.2} />
      </Field>
      <Field label="Fit to content">
        <Switch tone="volt" checked={slab.fit} onChange={(v) => update((d) => void (d.slab.fit = v))} />
      </Field>
      {slab.fit ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-ink-300 uppercase">Border width</span>
            <button
              onClick={() => setLinked((l) => !l)}
              className="rounded p-1 text-ink-200 hover:bg-ink-600 hover:text-ink-50"
              title={linked ? "Sides linked" : "Sides independent"}
            >
              {linked ? <Link2 className="size-3.5 text-volt-400" /> : <Link2Off className="size-3.5" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <NumberField label="T" value={slab.margins.top} onChange={(v) => setMargin("top", v)} unit="mm" min={0} step={1} className="w-full" />
            <NumberField label="R" value={slab.margins.right} onChange={(v) => setMargin("right", v)} unit="mm" min={0} step={1} className="w-full" />
            <NumberField label="B" value={slab.margins.bottom} onChange={(v) => setMargin("bottom", v)} unit="mm" min={0} step={1} className="w-full" />
            <NumberField label="L" value={slab.margins.left} onChange={(v) => setMargin("left", v)} unit="mm" min={0} step={1} className="w-full" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3">
          <NumberField label="W" value={slab.width} onChange={(v) => update((d) => void (d.slab.width = v))} unit="mm" min={10} step={5} className="w-full" />
          <NumberField label="H" value={slab.height} onChange={(v) => update((d) => void (d.slab.height = v))} unit="mm" min={10} step={5} className="w-full" />
        </div>
      )}
      {hasRadius && (
        <Field label={slab.shape === "chamfer" ? "Chamfer" : "Corner radius"}>
          <NumberField value={slab.radius} onChange={(v) => update((d) => void (d.slab.radius = v))} unit="mm" min={0} max={200} step={0.5} />
        </Field>
      )}
      {mode === "positive" && (
        <Field label="Frame width" hint="Holds the letters together">
          <NumberField value={slab.frame} onChange={(v) => update((d) => void (d.slab.frame = v))} unit="mm" min={0} step={0.5} />
        </Field>
      )}
      <Field label="Mounting holes" hint="Four corners">
        <Switch checked={slab.mountHoles} onChange={(v) => update((d) => void (d.slab.mountHoles = v))} />
      </Field>
      {slab.mountHoles && (
        <div className="grid grid-cols-2 gap-x-3 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
          <NumberField label="Ø" value={slab.holeDiameter} onChange={(v) => update((d) => void (d.slab.holeDiameter = v))} unit="mm" min={1} step={0.5} className="w-full" />
          <NumberField label="in" value={slab.holeInset} onChange={(v) => update((d) => void (d.slab.holeInset = v))} unit="mm" min={1} step={0.5} className="w-full" />
        </div>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------- Bridges */
function BridgesSection({ islands, bridges }: { islands: number; bridges: number }) {
  const b = useStudio((s) => s.doc.bridges);
  const thickness = useStudio((s) => s.doc.thickness);
  const update = useStudio((s) => s.updateDoc);
  return (
    <Section
      title="Bridges"
      icon={<Anchor className="size-3.5" />}
      badge={
        <Pill tone={islands === 0 ? "plain" : "ember"}>
          {islands} island{islands === 1 ? "" : "s"} · {bridges} bridge{bridges === 1 ? "" : "s"}
        </Pill>
      }
    >
      <Field label="Auto bridges" hint="Hold islands in place">
        <Switch checked={b.enabled} onChange={(v) => update((d) => void (d.bridges.enabled = v))} />
      </Field>
      <div className={b.enabled ? "flex flex-col gap-3" : "pointer-events-none flex flex-col gap-3 opacity-40"}>
        <Segmented
          value={b.kind}
          onChange={(v) => update((d) => void (d.bridges.kind = v))}
          className="w-full [&>button]:flex-1"
          options={[
            { value: "classic", label: "Classic", title: "Full-thickness gaps, the traditional stencil look" },
            { value: "floating", label: "Floating", title: "Raised bridges: paint flows underneath for a seamless result" },
          ]}
        />
        <p className="text-[11px] leading-snug text-ink-300">
          {b.kind === "classic"
            ? "Bridges run the full thickness and leave visible gaps in the paint, the classic stencil look."
            : "Bridges sit on top of the slab. Paint flows underneath, so letters look continuous. Prints spray-face-down without supports."}
        </p>
        <Field label="Placement">
          <Select
            className="w-[150px]"
            value={b.strategy}
            onChange={(v) => update((d) => void (d.bridges.strategy = v))}
            options={[
              { value: "shortest", label: "Shortest span" },
              { value: "axis", label: "Horizontal / vertical" },
              { value: "angle", label: "Fixed angle" },
              { value: "radial", label: "Radial" },
            ]}
          />
        </Field>
        {b.strategy === "angle" && (
          <Field label="Angle">
            <NumberField value={b.angle} onChange={(v) => update((d) => void (d.bridges.angle = v))} unit="deg" min={0} max={180} step={5} />
          </Field>
        )}
        <Field label="Width">
          <NumberField value={b.width} onChange={(v) => update((d) => void (d.bridges.width = v))} unit="mm" min={0.4} max={10} step={0.1} />
        </Field>
        <Field label="Per island" hint="Minimum bridges">
          <NumberField value={b.minPerIsland} onChange={(v) => update((d) => void (d.bridges.minPerIsland = Math.round(v)))} min={1} max={6} step={1} precision={0} />
        </Field>
        {b.kind === "floating" && (
          <Field label="Height" hint={`of ${thickness} mm slab`}>
            <NumberField
              value={b.floatHeight}
              onChange={(v) => update((d) => void (d.bridges.floatHeight = v))}
              unit="mm"
              min={0.2}
              max={Math.max(0.4, thickness * 0.85)}
              step={0.1}
            />
          </Field>
        )}
        <Field label="Max length">
          <NumberField value={b.maxLength} onChange={(v) => update((d) => void (d.bridges.maxLength = v))} unit="mm" min={2} max={500} step={5} />
        </Field>
      </div>
      <p className="text-[11px] leading-snug text-ink-300">
        Press <kbd className="rounded bg-ink-600 px-1 font-mono">B</kbd> and drag across a gap to add a bridge. Click a bridge to edit or delete it.
      </p>
      {(b.manual.length > 0 || b.suppressed.length > 0) && (
        <Button variant="outline" onClick={() => useStudio.getState().clearManualBridges()}>
          Reset manual edits ({b.manual.length + b.suppressed.length})
        </Button>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- Edge */
function EdgeSection() {
  const e = useStudio((s) => s.doc.edge);
  const update = useStudio((s) => s.updateDoc);
  return (
    <Section title="Edge profile" icon={<Slice className="size-3.5" />} defaultOpen={false}>
      <Field label="Spray-side chamfer" hint="Reduces paint shadowing">
        <NumberField value={e.chamfer} onChange={(v) => update((d) => void (d.edge.chamfer = v))} unit="mm" min={0} max={3} step={0.1} />
      </Field>
      {e.chamfer > 0 && (
        <Field label="Steps" hint="Stair-steps approximating the slope">
          <NumberField value={e.steps} onChange={(v) => update((d) => void (d.edge.steps = Math.round(v)))} min={2} max={12} step={1} precision={0} />
        </Field>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------- Print */
function PrintSection() {
  const p = useStudio((s) => s.doc.print);
  const update = useStudio((s) => s.updateDoc);
  return (
    <Section title="Print checks" icon={<Ruler className="size-3.5" />} defaultOpen={false}>
      <Field label="Min wall" hint="Warns below this width">
        <NumberField value={p.minWall} onChange={(v) => update((d) => void (d.print.minWall = v))} unit="mm" min={0.2} max={5} step={0.1} />
      </Field>
      <Field label="Material density" hint="g/cm³ (PLA 1.24, PETG 1.27)">
        <NumberField value={p.density} onChange={(v) => update((d) => void (d.print.density = v))} min={0.8} max={3} step={0.01} />
      </Field>
    </Section>
  );
}
