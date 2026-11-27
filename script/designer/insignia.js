/*
  Insignia, as the Mech Designer of merit-mech-workshop had them: at each location of
  the frame, an emblem, a text or number, or an image, with its color, how clear it is,
  how worn, and whether it glows.

  The locations are the insignia places of the frame's shapes. The emblems are drawn the
  way the old module drew them, for choosing one.

  The engine draws these choices as decals. What is chosen is kept on the mech
  item (mechdata.insignia).
*/

export const LOCATIONS = ["chest", "back", "head", "left-shoulder", "right-shoulder", "left-arm", "right-arm", "left-leg", "right-leg", "left-side", "right-side"];
export const KINDS = ["emblem", "text", "image"];
export const EMBLEMS = ["star", "skull", "chevrons", "arrow", "roundel", "cross", "bolt", "wing", "claws", "target", "hexagon", "warning", "hazard", "band", "barcode"];

const PREVIEW = 48;
const HEX = /^#[0-9a-f]{6}$/i;
const LONGEST_TEXT = 24;

const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

const polygon = (count, radius, inner = radius, turn = -90) => {
  const steps = inner === radius ? count : count * 2;
  const corners = Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps * 360 + turn) * Math.PI / 180;
    const reach = i % 2 ? inner : radius;

    return `${i ? "L" : "M"}${50 + reach * Math.cos(angle)} ${50 + reach * Math.sin(angle)}`;
  });

  return `${corners.join("")}Z`;
};

const PATHS = {
  star: polygon(5, 48, 19),
  skull: `M50 5C26 5 9 22 9 45c0 14 6 24 16 31v17h50V76c10-7 16-17 16-31C91 22 74 5 50 5Z${circle(33, 47, 11)}${circle(67, 47, 11)}M50 58l8 15H42ZM37 81h4v12h-4ZM48 81h4v12h-4ZM59 81h4v12h-4Z`,
  chevrons: "M8 40L50 8L92 40V62L50 30L8 62ZM8 74L50 42L92 74V96L50 64L8 96Z",
  arrow: "M50 4L94 52H67V96H33V52H6Z",
  roundel: `${circle(50, 50, 46)}${circle(50, 50, 32)}${circle(50, 50, 18)}`,
  cross: "M36 5H64V36H95V64H64V95H36V64H5V36H36Z",
  bolt: "M60 3L16 57H44L34 97L84 38H55Z",
  wing: "M4 62C24 20 58 10 97 12C90 25 82 31 70 34C80 34 85 34 90 33C83 46 72 51 58 52C67 53 72 53 78 52C66 68 38 76 4 62Z",
  claws: "M20 6L36 4L24 60L14 96L10 92ZM46 4L62 4L48 62L38 98L33 94ZM72 4L88 8L74 62L62 96L58 92Z",
  target: `${circle(50, 50, 40)}${circle(50, 50, 31)}M47 2H53V36H47ZM47 64H53V98H47ZM2 47H36V53H2ZM64 47H98V53H64Z`,
  hexagon: `${polygon(6, 48)}${polygon(6, 36)}${polygon(6, 20)}`,
  warning: "M50 6L97 92H3ZM50 24L18 84H82ZM46 42H54L52.5 66H47.5ZM46 70H54V78H46Z"
};

const FILLS = {
  band: (context, width, height) => context.fillRect(0, 0, width, height),
  hazard: (context, width, height) => {
    context.beginPath();

    for (let x = -height; x < width + height; x += 44) {
      context.moveTo(x, height);
      context.lineTo(x + height, 0);
      context.lineTo(x + height + 22, 0);
      context.lineTo(x + 22, height);
      context.closePath();
    }

    context.fill();
  },
  barcode: (context, width, height) => {
    let x = 0;

    for (let i = 0; x < width; i++) {
      const bar = 2 + (i * 7919 % 5) * 1.6;

      if (i % 2 === 0) context.fillRect(x, 0, Math.min(bar, width - x), height);

      x += bar;
    }
  }
};

const pictures = new Map();

export function emblemPicture(emblem) {
  if (pictures.has(emblem)) return pictures.get(emblem);

  const canvas = Object.assign(document.createElement("canvas"), { width: PREVIEW, height: PREVIEW });
  const context = canvas.getContext("2d");

  context.scale(PREVIEW / 100, PREVIEW / 100);
  context.fillStyle = "#e8e6df";

  if (FILLS[emblem]) FILLS[emblem](context, 100, 100);
  else context.fill(new Path2D(PATHS[emblem]), "evenodd");

  pictures.set(emblem, canvas.toDataURL());

  return pictures.get(emblem);
}

export function cleanInsignia(raw) {
  const number = (value, usual) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : usual;

  return {
    ...raw?.kind === "emblem" && raw?.decal ? { decal: structuredClone(raw.decal) } : {},
    kind: KINDS.includes(raw?.kind) ? raw.kind : "emblem",
    emblem: EMBLEMS.includes(raw?.emblem) ? raw.emblem : "star",
    text: String(raw?.text ?? "").slice(0, LONGEST_TEXT),
    font: String(raw?.font ?? "").slice(0, 60),
    src: typeof raw?.src === "string" ? raw.src.trim().slice(0, 500) : "",
    color: HEX.test(raw?.color) ? raw.color.toLowerCase() : "#e8e6df",
    recolor: raw?.recolor === true,
    opacity: Math.max(0.05, number(raw?.opacity, 1)),
    wear: number(raw?.wear, 0),
    glow: raw?.glow === true
  };
}
