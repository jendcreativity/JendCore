/**
 * Verification harness for the document workspace: view geometry, annotation
 * operations and the transfer protocol.
 *
 * Run it with Node's built-in TypeScript support (Node 22.6+ / 24, no flags and
 * no test framework, so nothing is added to the project's dependencies):
 *
 *     node scripts/verify-doc-coords.ts
 *
 * It exercises the **real** modules the app ships (`src/lib/documentView.ts`,
 * `docAnnotations.ts`, `docTransfer.ts`, `documents.ts`) — not copies — so a
 * change that breaks a coordinate invariant or the reassembler fails here.
 *
 * The invariants that matter most are section C: a change of viewport must move
 * the *displayed* document without ever changing where an annotation belongs.
 */

import {
  clampOffset,
  contentRect,
  docToScreen,
  fitView,
  fitScale,
  isAtFit,
  isViewable,
  panBy,
  screenToDoc,
  zoomAt,
  zoomAtCenter,
  zoomPercent,
  ZOOM_STEP,
  type ContainerSize,
  type ContentSize,
  type DocPoint,
  type ViewState,
} from '../src/lib/documentView.ts';
import {
  DOC_ANNOTATION_LIMITS,
  applyDocOp,
  annotationsForPage,
  createDocAnnotation,
  hitTest,
  parseDocOp,
  rectFromDrag,
  type DocAnnotation,
} from '../src/lib/docAnnotations.ts';
import {
  CHUNK_BYTES,
  TRANSFER_TIMEOUT_MS,
  TransferAssembler,
  TransferMismatchError,
  parseTransferFrame,
  prepareTransfer,
  sha256Hex,
  sliceChunks,
} from '../src/lib/docTransfer.ts';
import { DOC_LIMITS, parseDocumentMeta } from '../src/lib/documents.ts';

/* global process */

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    return;
  }
  failures.push(detail ? `${name} — ${detail}` : name);
}

