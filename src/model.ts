export type Tone = 'paper' | 'sage' | 'butter' | 'rose' | 'sky';
export type Card = {
  id: string;
  type: 'text' | 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  title: string;
  tone: Tone;
};
export type Edge = { id: string; from: string; to: string };
export type InkPoint = { x: number; y: number };
export type Stroke = { id: string; points: InkPoint[]; color: string; width: number };
export type Board = { version: 1; title: string; nodes: Card[]; edges: Edge[]; strokes: Stroke[] };
export function strokePath(points: InkPoint[]) {
  if (!points.length) return '';
  const first = points[0];
  if (points.length === 1) return `M ${first.x} ${first.y} l 0.01 0`;
  let path = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      next = points[i + 1];
    path += ` Q ${p.x} ${p.y} ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  return path + ` L ${last.x} ${last.y}`;
}
export function strokeBounds(stroke: Stroke) {
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of stroke.points) {
    x = Math.min(x, p.x);
    y = Math.min(y, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  return {
    x: x - stroke.width,
    y: y - stroke.width,
    width: right - x + stroke.width * 2,
    height: bottom - y + stroke.width * 2,
  };
}
export type View = { x: number; y: number; zoom: number };
export const id = () => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function curve(a: Card, b: Card) {
  const right = b.x + b.width / 2 >= a.x + a.width / 2;
  const sx = a.x + (right ? a.width : 0),
    sy = a.y + a.height / 2;
  const tx = b.x + (right ? 0 : b.width),
    ty = b.y + b.height / 2;
  const bend = Math.max(70, Math.abs(tx - sx) * 0.5) * (right ? 1 : -1);
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
}
export function visible(
  n: { x: number; y: number; width: number; height: number },
  view: View,
  w: number,
  h: number,
) {
  return (
    (n.x + n.width) * view.zoom + view.x > -100 &&
    n.x * view.zoom + view.x < w + 100 &&
    (n.y + n.height) * view.zoom + view.y > -100 &&
    n.y * view.zoom + view.y < h + 100
  );
}
export function parseBoard(raw: string): Board {
  const b = JSON.parse(raw);
  if (
    b?.version !== 1 ||
    typeof b.title !== 'string' ||
    b.title.length > 200 ||
    !Array.isArray(b.nodes) ||
    !Array.isArray(b.edges) ||
    b.nodes.length > 10000 ||
    b.edges.length > 30000
  )
    throw new Error('This is not a supported Storyboard file.');
  const ids = new Set<string>();
  const nodes: Card[] = b.nodes.map((n: Card) => {
    if (
      !n ||
      typeof n.id !== 'string' ||
      ids.has(n.id) ||
      !['text', 'image'].includes(n.type) ||
      typeof n.content !== 'string' ||
      typeof n.title !== 'string' ||
      !['paper', 'sage', 'butter', 'rose', 'sky'].includes(n.tone) ||
      ![n.x, n.y, n.width, n.height].every(Number.isFinite) ||
      Math.abs(n.x) > 1e7 ||
      Math.abs(n.y) > 1e7 ||
      n.width < 120 ||
      n.width > 5000 ||
      n.height < 100 ||
      n.height > 5000
    )
      throw new Error('The file contains an invalid card.');
    if (
      n.type === 'image' &&
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(n.content)
    )
      throw new Error('Images must be embedded PNG, JPEG, WebP, or GIF files.');
    ids.add(n.id);
    return {
      id: n.id,
      type: n.type,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      content: n.content,
      title: n.title,
      tone: n.tone,
    };
  });
  const edgeIds = new Set<string>();
  const edges: Edge[] = b.edges.map((e: Edge) => {
    if (
      !e ||
      typeof e.id !== 'string' ||
      edgeIds.has(e.id) ||
      !ids.has(e.from) ||
      !ids.has(e.to) ||
      e.from === e.to
    )
      throw new Error('The file contains an invalid connection.');
    edgeIds.add(e.id);
    return { id: e.id, from: e.from, to: e.to };
  });
  if (b.strokes !== undefined && (!Array.isArray(b.strokes) || b.strokes.length > 20000))
    throw new Error('The file contains invalid drawings.');
  const strokeIds = new Set([...ids, ...edgeIds]);
  let totalPoints = 0;
  const strokes: Stroke[] = (b.strokes ?? []).map((s: Stroke) => {
    if (
      !s ||
      typeof s.id !== 'string' ||
      strokeIds.has(s.id) ||
      typeof s.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !Number.isFinite(s.width) ||
      s.width < 1 ||
      s.width > 30 ||
      !Array.isArray(s.points) ||
      !s.points.length ||
      s.points.length > 50000
    )
      throw new Error('The file contains an invalid drawing.');
    totalPoints += s.points.length;
    if (totalPoints > 1000000) throw new Error('The drawings contain too many points.');
    strokeIds.add(s.id);
    return {
      id: s.id,
      color: s.color,
      width: s.width,
      points: s.points.map((p) => {
        if (
          !p ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > 1e7 ||
          Math.abs(p.y) > 1e7
        )
          throw new Error('The drawing contains an invalid point.');
        return { x: p.x, y: p.y };
      }),
    };
  });
  return { version: 1, title: b.title, nodes, edges, strokes };
}
export function initialBoard(): Board {
  return {
    version: 1,
    title: 'A little room for big ideas',
    strokes: [],
    nodes: [
      {
        id: 'start',
        type: 'text',
        x: 100,
        y: 95,
        width: 310,
        height: 240,
        title: 'THE STARTING POINT',
        tone: 'sage',
        content:
          '# Every great story\nstarts with a spark.\n\nA place to collect the pieces, connect the dots, and see what happens.',
      },
      {
        id: 'plan',
        type: 'text',
        x: 505,
        y: 70,
        width: 290,
        height: 270,
        title: '01 / EXPLORE',
        tone: 'paper',
        content:
          '## Follow your curiosity\n\n- Gather your references\n- Write the messy first thought\n- Find the unexpected connection\n\n**Double-click any card to make it yours.**',
      },
      {
        id: 'note',
        type: 'text',
        x: 505,
        y: 415,
        width: 285,
        height: 195,
        title: 'A NOTE TO SELF',
        tone: 'butter',
        content:
          '## Make space for the unexpected.\n\nThe best ideas rarely arrive in a straight line. ↗',
      },
      {
        id: 'next',
        type: 'text',
        x: 895,
        y: 200,
        width: 280,
        height: 240,
        title: '02 / MAKE IT REAL',
        tone: 'paper',
        content:
          '## Your next chapter\n\nDrop an image anywhere. Add a thought. Draw a connection.\n\n*This canvas is yours.*\n\n`T` text · `C` connect · `H` pan',
      },
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'plan' },
      { id: 'e2', from: 'plan', to: 'next' },
      { id: 'e3', from: 'note', to: 'next' },
    ],
  };
}
