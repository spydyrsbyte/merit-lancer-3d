/*
  LANCER insignia choices become generic decal artwork on the frame's decal places.
  The bundled emblems are a standard decal collection. Text and uploaded images keep
  the controls of the original module, including color, wear, opacity and glow.
*/

let emblems;

export async function applyInsignia(frame, choices) {
  if (!choices || !Object.keys(choices).length) return;

  emblems ??= fetch(new URL("../../decals/emblems.json", import.meta.url)).then(response => {
    if (!response.ok) throw new Error("The emblem decal collection could not be loaded");

    return response.json();
  });

  const collection = await emblems;

  for (const shape of frame.everything) {
    for (const place of shape.decals) {
      const choice = choices[place.name];

      if (!choice) continue;

      const entry = collection.decals.find(entry => entry.name === choice.emblem);
      const art = choice.decal ? structuredClone(choice.decal) : choice.kind === "text"
        ? textDrawing(choice)
        : choice.kind === "image" ? { viewBox: [0, 0, 100, 100], svg: [], image: choice.src, recolor: choice.recolor, color: choice.color }
          : entry ? structuredClone(entry) : null;

      if (art && choice.kind === "emblem" && !choice.decal) for (const item of art.svg) item.fill = choice.color;

      place.art = art;
      place.opacity = choice.opacity ?? 1;
      place.wear = choice.wear ?? 0;
      place.glow = choice.glow === true;
    }
  }
}

function textDrawing(choice) {
  const text = choice.text || "00";
  const family = choice.font || "Signika";
  const context = document.createElement("canvas").getContext("2d");

  context.font = `bold 100px "${family.replaceAll('"', '')}", sans-serif`;

  const measured = context.measureText(text);
  const width = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight || 1;
  const height = measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent || 1;
  const margin = Math.max(width, height) * 0.02;

  return {
    viewBox: [-measured.actualBoundingBoxLeft - margin, -measured.actualBoundingBoxAscent - margin, width + margin * 2, height + margin * 2],
    svg: [{ tag: "text", x: 0, y: 0, "font-size": 100, "font-family": `${family}, sans-serif`, "font-weight": "bold", fill: choice.color, text }]
  };
}