function near(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function section(title: string): void {
  console.log(`\n── ${title}`);
}

const LANDSCAPE: ContentSize = { width: 800, height: 600 };
const PORTRAIT: ContentSize = { width: 600, height: 900 };
const SQUARE: ContentSize = { width: 500, height: 500 };
const DESKTOP: ContainerSize = { width: 1000, height: 700 };
const PHONE: ContainerSize = { width: 360, height: 640 };

/** The doc point under a container point, via the public transform. */
function docPointAt(view: ViewState, content: ContentSize, p: { x: number; y: number }): DocPoint {
  const uv = screenToDoc(view, content, p);
  if (!uv) throw new Error('screenToDoc returned null for a measurable view');
  return uv;
}

/* ───────────────────────── A. fit, letterbox, centring ───────────────────────── */

section('A. Fit, letterbox and centring');
{
  const view = fitView(LANDSCAPE, DESKTOP);
  const rect = contentRect(view, LANDSCAPE);
  check('A1 landscape fit scale is min(cw/iw, ch/ih)', near(view.scale, Math.min(1000 / 800, 700 / 600), 1e-12));
  check('A2 landscape letterbox is centred horizontally', near(rect.x, (1000 - rect.width) / 2, 1e-9));
  check('A3 landscape is edge-to-edge vertically', near(rect.height, 700, 1e-9) && near(rect.y, 0, 1e-9));

  const portrait = fitView(PORTRAIT, DESKTOP);
  const portraitRect = contentRect(portrait, PORTRAIT);
  // Height-limited: 700 / 900 is the smaller of the two ratios.
  check('A4 portrait fit scale is height-limited', near(portrait.scale, 700 / 900, 1e-12));
  check(
    'A5 portrait is letterboxed left/right only',
    near(portraitRect.height, 700, 1e-9) &&
      near(portraitRect.x, (1000 - 600 * (700 / 900)) / 2, 1e-9),
  );

  const square = fitView(SQUARE, { width: 800, height: 800 });
  check('A6 square fills the square viewer exactly', near(square.scale, 1.6, 1e-12) && near(square.offsetX, 0, 1e-9));

  const phone = fitView(PORTRAIT, PHONE);
  const phoneRect = contentRect(phone, PORTRAIT);
  check('A7 portrait on a phone is width-limited and centred', near(phoneRect.width, 360, 1e-6) && near(phoneRect.x, 0, 1e-6));
  check('A8 phone letterbox is split top and bottom', near(phoneRect.y, (640 - phoneRect.height) / 2, 1e-9));

  check('A9 degenerate content is reported unviewable', !isViewable({ width: 0, height: 10 }, DESKTOP));
  check('A10 unviewable fit is a safe default view', eq(fitView({ width: 0, height: 0 }, DESKTOP), { scale: 1, offsetX: 0, offsetY: 0 }));
  check('A11 fitScale of a 1:1 box pair is exact', near(fitScale(SQUARE, SQUARE), 1, 1e-12));
}

/* ───────────────────────── B. transform round trip ───────────────────────── */

section('B. Coordinate round trip (container -> document -> container)');
{
  const cases: { content: ContentSize; container: ContainerSize }[] = [
    { content: LANDSCAPE, container: DESKTOP },
    { content: PORTRAIT, container: PHONE },
    { content: SQUARE, container: { width: 1200, height: 400 } },
    { content: { width: 2480, height: 3508 }, container: { width: 900, height: 1000 } },
  ];
  let worst = 0;
  let points = 0;
  for (const c of cases) {
    let view = fitView(c.content, c.container);
    for (const factor of [1, 1.5, 3, 0.5]) {
      view = zoomAtCenter(view, c.content, c.container, factor);
      for (const px of [0, 37, Math.floor(c.container.width / 2), c.container.width - 1]) {
        for (const py of [0, 19, Math.floor(c.container.height / 2), c.container.height - 1]) {
          const uv = docPointAt(view, c.content, { x: px, y: py });
          const back = docToScreen(view, c.content, uv);
          worst = Math.max(worst, Math.abs(back.x - px), Math.abs(back.y - py));
          points += 1;
        }
      }
    }
  }
  check('B1 round trip is exact to 1e-6 px', worst < 1e-6, `worst error ${worst}`);
  check('B2 round trip was sampled broadly', points === 4 * 4 * 4 * 4);
}

/* ───────────────── C. content lock (the mandatory invariant) ───────────────── */

section('C. Annotations stay locked to document content');
{
  // A point on the drawing: a component the user circles once, then revisits.
  const target: DocPoint = [0.37, 0.62];

  /** Rendered position of the target, relative to the content box. */
  function relativePosition(view: ViewState, content: ContentSize): DocPoint {
    const rect = contentRect(view, content);
    const s = docToScreen(view, content, target);
    return [(s.x - rect.x) / rect.width, (s.y - rect.y) / rect.height];
  }

  function locked(name: string, view: ViewState, content: ContentSize): void {
    const [u, v] = relativePosition(view, content);
    check(
      name,
      near(u, target[0], 1e-9) && near(v, target[1], 1e-9),
      `rendered at ${u.toFixed(6)}, ${v.toFixed(6)}`,
    );
  }

  const atFit = fitView(LANDSCAPE, DESKTOP);
  locked('C1 locked at fit-to-view', atFit, LANDSCAPE);

  const zoomedIn = zoomAt(atFit, LANDSCAPE, DESKTOP, 3.2, { x: 240, y: 180 });
  locked('C2 locked while zoomed in about an off-centre pointer', zoomedIn, LANDSCAPE);

  const zoomedOut = zoomAt(zoomedIn, LANDSCAPE, DESKTOP, 0.05, { x: 10, y: 10 });
  locked('C3 locked after zooming back out (clamped at the minimum)', zoomedOut, LANDSCAPE);

  const panned = panBy(zoomedIn, -320, 90, LANDSCAPE, DESKTOP);
  locked('C4 locked after panning', panned, LANDSCAPE);

  const resized = fitView(LANDSCAPE, PHONE);
  locked('C5 locked after the viewer is resized (desktop -> phone)', resized, LANDSCAPE);

  const onPhoneThenZoomed = zoomAtCenter(resized, LANDSCAPE, PHONE, 2.5);
  locked('C6 locked on a phone viewport after zooming', onPhoneThenZoomed, LANDSCAPE);

  locked(
    'C7 locked on portrait content (vertical letterbox)',
    zoomAtCenter(fitView(PORTRAIT, DESKTOP), PORTRAIT, DESKTOP, 2),
    PORTRAIT,
  );
  locked('C8 locked on square content in a wide box', fitView(SQUARE, { width: 1200, height: 400 }), SQUARE);
  locked(
    'C9 locked for a tall A4 page in a short box',
    zoomAt(fitView({ width: 595, height: 842 }, PHONE), { width: 595, height: 842 }, PHONE, 4, { x: 20, y: 300 }),
    { width: 595, height: 842 },
  );

  // Negative control: the display position *must* move with the view, otherwise
  // the assertions above would also pass on a broken implementation.
  const movedA = docToScreen(atFit, LANDSCAPE, target);
  const movedB = docToScreen(zoomedIn, LANDSCAPE, target);
  check(
    'C10 the rendered position genuinely moves when the view changes (test is not vacuous)',
    Math.abs(movedA.x - movedB.x) > 1 || Math.abs(movedA.y - movedB.y) > 1,
    `${JSON.stringify(movedA)} vs ${JSON.stringify(movedB)}`,
  );

  // Two participants: same document point, different viewport, different zoom,
  // different pan — the mark must still sit on the same content.
  const alice = zoomAt(fitView(LANDSCAPE, DESKTOP), LANDSCAPE, DESKTOP, 2.2, { x: 700, y: 120 });
  const bob = panBy(fitView(LANDSCAPE, PHONE), -40, 12, LANDSCAPE, PHONE);
  check(
    'C11 two participants agree on where the mark belongs',
    near(relativePosition(alice, LANDSCAPE)[0], relativePosition(bob, LANDSCAPE)[0], 1e-9) &&
      near(relativePosition(alice, LANDSCAPE)[1], relativePosition(bob, LANDSCAPE)[1], 1e-9),
  );

  // The stored annotation itself is never rewritten by a view change.
  const mark = createDocAnnotation('circle', 'peer-a', 1, { point: target });
  const snapshot = JSON.stringify(mark);
  let walk = fitView(LANDSCAPE, DESKTOP);
  walk = zoomAt(walk, LANDSCAPE, DESKTOP, 5, { x: 5, y: 5 });
  walk = panBy(walk, -800, 240, LANDSCAPE, DESKTOP);
  walk = zoomAtCenter(walk, LANDSCAPE, DESKTOP, 0.1);
  check('C12 stored annotation geometry is untouched by view changes', JSON.stringify(mark) === snapshot);
  check('C13 the view object is replaced, not mutated in place', !eq(walk, fitView(LANDSCAPE, DESKTOP)));
}

/* ───────────────────────────── D. zoom behaviour ───────────────────────────── */

section('D. Zoom');
{
  const atFit = fitView(LANDSCAPE, DESKTOP);
  const anchor = { x: 250, y: 300 };
  const beforePoint = docPointAt(atFit, LANDSCAPE, anchor);
  const zoomed = zoomAt(atFit, LANDSCAPE, DESKTOP, 2, anchor);
  const afterPoint = docPointAt(zoomed, LANDSCAPE, anchor);
  check(
    'D1 the document point under the pointer stays under the pointer',
    near(beforePoint[0], afterPoint[0], 1e-6) && near(beforePoint[1], afterPoint[1], 1e-6),
    `${beforePoint} vs ${afterPoint}`,
  );

  const cornerZoom = zoomAt(atFit, LANDSCAPE, DESKTOP, 2, { x: 0, y: 0 });
  const centreZoom = zoomAtCenter(atFit, LANDSCAPE, DESKTOP, 2);
  check(
    'D2 zooming at a corner differs from zooming at the centre (no fixed-corner behaviour)',
    !near(cornerZoom.offsetX, centreZoom.offsetX, 1e-6),
  );

  check('D3 100% means actual size', zoomPercent({ scale: 1, offsetX: 0, offsetY: 0 }) === 100);
  check('D4 fit reports its own true percentage', zoomPercent(atFit) === Math.round(fitScale(LANDSCAPE, DESKTOP) * 100));

  let shrunk = atFit;
  for (let i = 0; i < 25; i += 1) shrunk = zoomAtCenter(shrunk, LANDSCAPE, DESKTOP, 0.5);
  check('D5 zoom-out is bounded at 20% of fit', near(shrunk.scale, fitScale(LANDSCAPE, DESKTOP) * 0.2, 1e-9), `scale ${shrunk.scale}`);

  let grown = atFit;
  for (let i = 0; i < 40; i += 1) grown = zoomAtCenter(grown, LANDSCAPE, DESKTOP, 2);
  check('D6 zoom-in is bounded', grown.scale <= 16 + 1e-9, `scale ${grown.scale}`);

  const stepped = zoomAtCenter(zoomAtCenter(atFit, LANDSCAPE, DESKTOP, ZOOM_STEP), LANDSCAPE, DESKTOP, ZOOM_STEP);
  check('D7 the +/- step is a stable ratio', near(stepped.scale / atFit.scale, ZOOM_STEP * ZOOM_STEP, 1e-9));

  check('D8 isAtFit is true immediately after fitting', isAtFit(atFit, LANDSCAPE, DESKTOP));
  check('D9 isAtFit is false after zooming', !isAtFit(zoomed, LANDSCAPE, DESKTOP));
}

/* ───────────────────────────── E. pan clamping ───────────────────────────── */

section('E. Panning stays glued to the viewer');
{
  const zoomed = zoomAtCenter(fitView(LANDSCAPE, DESKTOP), LANDSCAPE, DESKTOP, 3);
  const farRight = panBy(zoomed, 9999, 0, LANDSCAPE, DESKTOP);
  check('E1 panning cannot drag the left edge inside the viewer', farRight.offsetX <= 1e-9, `offsetX ${farRight.offsetX}`);
  const farLeft = panBy(zoomed, -9999, 0, LANDSCAPE, DESKTOP);
  const rect = contentRect(farLeft, LANDSCAPE);
  check('E2 panning cannot expose a gap on the right', rect.x + rect.width >= DESKTOP.width - 1e-9);
  const farUp = panBy(zoomed, 0, 9999, LANDSCAPE, DESKTOP);
  check('E3 panning cannot drag the top edge down', farUp.offsetY <= 1e-9);

  const small = fitView(SQUARE, DESKTOP);
  const recentred = panBy(small, 400, -400, SQUARE, DESKTOP);
  check('E4 panning a fitted document re-centres it', near(recentred.offsetX, small.offsetX, 1e-9) && near(recentred.offsetY, small.offsetY, 1e-9));

  check(
    'E5 unmeasurable content clamps to a zero offset',
    eq(clampOffset({ scale: 2, offsetX: 50, offsetY: 50 }, { width: 0, height: 0 }, DESKTOP), { scale: 2, offsetX: 0, offsetY: 0 }),
  );
}

/* ─────────────────────── F. annotation ops and eraser ─────────────────────── */

section('F. Annotation operations and eraser hit-testing');
{
  const PAGE = { width: 800, height: 600 };
  const op = (o: Record<string, unknown>) => ({ opId: `o_${Math.random().toString(36).slice(2)}`, docId: 'd1', author: 'peer-a', ts: 1, ...o });

  const pen = createDocAnnotation('pen', 'peer-a', 1, { point: [0.1, 0.5] });
  const add: DocAnnotation[] = [
    { ...pen, points: [[0.1, 0.5], [0.9, 0.5]], done: true } as DocAnnotation,
  ];

  let list: DocAnnotation[] = [];
  list = applyDocOp(list, op({ type: 'add', page: 1, annotation: add[0] }) as never);
  list = applyDocOp(list, op({ type: 'add', page: 1, annotation: add[0] }) as never);
  check('F1 a duplicated add is ignored (one annotation)', list.length === 1);

  list = applyDocOp(list, op({ type: 'patch', page: 1, id: add[0].id, patch: { append: [[0.95, 0.55]], done: true } }) as never);
  const patched = list[0];
  check('F2 a patch appends points', patched.tool === 'pen' && patched.points.length === 3);

  const fat = createDocAnnotation('pen', 'peer-b', 1, { point: [0.5, 0.5] });
  const many = { ...fat, points: new Array(DOC_ANNOTATION_LIMITS.pointsPerStroke).fill([0.5, 0.5]) } as DocAnnotation;
  const capped = applyDocOp([many], op({ type: 'patch', page: 1, id: many.id, patch: { append: [[0.6, 0.6], [0.7, 0.7]] } }) as never);
  const cappedPen = capped[0];
  check('F3 the point cap holds', cappedPen.tool === 'pen' && cappedPen.points.length === DOC_ANNOTATION_LIMITS.pointsPerStroke);

  const deleted = applyDocOp(applyDocOp(list, op({ type: 'delete', page: 1, id: add[0].id }) as never), op({ type: 'delete', page: 1, id: add[0].id }) as never);
  check('F4 deleting twice leaves an empty list', deleted.length === 0);

  const onP1 = createDocAnnotation('rect', 'peer-a', 1, { point: [0.2, 0.2] });
  const onP2 = createDocAnnotation('rect', 'peer-a', 2, { point: [0.3, 0.3] });
  const twoPages = applyDocOp(
    applyDocOp([], op({ type: 'add', page: 1, annotation: onP1 }) as never),
    op({ type: 'add', page: 2, annotation: onP2 }) as never,
  );
  const cleared = applyDocOp(twoPages, op({ type: 'clear-page', page: 1 }) as never);
  check('F5 clearing page 1 leaves page 2 intact', cleared.length === 1 && cleared[0].page === 2);
  check('F6 per-page selection is exact', annotationsForPage(twoPages, 1).length === 1 && annotationsForPage(twoPages, 2).length === 1);

  const validOp = op({ type: 'add', page: 1, annotation: add[0] });
  check('F7 a valid inbound op is accepted', parseDocOp(validOp, 'd1', 3) !== null);
  check('F8 an op for another document is rejected', parseDocOp(validOp, 'd2', 3) === null);
  check('F9 an op for a page that does not exist is rejected', parseDocOp(op({ type: 'add', page: 9, annotation: add[0] }), 'd1', 3) === null);
  check('F10 a non-finite coordinate is rejected', parseDocOp(op({ type: 'add', page: 1, annotation: { ...add[0], points: [[0.1, Number.NaN]] } }), 'd1', 3) === null);
  check('F11 an unknown tool is rejected', parseDocOp(op({ type: 'add', page: 1, annotation: { ...add[0], tool: 'laser' } }), 'd1', 3) === null);
  check('F12 a patch with nothing usable in it is rejected', parseDocOp(op({ type: 'patch', page: 1, id: add[0].id, patch: {} }), 'd1', 3) === null);
  check('F13 a valid patch is accepted', parseDocOp(op({ type: 'patch', page: 1, id: add[0].id, patch: { append: [[0.2, 0.2]] } }), 'd1', 3) !== null);

  const stroke: DocAnnotation[] = [{ ...pen, points: [[0.1, 0.5], [0.9, 0.5]], done: true } as DocAnnotation];
  check('F14 the eraser hits a stroke it is placed on', hitTest(stroke, 1, [0.5, 0.5005], 0.01, PAGE) !== null);
  check('F15 the eraser misses a stroke it is placed away from', hitTest(stroke, 1, [0.5, 0.7], 0.01, PAGE) === null);
  check('F16 the eraser ignores the other page', hitTest([{ ...pen, page: 2, points: [[0.1, 0.5], [0.9, 0.5]], done: true } as DocAnnotation], 1, [0.5, 0.5], 0.01, PAGE) === null);

  const box = { ...createDocAnnotation('rect', 'peer-a', 1, { point: [0.2, 0.2] }), x: 0.2, y: 0.2, w: 0.3, h: 0.3 } as DocAnnotation;
  check('F17 the eraser hits a rectangle outline', hitTest([box], 1, [0.2, 0.35], 0.01, PAGE) !== null);
  check('F18 the eraser ignores the empty middle of a rectangle', hitTest([box], 1, [0.35, 0.35], 0.01, PAGE) === null);

  const circle = { ...createDocAnnotation('circle', 'peer-a', 1, { point: [0.5, 0.5] }), center: [0.5, 0.5] as DocPoint, radius: 0.15 } as DocAnnotation;
  const edgeX = 0.5 + (0.15 * Math.min(PAGE.width, PAGE.height)) / PAGE.width;
  check('F19 the eraser hits a circle edge', hitTest([circle], 1, [edgeX, 0.5], 0.01, PAGE) !== null);
  check('F20 the eraser ignores the circle centre', hitTest([circle], 1, [0.5, 0.5], 0.01, PAGE) === null);

  const under = { ...createDocAnnotation('circle', 'peer-a', 1, { point: [0.5, 0.5] }), center: [0.5, 0.5] as DocPoint, radius: 0.2 } as DocAnnotation;
  const over = { ...createDocAnnotation('circle', 'peer-b', 1, { point: [0.5, 0.5] }), center: [0.5, 0.5] as DocPoint, radius: 0.2 } as DocAnnotation;
  const wideEdgeX = 0.5 + (0.2 * Math.min(PAGE.width, PAGE.height)) / PAGE.width;
  check('F21 the eraser takes the topmost match', hitTest([under, over], 1, [wideEdgeX, 0.5], 0.01, PAGE)?.id === over.id);

  // Compared numerically: `Math.abs(0.2 - 0.8)` is 0.6000000000000001, so a
  // string comparison here would fail on float representation, not on logic.
  const reverseDrag = rectFromDrag([0.8, 0.9], [0.2, 0.3]);
  check(
    'F22 a reverse drag still produces a positive rectangle',
    near(reverseDrag.x, 0.2) && near(reverseDrag.y, 0.3) && near(reverseDrag.w, 0.6) && near(reverseDrag.h, 0.6),
    JSON.stringify(reverseDrag),
  );
}

/* ────────────────────────────── G. transfer ────────────────────────────── */

section('G. Transfer protocol (chunking, reassembly, integrity)');
{
  const bytes = new Uint8Array(CHUNK_BYTES * 2 + 1234);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 251;

  const chunks = sliceChunks(bytes);
  check('G1 chunking produces the expected number of parts', chunks.length === 3);
  check('G2 the final part carries the remainder', chunks[2].byteLength === 1234);
  check('G3 the parts add up to the whole document', chunks.reduce((n, c) => n + c.byteLength, 0) === bytes.byteLength);

  const { begin } = await prepareTransfer('d1', bytes, 'peer-a', 't1');
  check('G4 the manifest describes the exact bytes', begin.size === bytes.byteLength && begin.count === 3);
  check('G5 the manifest digest matches the source bytes', begin.sha256 === (await sha256Hex(bytes)));

  const inOrder = new TransferAssembler(begin);
  for (let i = 0; i < chunks.length; i += 1) inOrder.push(i, chunks[i]);
  check('G6 progress reaches completion', inOrder.complete && inOrder.ratio === 1 && inOrder.accepted === 3);
  const rebuilt = await inOrder.finalize();
  check('G7 the reassembled document is byte-identical', rebuilt.byteLength === bytes.byteLength && rebuilt.every((b, i) => b === bytes[i]));

  const shuffled = new TransferAssembler(begin);
  shuffled.push(2, chunks[2]);
  const acceptedFirst = shuffled.push(0, chunks[0]);
  const duplicate = shuffled.push(0, chunks[0]);
  shuffled.push(1, chunks[1]);
  const shuffledOut = await shuffled.finalize();
  check('G8 out-of-order arrival still reassembles correctly', shuffledOut.every((b, i) => b === bytes[i]));
  check(
    'G9 a duplicate part is ignored',
    acceptedFirst === true && duplicate === false && shuffled.accepted === 3,
  );

  const guarded = new TransferAssembler(begin);
  check('G10 an out-of-range index is refused', guarded.push(9, chunks[0]) === false && guarded.push(-1, chunks[0]) === false);
  check('G11 an empty part is refused', guarded.push(0, new Uint8Array(0)) === false);
  let incomplete = 'no throw';
  try {
    await guarded.finalize();
  } catch (err) {
    incomplete = err instanceof TransferMismatchError ? 'threw' : 'wrong error';
  }
  check('G12 finalizing an incomplete transfer is refused', incomplete === 'threw');

  const tampered = new TransferAssembler(begin);
  const bad = chunks[1].slice();
  bad[0] = (bad[0] + 7) % 256;
  tampered.push(0, chunks[0]);
  tampered.push(1, bad);
  tampered.push(2, chunks[2]);
  let corrupt = 'no throw';
  try {
    await tampered.finalize();
  } catch (err) {
    corrupt = err instanceof TransferMismatchError ? 'threw' : 'wrong error';
  }
  check('G13 a corrupted part is detected and the document refused', corrupt === 'threw');

  const timed = new TransferAssembler(begin, 0);
  check('G14 a fresh transfer is not expired', timed.isExpired(1000) === false);
  check('G15 a stalled transfer expires', timed.isExpired(TRANSFER_TIMEOUT_MS + 1) === true);

  check(
    'G16 junk frames are dropped',
    parseTransferFrame(null) === null &&
      parseTransferFrame('nope') === null &&
      parseTransferFrame({ t: 'chunk' }) === null &&
      parseTransferFrame({ t: 'begin', docId: 'd1' }) === null,
  );
  check(
    'G17 valid frames are accepted',
    parseTransferFrame({ t: 'chunk', docId: 'd1', transferId: 't1', index: 0, count: 3, bytes: 1024 }) !== null &&
      parseTransferFrame({ t: 'need', docId: 'd1' }) !== null &&
      parseTransferFrame({ t: 'ack', transferId: 't1', received: 2 }) !== null,
  );
  check('G18 an index at or beyond the count is rejected', parseTransferFrame({ t: 'chunk', docId: 'd1', transferId: 't1', index: 3, count: 3, bytes: 1024 }) === null);
  check('G19 a begin frame with a bad digest is rejected', parseTransferFrame({ t: 'begin', docId: 'd1', transferId: 't1', sha256: 'abc', size: 10, count: 1, from: 'p' }) === null);
}

/* ────────────────────── H. inbound metadata validation ────────────────────── */

section('H. Inbound document metadata validation');
{
  const valid = {
    docId: 'd1',
    kind: 'image',
    name: 'a'.repeat(80),
    mime: 'image/png',
    size: 1024,
    width: 800,
    height: 600,
    pageCount: 1,
    sharedBy: 'peer-a',
    ts: 1,
    revision: 0,
    sha256: 'a'.repeat(64),
  };
  const parsed = parseDocumentMeta(valid);
  check('H1 a well-formed meta is accepted', parsed !== null);
  check('H2 a long display name is truncated', parsed !== null && parsed.name.length <= 64);
  check('H3 a malformed digest is rejected', parseDocumentMeta({ ...valid, sha256: 'abc' }) === null);
  check('H4 a document over the size limit is rejected', parseDocumentMeta({ ...valid, size: DOC_LIMITS.imageBytes + 1 }) === null);
  check('H5 an image claiming several pages is rejected', parseDocumentMeta({ ...valid, pageCount: 4 }) === null);
  check('H6 a PDF over the page limit is rejected', parseDocumentMeta({ ...valid, kind: 'pdf', mime: 'application/pdf', pageCount: DOC_LIMITS.pdfPages + 1 }) === null);
  check('H7 a non-finite dimension is rejected', parseDocumentMeta({ ...valid, width: Number.POSITIVE_INFINITY }) === null);
  check('H8 an unknown kind is rejected', parseDocumentMeta({ ...valid, kind: 'zip' }) === null);
  check('H9 a missing author is rejected', parseDocumentMeta({ ...valid, sharedBy: '' }) === null);
}

/* ─────────────────────────────── summary ─────────────────────────────── */

console.log(`\n${'─'.repeat(64)}`);
if (failures.length === 0) {
  console.log(`PASS — ${passed} checks passed.`);
} else {
  console.log(`FAIL — ${passed} passed, ${failures.length} failed:`);
  for (const failure of failures) console.log(`  x ${failure}`);
  process.exitCode = 1;
}