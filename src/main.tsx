import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Pencil,
  MousePointer2,
  Hand,
  Type,
  ImagePlus,
  Spline,
  Undo2,
  Redo2,
  Minus,
  Plus,
  Maximize,
  Download,
  Upload,
  Trash2,
  Copy,
  X,
  Check,
  HelpCircle,
  LayoutDashboard,
  ChevronDown,
  Bold,
  Italic,
  Heading2,
  List,
  Link,
  PanelLeftClose,
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  type Stroke,
  strokePath,
  strokeBounds,
  type Board,
  type Card,
  type View,
  type Tone,
  id,
  clamp,
  curve,
  visible,
  initialBoard,
  parseBoard,
} from './model';
import { readBoard, saveBoard } from './storage';
import './style.css';
const Markdown = memo(({ text }: { text: string }) => (
  <div
    className="markdown"
    dangerouslySetInnerHTML={{
      __html: DOMPurify.sanitize(marked.parse(text, { async: false }) as string, {
        FORBID_TAGS: ['img', 'style', 'iframe'],
        FORBID_ATTR: ['style'],
      }),
    }}
  />
));
const tones: Tone[] = ['paper', 'sage', 'butter', 'rose', 'sky'];
type Tool = 'select' | 'hand' | 'text' | 'connect' | 'pen';
type Gesture = {
  kind: 'pan' | 'move' | 'resize' | 'ink' | 'move-ink';
  stroke?: Stroke;
  startX: number;
  startY: number;
  view: View;
  board: Board;
  node?: Card;
  moved: boolean;
};
function App() {
  const [inkColor, setInkColor] = useState('#355d48');
  const [inkWidth, setInkWidth] = useState(3);
  const inkPreview = useRef<SVGPathElement>(null);
  const [board, setBoard] = useState<Board>(initialBoard);
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState('Opening…');
  const [view, setView] = useState<View>({ x: 20, y: 20, zoom: 1 });
  const [tool, setTool] = useState<Tool>('select'),
    [selected, setSelected] = useState<string | null>(null),
    [source, setSource] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState('');
  const [help, setHelp] = useState(false),
    [sidebar, setSidebar] = useState(true),
    [message, setMessage] = useState('');
  const [, setHistoryVersion] = useState(0);
  const history = useRef<Board[]>([]),
    future = useRef<Board[]>([]),
    gesture = useRef<Gesture | null>(null),
    space = useRef(false);
  const boardRef = useRef(board);
  boardRef.current = board;
  const canvas = useRef<HTMLDivElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    editor = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    let active = true;
    readBoard()
      .then((b) => {
        if (active) {
          if (b) setBoard(parseBoard(JSON.stringify(b)));
          setStatus('All changes saved');
        }
      })
      .catch(() => {
        if (active) setStatus('Storage unavailable — export to keep your work');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setStatus('Saving…');
    const t = setTimeout(() => {
      saveBoard(board)
        .then(() => setStatus('All changes saved'))
        .catch(() => setStatus('Save failed — export a backup'));
    }, 350);
    return () => clearTimeout(t);
  }, [board, ready]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (!ready) return;
    const flush = () => {
      void saveBoard(boardRef.current).catch(() => {});
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [ready]);
  useEffect(() => {
    if (!editing && !help) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,a[href]') ?? [],
      );
    if (!editing) focusables()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const elements = focusables();
      const first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [editing, help]);
  function record(previous: Board) {
    history.current = [...history.current.slice(-49), previous];
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }
  function commit(next: Board) {
    record(boardRef.current);
    setBoard(next);
  }
  function undo() {
    const previous = history.current.pop();
    if (previous) {
      future.current.push(boardRef.current);
      setBoard(previous);
      setSelected(null);
      setEditing(null);
      setHistoryVersion((v) => v + 1);
    }
  }
  function redo() {
    const next = future.current.pop();
    if (next) {
      history.current.push(boardRef.current);
      setBoard(next);
      setSelected(null);
      setEditing(null);
      setHistoryVersion((v) => v + 1);
    }
  }
  function point(clientX: number, clientY: number) {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.x) / view.zoom,
      y: (clientY - r.top - view.y) / view.zoom,
    };
  }
  function addText(
    p = { x: (size.w / 2 - view.x) / view.zoom - 145, y: (size.h / 2 - view.y) / view.zoom - 100 },
  ) {
    const n: Card = {
      id: id(),
      type: 'text',
      ...p,
      width: 290,
      height: 230,
      title: 'UNTITLED NOTE',
      tone: 'paper',
      content: '## A new thought\n\nStart writing here…',
    };
    commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, n] });
    setSelected(n.id);
    setTool('select');
    setEditing(n.id);
    setDraft(n.content);
  }
  function remove() {
    if (!selected) return;
    const b = boardRef.current;
    commit({
      ...b,
      strokes: b.strokes.filter((s) => s.id !== selected),
      nodes: b.nodes.filter((n) => n.id !== selected),
      edges: b.edges.filter((e) => e.id !== selected && e.from !== selected && e.to !== selected),
    });
    setSelected(null);
  }
  function duplicate() {
    const n = boardRef.current.nodes.find((n) => n.id === selected);
    if (n) {
      const copy = { ...n, id: id(), x: n.x + 35, y: n.y + 35 };
      commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, copy] });
      setSelected(copy.id);
    }
  }
  function zoom(factor: number, cx = size.w / 2, cy = size.h / 2) {
    setView((v) => {
      const z = clamp(v.zoom * factor, 0.15, 3);
      return { x: cx - ((cx - v.x) * z) / v.zoom, y: cy - ((cy - v.y) * z) / v.zoom, zoom: z };
    });
  }
  function fit() {
    const ns = [...boardRef.current.nodes, ...boardRef.current.strokes.map(strokeBounds)];
    if (!ns.length) {
      setView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const minX = Math.min(...ns.map((n) => n.x)),
      minY = Math.min(...ns.map((n) => n.y)),
      maxX = Math.max(...ns.map((n) => n.x + n.width)),
      maxY = Math.max(...ns.map((n) => n.y + n.height));
    const z = clamp(
      Math.min((size.w - 120) / (maxX - minX), (size.h - 120) / (maxY - minY)),
      0.15,
      1.5,
    );
    setView({
      x: (size.w - (maxX - minX) * z) / 2 - minX * z,
      y: (size.h - (maxY - minY) * z) / 2 - minY * z,
      zoom: z,
    });
  }
  useEffect(() => {
    const el = canvas.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (gesture.current?.kind === 'ink') return;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoom(Math.exp(-e.deltaY * 0.008), e.clientX - r.left, e.clientY - r.top);
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [size]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (editing || help) {
        if (e.key === 'Escape') {
          setEditing(null);
          setHelp(false);
        }
        return;
      }
      if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      if (gesture.current?.kind === 'ink') {
        if (e.key === 'Escape') {
          gesture.current = null;
          inkPreview.current?.setAttribute('d', '');
        }
        e.preventDefault();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === ' ') {
        space.current = true;
        e.preventDefault();
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') {
        setEditing(null);
        setSelected(null);
        setSource(null);
        setTool('select');
        setHelp(false);
      } else if (!mod) {
        if (e.key === 't') addText();
        if (e.key === 'p') {
          setTool('pen');
          setSelected(null);
        }
        if (e.key === 'v') setTool('select');
        if (e.key === 'h') setTool('hand');
        if (e.key === 'c') {
          setTool('connect');
          setSource(null);
        }
        if (e.key === 'f') fit();
        if (e.key === '?') setHelp(true);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.key === ' ') space.current = false;
    }
    function blur() {
      space.current = false;
    }
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });
  async function addImages(files: File[], p?: { x: number; y: number }) {
    const images = files.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (!images.length) {
      setMessage('Choose PNG, JPEG, WebP, or GIF images.');
      return;
    }
    try {
      const nodes: Card[] = [];
      for (const [i, file] of images.entries()) {
        if (file.size > 20 * 1024 * 1024) throw new Error('Each image must be smaller than 20 MB.');
        const content = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(new Error('Could not read image.'));
          r.readAsDataURL(file);
        });
        const img = new Image();
        img.src = content;
        await img.decode();
        const width = 320,
          height = clamp((width * img.height) / img.width + 44, 140, 600);
        nodes.push({
          id: id(),
          type: 'image',
          x: (p?.x ?? (size.w / 2 - view.x) / view.zoom - 160) + i * 35,
          y: (p?.y ?? (size.h / 2 - view.y) / view.zoom - 120) + i * 35,
          width,
          height,
          content,
          title: file.name,
          tone: 'paper',
        });
      }
      commit({ ...boardRef.current, nodes: [...boardRef.current.nodes, ...nodes] });
      setSelected(nodes.at(-1)!.id);
      setMessage(`${nodes.length} image${nodes.length > 1 ? 's' : ''} added`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load image.');
    }
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void addImages(files);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });
  function start(e: React.PointerEvent, n?: Card, resize = false) {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('a')) return;
    e.stopPropagation();
    if (!ready) return;
    if (e.button === 1 || space.current || tool === 'hand') {
      gesture.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        view,
        board: boardRef.current,
        moved: false,
      };
    } else if (tool === 'pen') {
      setSelected(null);
      const stroke: Stroke = {
        id: id(),
        points: [point(e.clientX, e.clientY)],
        color: inkColor,
        width: inkWidth,
      };
      gesture.current = {
        kind: 'ink',
        stroke,
        startX: e.clientX,
        startY: e.clientY,
        view,
        board: boardRef.current,
        moved: false,
      };
      inkPreview.current?.setAttribute('d', strokePath(stroke.points));
    } else if (n && tool === 'connect') {
      if (!source) {
        setSource(n.id);
        setMessage('Now click a destination card');
      } else if (source !== n.id) {
        if (!board.edges.some((edge) => edge.from === source && edge.to === n.id))
          commit({
            ...boardRef.current,
            edges: [...boardRef.current.edges, { id: id(), from: source, to: n.id }],
          });
        setSource(null);
        setTool('select');
      }
      return;
    } else if (n) {
      setSelected(n.id);
      gesture.current = {
        kind: resize ? 'resize' : 'move',
        startX: e.clientX,
        startY: e.clientY,
        view,
        board: boardRef.current,
        node: n,
        moved: false,
      };
    } else if (tool === 'text') {
      addText(point(e.clientX, e.clientY));
      return;
    } else {
      setSelected(null);
      setSource(null);
      gesture.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        view,
        board: boardRef.current,
        moved: false,
      };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'ink') {
      const stroke = g.stroke!;
      const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const event of events.length ? events : [e.nativeEvent]) {
        const p = point(event.clientX, event.clientY),
          last = stroke.points.at(-1)!;
        if (Math.hypot(p.x - last.x, p.y - last.y) * view.zoom >= 1 && stroke.points.length < 50000)
          stroke.points.push(p);
      }
      inkPreview.current?.setAttribute('d', strokePath(stroke.points));
      return;
    }
    const dx = e.clientX - g.startX,
      dy = e.clientY - g.startY;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !g.moved) return;
    g.moved = true;
    if (g.kind === 'move-ink') {
      setBoard({
        ...g.board,
        strokes: g.board.strokes.map((s) =>
          s.id === g.stroke!.id
            ? {
                ...s,
                points: g.stroke!.points.map((p) => ({
                  x: p.x + dx / g.view.zoom,
                  y: p.y + dy / g.view.zoom,
                })),
              }
            : s,
        ),
      });
    } else if (g.kind === 'pan') setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    else {
      const n = g.node!;
      setBoard({
        ...g.board,
        nodes: g.board.nodes.map((node) =>
          node.id !== n.id
            ? node
            : g.kind === 'move'
              ? { ...n, x: n.x + dx / g.view.zoom, y: n.y + dy / g.view.zoom }
              : {
                  ...n,
                  width: clamp(n.width + dx / g.view.zoom, 180, 2000),
                  height: clamp(n.height + dy / g.view.zoom, 120, 2000),
                },
        ),
      });
    }
  }
  function end() {
    const g = gesture.current;
    if (g?.kind === 'ink') {
      commit({ ...boardRef.current, strokes: [...boardRef.current.strokes, g.stroke!] });
      inkPreview.current?.setAttribute('d', '');
    } else if (g?.moved && g.kind !== 'pan') record(g.board);
    gesture.current = null;
  }
  function selectInk(e: React.PointerEvent, stroke: Stroke) {
    if (tool !== 'select' || space.current || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(stroke.id);
    gesture.current = {
      kind: 'move-ink',
      stroke,
      startX: e.clientX,
      startY: e.clientY,
      view,
      board: boardRef.current,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function exportBoard() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.title.replace(/[^a-z0-9 -]/gi, '').trim() || 'storyboard'}.storyboard.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Board exported, including all images');
  }
  async function importBoard(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100 * 1024 * 1024)
        throw new Error('Board files must be smaller than 100 MB.');
      const b = parseBoard(await file.text());
      commit(b);
      setSelected(null);
      setView({ x: 20, y: 20, zoom: 1 });
      setMessage('Board imported. Undo restores your previous board.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not import board');
    }
  }
  function format(before: string, after = '') {
    const el = editor.current!;
    const s = el.selectionStart,
      e = el.selectionEnd;
    setDraft(draft.slice(0, s) + before + draft.slice(s, e) + after + draft.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  }
  const nodeMap = useMemo(() => new Map(board.nodes.map((n) => [n.id, n])), [board.nodes]);
  const active = board.nodes.find((n) => n.id === selected);
  const editNode = board.nodes.find((n) => n.id === editing);
  return (
    <div className="app">
      <header>
        <a className="brand" href="/" aria-label="Storyboard home">
          <span className="brand-icon">
            <LayoutDashboard size={20} />
          </span>
          storyboard<span className="beta">LOCAL</span>
        </a>
        <div className="board-title">
          <input
            aria-label="Board title"
            value={board.title}
            maxLength={200}
            onFocus={() => record(boardRef.current)}
            disabled={!ready}
            onChange={(e) => setBoard({ ...board, title: e.target.value })}
          />
          <ChevronDown size={14} />
        </div>
        <div className="header-actions">
          <span className="save-state">
            <span className={status === 'All changes saved' ? 'saved-dot' : 'saving-dot'} />
            {status}
          </span>
          <button
            onClick={() => importInput.current?.click()}
            title="Import a board"
            disabled={!ready}
          >
            <Upload size={16} />
            <span>Import</span>
          </button>
          <button className="export" onClick={exportBoard}>
            <Download size={16} />
            <span>Export board</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        {sidebar && (
          <aside>
            <div className="aside-heading">
              YOUR WORKSPACE
              <button
                className="icon-button"
                title="Hide sidebar"
                onClick={() => setSidebar(false)}
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            <div className="workspace-card">
              <span className="workspace-symbol">
                <LayoutDashboard size={19} />
              </span>
              <div>
                <strong>Creative playground</strong>
                <small>Personal board</small>
              </div>
              <span className="live-dot" />
            </div>
            <div className="section-label">CREATE SOMETHING</div>
            <button className="create-row" onClick={() => addText()} disabled={!ready}>
              <Type size={18} />
              <span>Text card</span>
              <kbd>T</kbd>
            </button>
            <button
              className="create-row"
              onClick={() => imageInput.current?.click()}
              disabled={!ready}
            >
              <ImagePlus size={18} />
              <span>Image</span>
              <Plus size={14} />
            </button>
            <button
              className={`create-row ${tool === 'connect' ? 'active' : ''}`}
              onClick={() => {
                setTool('connect');
                setSource(null);
              }}
            >
              <Spline size={18} />
              <span>Connection</span>
              <kbd>C</kbd>
            </button>
            <div className="sidebar-line" />
            <div className="section-label">
              ON THIS BOARD <span>{board.nodes.length}</span>
            </div>
            <div className="node-list">
              {board.nodes.map((n, i) => (
                <button
                  key={n.id}
                  className={selected === n.id ? 'node-row chosen' : 'node-row'}
                  onClick={() => {
                    setSelected(n.id);
                    setView((v) => ({
                      ...v,
                      x: size.w / 2 - (n.x + n.width / 2) * v.zoom,
                      y: size.h / 2 - (n.y + n.height / 2) * v.zoom,
                    }));
                  }}
                >
                  <span className={`node-dot ${n.tone}`} />
                  <span>{n.title || `Card ${i + 1}`}</span>
                  {n.type === 'image' && <ImagePlus size={13} />}
                </button>
              ))}
            </div>
            <div className="sidebar-bottom">
              <div className="local-note">
                <span>✳</span>
                <strong>A space for your next big thing.</strong>
                <p>
                  Your ideas stay in this browser.
                  <br />
                  Export a board to take them with you.
                </p>
              </div>
              <button className="help-button" onClick={() => setHelp(true)}>
                <HelpCircle size={16} />A few handy shortcuts<kbd>?</kbd>
              </button>
            </div>
          </aside>
        )}
        <main
          ref={canvas}
          className={`canvas tool-${tool}`}
          style={{
            backgroundPosition: `${view.x}px ${view.y}px`,
            backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          }}
          onPointerDown={(e) => start(e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={() => {
            if (gesture.current?.kind === 'ink') {
              gesture.current = null;
              inkPreview.current?.setAttribute('d', '');
            } else end();
          }}
          onLostPointerCapture={end}
          onDoubleClick={(e) => {
            if (tool !== 'pen' && e.target === canvas.current) addText(point(e.clientX, e.clientY));
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            void addImages(Array.from(e.dataTransfer.files), point(e.clientX, e.clientY));
          }}
          aria-label="Storyboard canvas"
        >
          <div className="canvas-caption">
            {!sidebar && (
              <button
                title="Show sidebar"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setSidebar(true)}
              >
                <LayoutDashboard size={16} />
              </button>
            )}
            <span>THE BIG PICTURE</span>
            <span className="caption-divider" />
            <span>
              {board.nodes.length} cards · {board.edges.length} connections
            </span>
          </div>
          <div
            className="world"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          >
            <svg className="connections">
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 1 1 L 9 5 L 1 9"
                    fill="none"
                    stroke="context-stroke"
                    strokeWidth="1.6"
                  />
                </marker>
              </defs>
              {board.edges.map((e) => {
                const a = nodeMap.get(e.from),
                  b = nodeMap.get(e.to);
                if (!a || !b) return null;
                const d = curve(a, b);
                return (
                  <g key={e.id} className={selected === e.id ? 'edge selected-edge' : 'edge'}>
                    <path d={d} markerEnd="url(#arrow)" />
                    <path
                      className="edge-hit"
                      d={d}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        setSelected(e.id);
                      }}
                    />
                  </g>
                );
              })}
            </svg>
            {board.nodes
              .filter((n) => visible(n, view, size.w, size.h) || selected === n.id)
              .map((n) => (
                <article
                  key={n.id}
                  className={`card ${n.tone} ${n.type}-card ${selected === n.id ? 'selected' : ''} ${source === n.id ? 'source' : ''}`}
                  style={{ left: n.x, top: n.y, width: n.width, height: n.height }}
                  onPointerDown={(e) => start(e, n)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (tool !== 'pen' && n.type === 'text') {
                      setEditing(n.id);
                      setDraft(n.content);
                    }
                  }}
                  tabIndex={0}
                  aria-label={n.title}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && n.type === 'text') {
                      setEditing(n.id);
                      setDraft(n.content);
                    }
                    if (e.key === ' ') {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelected(n.id);
                    }
                  }}
                >
                  <div className="card-label">
                    <span>{n.title}</span>
                    {n.type === 'image' ? (
                      <ImagePlus size={12} />
                    ) : (
                      <span className="card-grip">⠿</span>
                    )}
                  </div>
                  {n.type === 'image' ? (
                    <img src={n.content} alt={n.title} draggable={false} />
                  ) : (
                    <Markdown text={n.content} />
                  )}
                  {selected === n.id && (
                    <button
                      className="resize-handle"
                      aria-label="Resize card"
                      onPointerDown={(e) => start(e, n, true)}
                    />
                  )}
                </article>
              ))}
            <svg className={`ink-layer ${tool === 'select' ? 'ink-selectable' : ''}`}>
              {board.strokes
                .filter((s) => visible(strokeBounds(s), view, size.w, size.h))
                .map((s) => (
                  <g key={s.id}>
                    {selected === s.id && (
                      <path
                        d={strokePath(s.points)}
                        stroke="#a4bb92"
                        strokeWidth={s.width + 7}
                        opacity=".5"
                      />
                    )}
                    <path
                      className="ink-stroke"
                      d={strokePath(s.points)}
                      stroke={s.color}
                      strokeWidth={s.width}
                    />
                    <path
                      className="ink-hit"
                      d={strokePath(s.points)}
                      stroke="transparent"
                      strokeWidth={Math.max(s.width, 14 / view.zoom)}
                      onPointerDown={(e) => selectInk(e, s)}
                    />
                  </g>
                ))}
              <path ref={inkPreview} stroke={inkColor} strokeWidth={inkWidth} />
            </svg>
          </div>
          {board.nodes.length === 0 && board.strokes.length === 0 && (
            <div className="empty-state">
              <LayoutDashboard size={35} />
              <h1>A fresh page. A new possibility.</h1>
              <p>Drop an image or add your first thought.</p>
              <button
                className="primary"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => addText()}
              >
                Create a text card <Plus size={16} />
              </button>
            </div>
          )}
          {tool === 'connect' && (
            <div className="mode-hint">
              {source ? 'Choose the destination card' : 'Click a card to start a connection'}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setTool('select');
                  setSource(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {tool === 'pen' && (
            <div className="pen-controls" onPointerDown={(e) => e.stopPropagation()}>
              <Pencil size={16} />
              <span>Draw a note</span>
              <label>
                Color{' '}
                <input
                  aria-label="Pen color"
                  type="color"
                  value={inkColor}
                  onChange={(e) => setInkColor(e.target.value)}
                />
              </label>
              <label>
                Width{' '}
                <select
                  aria-label="Pen width"
                  value={inkWidth}
                  onChange={(e) => setInkWidth(Number(e.target.value))}
                >
                  {[1, 3, 6, 12].map((w) => (
                    <option key={w} value={w}>
                      {w} px
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="toolbar" onPointerDown={(e) => e.stopPropagation()}>
            <ToolButton
              title="Select (V)"
              active={tool === 'select'}
              onClick={() => setTool('select')}
            >
              <MousePointer2 size={19} />
            </ToolButton>
            <ToolButton title="Pan (H)" active={tool === 'hand'} onClick={() => setTool('hand')}>
              <Hand size={19} />
            </ToolButton>
            <ToolButton
              title="Draw (P)"
              active={tool === 'pen'}
              onClick={() => {
                setTool('pen');
                setSelected(null);
                setSource(null);
              }}
            >
              <Pencil size={19} />
            </ToolButton>
            <span className="toolbar-divider" />
            <ToolButton
              title="Text card (T)"
              active={tool === 'text'}
              onClick={() => setTool('text')}
            >
              <Type size={20} />
            </ToolButton>
            <ToolButton title="Add image" onClick={() => imageInput.current?.click()}>
              <ImagePlus size={20} />
            </ToolButton>
            <ToolButton
              title="Connect cards (C)"
              active={tool === 'connect'}
              onClick={() => {
                setTool('connect');
                setSource(null);
              }}
            >
              <Spline size={20} />
            </ToolButton>
            <span className="toolbar-divider" />
            <ToolButton title="Undo (Ctrl/⌘ Z)" disabled={!history.current.length} onClick={undo}>
              <Undo2 size={18} />
            </ToolButton>
            <ToolButton
              title="Redo (Ctrl/⌘ Shift Z)"
              disabled={!future.current.length}
              onClick={redo}
            >
              <Redo2 size={18} />
            </ToolButton>
          </div>
          <div className="zoom-bar" onPointerDown={(e) => e.stopPropagation()}>
            <ToolButton title="Zoom out" onClick={() => zoom(1 / 1.2)}>
              <Minus size={16} />
            </ToolButton>
            <button aria-label="Reset zoom" title="Reset zoom" onClick={() => zoom(1 / view.zoom)}>
              {Math.round(view.zoom * 100)}%
            </button>
            <ToolButton title="Zoom in" onClick={() => zoom(1.2)}>
              <Plus size={16} />
            </ToolButton>
            <span className="toolbar-divider" />
            <ToolButton title="Fit board (F)" onClick={fit}>
              <Maximize size={16} />
            </ToolButton>
          </div>
          <div className="canvas-footer">
            Drag to explore <span>·</span> Ctrl / ⌘ + scroll to zoom
          </div>
          {selected && (
            <div className="selection-bar" onPointerDown={(e) => e.stopPropagation()}>
              {active && (
                <>
                  <input
                    aria-label="Card label"
                    onFocus={() => record(boardRef.current)}
                    value={active.title}
                    onChange={(e) =>
                      setBoard({
                        ...board,
                        nodes: board.nodes.map((n) =>
                          n.id === active.id ? { ...n, title: e.target.value } : n,
                        ),
                      })
                    }
                  />
                  {active.type === 'text' && (
                    <>
                      <div className="swatches">
                        {tones.map((t) => (
                          <button
                            key={t}
                            title={`${t} card color`}
                            className={`swatch ${t} ${active.tone === t ? 'picked' : ''}`}
                            onClick={() =>
                              commit({
                                ...board,
                                nodes: board.nodes.map((n) =>
                                  n.id === active.id ? { ...n, tone: t } : n,
                                ),
                              })
                            }
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setEditing(active.id);
                          setDraft(active.content);
                        }}
                      >
                        Edit text
                      </button>
                    </>
                  )}
                  <ToolButton title="Duplicate card" onClick={duplicate}>
                    <Copy size={16} />
                  </ToolButton>
                </>
              )}
              <ToolButton
                title={
                  active
                    ? 'Delete card'
                    : board.strokes.some((s) => s.id === selected)
                      ? 'Delete drawing'
                      : 'Delete connection'
                }
                onClick={remove}
              >
                <Trash2 size={16} />
              </ToolButton>
            </div>
          )}
        </main>
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void addImages(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".json"
        hidden
        onChange={(e) => {
          void importBoard(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {editNode && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Edit text card"
            className="editor modal"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">WORDS INTO IDEAS</span>
                <h2>Edit your thought</h2>
              </div>
              <ToolButton title="Cancel editing" onClick={() => setEditing(null)}>
                <X size={20} />
              </ToolButton>
            </div>
            <div className="formatting">
              <ToolButton title="Bold" onClick={() => format('**', '**')}>
                <Bold size={17} />
              </ToolButton>
              <ToolButton title="Italic" onClick={() => format('*', '*')}>
                <Italic size={17} />
              </ToolButton>
              <ToolButton title="Heading" onClick={() => format('\n## ')}>
                <Heading2 size={18} />
              </ToolButton>
              <ToolButton title="Bullet list" onClick={() => format('\n- ')}>
                <List size={18} />
              </ToolButton>
              <ToolButton title="Link" onClick={() => format('[', '](https://example.com)')}>
                <Link size={17} />
              </ToolButton>
              <span>Markdown supported</span>
            </div>
            <div className="editor-columns">
              <label>
                <span>WRITE</span>
                <textarea
                  ref={editor}
                  autoFocus
                  aria-label="Markdown text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      commit({
                        ...board,
                        nodes: board.nodes.map((n) =>
                          n.id === editing ? { ...n, content: draft } : n,
                        ),
                      });
                      setEditing(null);
                    }
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              </label>
              <div className="preview">
                <span>PREVIEW</span>
                <Markdown text={draft} />
              </div>
            </div>
            <div className="modal-footer">
              <span>⌘ / Ctrl + Enter to save</span>
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  commit({
                    ...board,
                    nodes: board.nodes.map((n) =>
                      n.id === editing ? { ...n, content: draft } : n,
                    ),
                  });
                  setEditing(null);
                }}
              >
                <Check size={16} />
                Save card
              </button>
            </div>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>A little flow goes a long way.</h2>
              <ToolButton title="Close shortcuts" onClick={() => setHelp(false)}>
                <X size={20} />
              </ToolButton>
            </div>
            {[
              ['New text card', 'T / double-click canvas'],
              ['Freehand drawing', 'P / Pen tool'],
              ['Edit a card', 'Double-click / Enter'],
              ['Select / pan / connect', 'V / H / C'],
              ['Pan temporarily', 'Hold Space + drag'],
              ['Zoom', 'Ctrl / ⌘ + scroll'],
              ['Fit everything', 'F'],
              ['Undo / redo', 'Ctrl / ⌘ + Z / Shift + Z'],
              ['Duplicate', 'Ctrl / ⌘ + D'],
              ['Delete selection', 'Delete / Backspace'],
              ['Add images', 'Drop, paste, or upload'],
              ['Cancel connection', 'Escape'],
            ].map(([a, b]) => (
              <div className="shortcut" key={a}>
                <span>{a}</span>
                <kbd>{b}</kbd>
              </div>
            ))}
            <p>
              Boards save automatically in this browser. Export regularly to keep a portable backup.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function ToolButton({
  title,
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={title}
      title={title}
      className={`icon-button ${active ? 'active' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
