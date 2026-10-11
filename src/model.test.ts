import { describe, expect, it } from 'vitest';
import { initialBoard, parseBoard, visible, curve } from './model';
describe('portable boards', () => {
  it('round-trips all cards and connections', () => {
    const b = initialBoard();
    expect(parseBoard(JSON.stringify(b))).toEqual(b);
  });
  it('rejects duplicate nodes and dangling edges', () => {
    const b = initialBoard();
    b.nodes.push(b.nodes[0]);
    expect(() => parseBoard(JSON.stringify(b))).toThrow();
    const c = initialBoard();
    c.edges[0].to = 'missing';
    expect(() => parseBoard(JSON.stringify(c))).toThrow();
  });
  it('rejects remote and executable image sources', () => {
    for (const content of [
      'javascript:alert(1)',
      'https://example.com/image.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
    ]) {
      const b = initialBoard();
      b.nodes[0] = { ...b.nodes[0], type: 'image', content };
      expect(() => parseBoard(JSON.stringify(b))).toThrow();
    }
  });
  it('rejects invalid dimensions and future versions', () => {
    const b = initialBoard();
    b.nodes[0].width = -5;
    expect(() => parseBoard(JSON.stringify(b))).toThrow();
    expect(() => parseBoard('{"version":2}')).toThrow();
  });
});
describe('canvas geometry', () => {
  it('culls distant cards while respecting pan and zoom', () => {
    const n = initialBoard().nodes[0];
    expect(visible(n, { x: 0, y: 0, zoom: 1 }, 1200, 800)).toBe(true);
    expect(visible(n, { x: -2000, y: 0, zoom: 1 }, 1200, 800)).toBe(false);
    expect(visible(n, { x: -100, y: -50, zoom: 0.5 }, 500, 500)).toBe(true);
  });
  it('anchors cubic splines to the card boundaries', () => {
    const [a, b] = initialBoard().nodes;
    expect(curve(a, b)).toMatch(/^M 410 215 C/);
    expect(curve(b, a)).toMatch(/410 215$/);
  });
});

describe('drawing documents', () => {
  it('imports older boards with no ink', () => {
    const { strokes, ...legacy } = initialBoard();
    expect(parseBoard(JSON.stringify(legacy)).strokes).toEqual([]);
  });
  it('round-trips strokes and rejects unsafe or invalid ink', () => {
    const b = initialBoard();
    b.strokes = [
      {
        id: 'ink',
        color: '#123456',
        width: 3,
        points: [
          { x: -25, y: 10 },
          { x: 50, y: 30 },
        ],
      },
    ];
    expect(parseBoard(JSON.stringify(b))).toEqual(b);
    b.strokes[0].color = 'url(https://example.com)';
    expect(() => parseBoard(JSON.stringify(b))).toThrow();
    b.strokes[0].color = '#123456';
    b.strokes[0].points = [];
    expect(() => parseBoard(JSON.stringify(b))).toThrow();
  });
});
