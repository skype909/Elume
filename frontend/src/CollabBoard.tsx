import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

let pdfJsLoaderPromise: Promise<any> | null = null;

type ToolKey =
    | "select"
    | "pen"
    | "highlighter"
    | "eraser"
    | "rectangle"
    | "circle"
    | "triangle"
    | "sticky"
    | "arrow"
    | "curved-arrow"
    | "speech";

type StrokePoint = {
    x: number;
    y: number;
};

type Stroke = {
    id: string;
    tool: "pen" | "highlighter";
    color: string;
    size: number;
    points: StrokePoint[];
    createdBy: string;
};

type BoardObjectType =
    | "rectangle"
    | "circle"
    | "triangle"
    | "sticky"
    | "arrow"
    | "curved-arrow"
    | "speech"
    | "image";

type BoardObject = {
    id: string;
    type: BoardObjectType;
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    fill?: string;
    src?: string;
    createdBy: string;
    updatedAt: number;
};

type BoardSnapshot = {
    strokes: Stroke[];
    objects: BoardObject[];
};

type SocketPayload =
    | { type: "stroke"; stroke: Stroke }
    | { type: "stroke-progress"; stroke: Stroke }
    | { type: "cursor"; x: number; y: number; size: number }
    | { type: "clear-preview" }
    | { type: "ping" }
    | { type: "pong" }
    | { type: "object-create"; object: BoardObject }
    | { type: "object-update"; object: BoardObject }
    | { type: "object-delete"; id: string }
    | { type: "snapshot-sync"; snapshot: BoardSnapshot; sourceId: string };

type NoteItem = {
    id: number;
    filename: string;
    file_url: string;
};

type Props = {
    sessionCode: string;
    roomKey: string;
    participantId: string;
    tool: ToolKey;
    penColor: string;
    penSize: number;
    highlighterColor: string;
    eraserSize: number;
    height?: number;
    onUndoReady?: (undoFn: () => void) => void;
    onExportReady?: (exportFn: () => Promise<void>) => void;
    readOnly?: boolean;
    classId?: string;
    apiBase?: string;
    apiFetch?: (url: string, init?: RequestInit) => Promise<any>;
    pdfImportRequestNonce?: number;
    viewportMode?: "fixed" | "pan";
    boardWidth?: number;
    boardHeight?: number;
};

type Interaction =
    | { mode: "idle" }
    | { mode: "drawing" }
    | { mode: "erasing" }
    | {
        mode: "creating-object";
        objectId: string;
        startX: number;
        startY: number;
    }
    | {
        mode: "moving-object";
        objectId: string;
        offsetX: number;
        offsetY: number;
    }
    | {
        mode: "resizing-object";
        objectId: string;
        startX: number;
        startY: number;
        startW: number;
        startH: number;
    };

function uid(prefix = "id") {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function getWsBase() {
    const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

    if (isLocal) return "ws://127.0.0.1:8000";

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
}

function getPointFromEvent(
    e: PointerEvent | React.PointerEvent,
    el: HTMLDivElement
): StrokePoint {
    const rect = el.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
}

function clampSize(n: number, min = 20) {
    return Math.max(min, n);
}

function normaliseRect(x: number, y: number, w: number, h: number) {
    let nx = x;
    let ny = y;
    let nw = w;
    let nh = h;

    if (nw < 0) {
        nx = x + nw;
        nw = Math.abs(nw);
    }
    if (nh < 0) {
        ny = y + nh;
        nh = Math.abs(nh);
    }

    return { x: nx, y: ny, w: nw, h: nh };
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    if (!stroke.points.length) return;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.tool === "highlighter" ? 0.28 : 1;

    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    ctx.stroke();
    ctx.restore();
}

function pointToSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
) {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);

    const t = Math.max(
        0,
        Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
    );
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
}

function canEdit(createdBy: string, currentUser: string) {
    return currentUser === "teacher" || createdBy === currentUser;
}

function objectContainsPoint(obj: BoardObject, pt: StrokePoint) {
    return (
        pt.x >= obj.x &&
        pt.x <= obj.x + obj.w &&
        pt.y >= obj.y &&
        pt.y <= obj.y + obj.h
    );
}

function findTopObjectAtPoint(objects: BoardObject[], pt: StrokePoint) {
    for (let i = objects.length - 1; i >= 0; i--) {
        if (objectContainsPoint(objects[i], pt)) return objects[i];
    }
    return null;
}

function getObjectDefaultFill(type: BoardObjectType) {
    if (type === "sticky") return "#FDE68A";
    if (type === "speech") return "#ffffff";
    return "transparent";
}


export default function CollabBoard({
    sessionCode,
    roomKey,
    participantId,
    tool,
    penColor,
    penSize,
    highlighterColor,
    eraserSize,
    height = 720,
    onUndoReady,
    onExportReady,
    readOnly = false,
    classId,
    apiBase,
    apiFetch,
    pdfImportRequestNonce,
    viewportMode = "fixed",
    boardWidth,
    boardHeight,
}: Props) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const committedCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const connectionVersionRef = useRef(0);
    const editable = !readOnly;

    const [isConnected, setIsConnected] = useState(false);
    const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
    const [objects, setObjects] = useState<BoardObject[]>([]);
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
    const [importList, setImportList] = useState<Array<{ kind: "notes" | "exam"; item: NoteItem }>>([]);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importedPdf, setImportedPdf] = useState<{ kind: "notes" | "exam"; item: NoteItem } | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showPdfPanel, setShowPdfPanel] = useState(false);
    const [pdfPageNum, setPdfPageNum] = useState(1);
    const [pdfNumPages, setPdfNumPages] = useState(1);
    const [pdfViewScale, setPdfViewScale] = useState(1);
    const [pdfInsertScale, setPdfInsertScale] = useState(1);
    const [pdfCanvasSize, setPdfCanvasSize] = useState({ w: 0, h: 0 });
    const [clipRect, setClipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [snipMode, setSnipMode] = useState(false);

    const strokesRef = useRef<Stroke[]>([]);
    const liveStrokeRef = useRef<Stroke | null>(null);
    const interactionRef = useRef<Interaction>({ mode: "idle" });
    const historyRef = useRef<BoardSnapshot[]>([]);
    const remotePreviewStrokesRef = useRef<Map<string, Stroke>>(new Map());
    const eraserGestureSnapshotTakenRef = useRef(false);
    const activePointerIdRef = useRef<number | null>(null);
    const liveStrokeBroadcastRef = useRef(0);
    const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pdfViewerRef = useRef<HTMLDivElement | null>(null);
    const pdfOverlayRef = useRef<HTMLDivElement | null>(null);
    const pdfDocRef = useRef<any>(null);
    const pdfUrlRef = useRef<string | null>(null);
    const pdfBlobUrlRef = useRef<string | null>(null);
    const pdfSourceUrlRef = useRef<string | null>(null);
    const pdfRenderTokenRef = useRef(0);
    const pdfRenderTaskRef = useRef<any>(null);
    const clipDragRef = useRef(false);
    const clipStartRef = useRef<{ x: number; y: number } | null>(null);
    const pdfImportNonceRef = useRef<number | undefined>(undefined);
    const hasSeenPdfImportNonceRef = useRef(false);
    const pdfPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
        active: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    });
    const boardPanRef = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
        active: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0,
    });


    const boardLabel = useMemo(() => `${sessionCode} / ${roomKey}`, [sessionCode, roomKey]);
    const canLoadPdfImports = Boolean(editable && classId && apiBase && apiFetch);
    const resolvedBoardWidth = boardWidth ?? 1600;
    const resolvedBoardHeight = boardHeight ?? height;
    const isPannableViewport = readOnly && viewportMode === "pan";
    const backgroundObjects = useMemo(
        () => objects.filter((obj) => obj.type === "image" && obj.id !== selectedObjectId),
        [objects, selectedObjectId]
    );
    const foregroundObjects = useMemo(
        () => objects.filter((obj) => obj.type !== "image" || obj.id === selectedObjectId),
        [objects, selectedObjectId]
    );

    function resolveFileUrl(fileUrl: string): string {
        if (!fileUrl) return fileUrl;
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;

        const base = (apiBase || "").replace(/\/$/, "");
        if (!base) return fileUrl;
        if (fileUrl.startsWith("/")) return `${base}${fileUrl}`;
        return `${base}/${fileUrl}`;
    }

    async function loadPdfJs(): Promise<any> {
        const win = window as any;
        if (win.pdfjsLib) {
            win.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
            return win.pdfjsLib;
        }

        if (!pdfJsLoaderPromise) {
            pdfJsLoaderPromise = new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
                script.async = true;
                script.onload = () => resolve();
                script.onerror = () => reject(new Error("Failed to load PDF.js"));
                document.head.appendChild(script);
            }).then(() => {
                const lib = (window as any).pdfjsLib;
                if (!lib) throw new Error("PDF.js not available after load");
                lib.GlobalWorkerOptions.workerSrc =
                    "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
                return lib;
            });
        }

        return pdfJsLoaderPromise;
    }

    async function getAuthenticatedPdfUrl(fileUrl: string): Promise<string> {
        const resolvedUrl = resolveFileUrl(fileUrl);
        if (!resolvedUrl) throw new Error("Missing PDF URL");

        if (pdfBlobUrlRef.current && pdfSourceUrlRef.current === resolvedUrl) {
            return pdfBlobUrlRef.current;
        }

        if (pdfBlobUrlRef.current) {
            window.URL.revokeObjectURL(pdfBlobUrlRef.current);
            pdfBlobUrlRef.current = null;
        }

        pdfSourceUrlRef.current = resolvedUrl;

        let blob: Blob;
        if (apiFetch) {
            const token = (() => {
                try {
                    return localStorage.getItem("elume_token");
                } catch {
                    return null;
                }
            })();

            const headers = new Headers();
            if (token) {
                headers.set("Authorization", `Bearer ${token}`);
            }

            const res = await fetch(resolvedUrl, { method: "GET", headers });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `Request failed (${res.status})`);
            }
            blob = await res.blob();
        } else {
            const token = (() => {
                try {
                    return localStorage.getItem("elume_token");
                } catch {
                    return null;
                }
            })();

            const headers = new Headers();
            if (token) {
                headers.set("Authorization", `Bearer ${token}`);
            }

            const res = await fetch(resolvedUrl, { method: "GET", headers });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(text || `Request failed (${res.status})`);
            }
            blob = await res.blob();
        }

        const blobUrl = window.URL.createObjectURL(blob);
        pdfBlobUrlRef.current = blobUrl;
        pdfSourceUrlRef.current = resolvedUrl;
        return blobUrl;
    }

    function sendWsMessage(payload: SocketPayload) {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify(payload));
    }

    function broadcastObjectCreate(object: BoardObject) {
        sendWsMessage({ type: "object-create", object });
    }

    function broadcastObjectUpdate(object: BoardObject) {
        sendWsMessage({ type: "object-update", object });
    }

    function broadcastObjectDelete(id: string) {
        sendWsMessage({ type: "object-delete", id });
    }

    function broadcastSnapshotSync(snapshot: BoardSnapshot) {
        sendWsMessage({
            type: "snapshot-sync",
            snapshot,
            sourceId: participantId,
        });
    }

    function cloneStroke(stroke: Stroke): Stroke {
        return {
            ...stroke,
            points: stroke.points.map((p) => ({ ...p })),
        };
    }

    function cloneObject(obj: BoardObject): BoardObject {
        return { ...obj };
    }

    function createSnapshot(): BoardSnapshot {
        return {
            strokes: strokesRef.current.map(cloneStroke),
            objects: objects.map(cloneObject),
        };
    }

    function pushHistorySnapshot(snapshot?: BoardSnapshot) {
        historyRef.current.push(snapshot ?? createSnapshot());
        if (historyRef.current.length > 50) {
            historyRef.current.shift();
        }
    }

    const redrawCommitted = useCallback(() => {
        const committed = committedCanvasRef.current;
        if (!committed) return;

        const ctx = committed.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, committed.width || 0, committed.height || 0);

        for (const stroke of strokesRef.current) {
            drawStroke(ctx, stroke);
        }
    }, []);

    const clearPreview = useCallback(() => {
        const preview = previewCanvasRef.current;
        if (!preview) return;

        const ctx = preview.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, preview.width || 0, preview.height || 0);
    }, []);

    const clearBoardState = useCallback((shouldBroadcast: boolean) => {
        strokesRef.current = [];
        remotePreviewStrokesRef.current.clear();
        liveStrokeRef.current = null;
        historyRef.current = [];
        setObjects([]);
        setSelectedObjectId(null);
        redrawCommitted();
        clearPreview();

        if (shouldBroadcast && editable) {
            broadcastSnapshotSync({ strokes: [], objects: [] });
        }
    }, [clearPreview, editable, redrawCommitted]);

    function restoreSnapshot(snapshot: BoardSnapshot) {
        strokesRef.current = snapshot.strokes.map(cloneStroke);
        setObjects(snapshot.objects.map(cloneObject));
        redrawCommitted();
        clearPreview();
        setSelectedObjectId(null);
    }

    function undoLastAction() {
        const previous = historyRef.current.pop();
        if (!previous) return;

        restoreSnapshot(previous);
        broadcastSnapshotSync(previous);
    }


    function cancelActiveInteraction() {
        liveStrokeRef.current = null;
        interactionRef.current = { mode: "idle" };
        eraserGestureSnapshotTakenRef.current = false;
        activePointerIdRef.current = null;
        clearPreview();
        setCursor(null);
    }


    const syncCanvasSize = useCallback(() => {
        const container = containerRef.current;
        const committed = committedCanvasRef.current;
        const preview = previewCanvasRef.current;
        if (!container || !committed || !preview) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = isPannableViewport ? resolvedBoardWidth : container.clientWidth;
        const boardPixelHeight = isPannableViewport ? resolvedBoardHeight : height;

        committed.width = Math.floor(width * dpr);
        committed.height = Math.floor(boardPixelHeight * dpr);
        preview.width = Math.floor(width * dpr);
        preview.height = Math.floor(boardPixelHeight * dpr);

        committed.style.width = `${width}px`;
        committed.style.height = `${boardPixelHeight}px`;
        preview.style.width = `${width}px`;
        preview.style.height = `${boardPixelHeight}px`;

        const cctx = committed.getContext("2d");
        const pctx = preview.getContext("2d");
        if (!cctx || !pctx) return;

        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        redrawCommitted();
        clearPreview();
    }, [clearPreview, height, isPannableViewport, redrawCommitted, resolvedBoardHeight, resolvedBoardWidth]);

    function drawShapePreview(obj: BoardObject) {
        const preview = previewCanvasRef.current;
        const container = containerRef.current;
        if (!preview || !container) return;

        const ctx = preview.getContext("2d");
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        ctx.save();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        if (obj.type === "rectangle" || obj.type === "sticky" || obj.type === "speech") {
            ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        } else if (obj.type === "circle") {
            ctx.beginPath();
            ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.w / 2, obj.h / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (obj.type === "triangle") {
            ctx.beginPath();
            ctx.moveTo(obj.x + obj.w / 2, obj.y);
            ctx.lineTo(obj.x + obj.w, obj.y + obj.h);
            ctx.lineTo(obj.x, obj.y + obj.h);
            ctx.closePath();
            ctx.stroke();
        } else if (obj.type === "arrow") {
            ctx.beginPath();
            ctx.moveTo(obj.x, obj.y + obj.h / 2);
            ctx.lineTo(obj.x + obj.w, obj.y + obj.h / 2);
            ctx.stroke();
        } else if (obj.type === "curved-arrow") {
            ctx.beginPath();
            ctx.moveTo(obj.x, obj.y + obj.h);
            ctx.quadraticCurveTo(obj.x + obj.w / 2, obj.y - obj.h * 0.3, obj.x + obj.w, obj.y + obj.h / 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawPreviewStroke() {
        const preview = previewCanvasRef.current;
        const container = containerRef.current;
        if (!preview || !container) return;

        const ctx = preview.getContext("2d");
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        if (liveStrokeRef.current) {
            drawStroke(ctx, liveStrokeRef.current);
        }

        for (const remoteStroke of remotePreviewStrokesRef.current.values()) {
            drawStroke(ctx, remoteStroke);
        }

        for (const remoteStroke of remotePreviewStrokesRef.current.values()) {
            drawStroke(ctx, remoteStroke);
        }

        if (tool === "eraser" && cursor) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cursor.x, cursor.y, eraserSize * 7, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(30,41,59,0.85)";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    }

    function commitLiveStroke() {
        if (!liveStrokeRef.current) return;

        pushHistorySnapshot();

        strokesRef.current.push(liveStrokeRef.current);
        remotePreviewStrokesRef.current.delete(liveStrokeRef.current.id);
        redrawCommitted();

        sendWsMessage({
            type: "stroke",
            stroke: liveStrokeRef.current,
        });

        liveStrokeRef.current = null;
        clearPreview();
    }

    function beginStroke(pt: StrokePoint) {
        const stroke: Stroke = {
            id: uid("stroke"),
            tool: tool === "highlighter" ? "highlighter" : "pen",
            color: tool === "highlighter" ? highlighterColor : penColor,
            size: tool === "highlighter" ? penSize * 8 : penSize * 2,
            points: [pt],
            createdBy: participantId,
        };
        liveStrokeRef.current = stroke;
        liveStrokeBroadcastRef.current = 0;
        drawPreviewStroke();
    }

    function extendStroke(pt: StrokePoint) {
        if (!liveStrokeRef.current) return;
        liveStrokeRef.current.points.push(pt);
        const now = Date.now();
        if (now - liveStrokeBroadcastRef.current >= 50) {
            liveStrokeBroadcastRef.current = now;
            sendWsMessage({
                type: "stroke-progress",
                stroke: cloneStroke(liveStrokeRef.current),
            });
        }
        drawPreviewStroke();
    }

    function updateObjectLocalAndBroadcast(nextObject: BoardObject) {
        setObjects((prev) =>
            prev.map((obj) => (obj.id === nextObject.id ? nextObject : obj))
        );
        broadcastObjectUpdate(nextObject);
    }

    function insertImageObject(src: string, x = 48, y = 48, w = 320, h = 220) {
        if (!editable) return;

        const obj: BoardObject = {
            id: uid("obj"),
            type: "image",
            x,
            y,
            w,
            h,
            src,
            createdBy: participantId,
            updatedAt: Date.now(),
        };

        pushHistorySnapshot();
        setObjects((prev) => [...prev, obj]);
        setSelectedObjectId(obj.id);
        broadcastObjectCreate(obj);
    }

    async function loadImportList() {
        if (!canLoadPdfImports) {
            setImportError("PDF import is not configured for this board yet.");
            setImportLoading(false);
            return;
        }

        setImportLoading(true);
        setImportError(null);
        try {
            const fetcher = apiFetch!;
            const [notes, exam] = await Promise.all([
                fetcher(`${apiBase}/notes/${classId}?kind=notes`),
                fetcher(`${apiBase}/notes/${classId}?kind=exam`),
            ]);

            const combined = [
                ...(Array.isArray(notes) ? notes : []).map((item: NoteItem) => ({ kind: "notes" as const, item })),
                ...(Array.isArray(exam) ? exam : []).map((item: NoteItem) => ({ kind: "exam" as const, item })),
            ];

            setImportList(combined);
        } catch {
            setImportError("Could not load PDFs.");
        } finally {
            setImportLoading(false);
        }
    }

    function eraseAtPoint(pt: StrokePoint) {
        const threshold = eraserSize * 8;

        if (!eraserGestureSnapshotTakenRef.current) {
            pushHistorySnapshot();
            eraserGestureSnapshotTakenRef.current = true;
        }

        let deletedObjectId: string | null = null;

        setObjects((prev) => {
            const hit = [...prev]
                .reverse()
                .find((obj) => objectContainsPoint(obj, pt) && canEdit(obj.createdBy, participantId));

            if (!hit) return prev;

            deletedObjectId = hit.id;
            return prev.filter((obj) => obj.id !== hit.id);
        });

        if (deletedObjectId) {
            broadcastObjectDelete(deletedObjectId);
            return;
        }

        const before = strokesRef.current.length;

        strokesRef.current = strokesRef.current.filter((stroke) => {
            if (!canEdit(stroke.createdBy, participantId)) return true;
            if (stroke.points.length < 2) return true;

            let hitCount = 0;

            for (let i = 1; i < stroke.points.length; i++) {
                const a = stroke.points[i - 1];
                const b = stroke.points[i];
                const d = pointToSegmentDistance(pt.x, pt.y, a.x, a.y, b.x, b.y);
                if (d <= threshold) {
                    hitCount++;
                }
            }

            return hitCount < 3;
        });

        if (strokesRef.current.length !== before) {
            redrawCommitted();
            broadcastSnapshotSync(createSnapshot());
        }
    }

    function makeObject(type: BoardObjectType, pt: StrokePoint): BoardObject {
        const baseW =
            type === "sticky" ? 180 : type === "arrow" || type === "curved-arrow" ? 120 : 120;
        const baseH =
            type === "sticky" ? 120 : type === "arrow" ? 40 : type === "curved-arrow" ? 80 : 90;

        return {
            id: uid("obj"),
            type,
            x: pt.x,
            y: pt.y,
            w: baseW,
            h: baseH,
            text: type === "sticky" ? "Type here..." : type === "speech" ? "Speech..." : "",
            fill: getObjectDefaultFill(type),
            createdBy: participantId,
            updatedAt: Date.now(),
        };
    }

    async function exportBoardAsPng() {
        const node = containerRef.current;
        if (!node) return;

        const dataUrl = await toPng(node, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: "#ffffff",
        });

        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `collab-${sessionCode}-${roomKey}.png`;
        link.click();
    }

    async function renderPdfToViewer(pageNum: number) {
        if (!importedPdf || !showPdfPanel) return;

        const canvas = pdfCanvasRef.current;
        const viewer = pdfViewerRef.current;
        if (!canvas || !viewer) return;

        const renderToken = ++pdfRenderTokenRef.current;
        if (pdfRenderTaskRef.current?.cancel) {
            try {
                pdfRenderTaskRef.current.cancel();
            } catch { }
        }
        pdfRenderTaskRef.current = null;

        const pdfjsLib = await loadPdfJs();
        const pdfUrl = await getAuthenticatedPdfUrl(importedPdf.item.file_url);
        if (!pdfUrl) throw new Error("Missing PDF URL");

        if (!pdfDocRef.current || pdfUrlRef.current !== pdfUrl) {
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            pdfDocRef.current = await loadingTask.promise;
            pdfUrlRef.current = pdfUrl;
        }

        const pdfDoc = pdfDocRef.current;
        const safePage = Math.max(1, Math.min(pageNum, pdfDoc.numPages || 1));
        const page = await pdfDoc.getPage(safePage);
        const viewport1 = page.getViewport({ scale: 1 });
        const parentW = Math.max(320, viewer.clientWidth - 24);
        const fitScale = (parentW / viewport1.width) * pdfViewScale;
        const viewport = page.getViewport({ scale: fitScale });

        if (renderToken !== pdfRenderTokenRef.current) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        setPdfCanvasSize((prev) =>
            prev.w === viewport.width && prev.h === viewport.height
                ? prev
                : { w: viewport.width, h: viewport.height }
        );

        const renderTask = page.render({ canvasContext: ctx, viewport });
        pdfRenderTaskRef.current = renderTask;
        try {
            await renderTask.promise;
        } catch (error: any) {
            if (error?.name === "RenderingCancelledException") return;
            throw error;
        }

        if (renderToken !== pdfRenderTokenRef.current) return;

        pdfRenderTaskRef.current = null;
        setPdfNumPages(pdfDoc.numPages || 1);
        setPdfPageNum(safePage);
        setClipRect(null);
    }

    async function insertPdfPage1() {
        if (!importedPdf) return;

        try {
            const pdfjsLib = await loadPdfJs();
            const pdfUrl = await getAuthenticatedPdfUrl(importedPdf.item.file_url);
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            const pdfDoc = await loadingTask.promise;
            const page = await pdfDoc.getPage(1);

            const boardW = Math.max(320, (containerRef.current?.clientWidth || 720) - 40);
            const viewport1 = page.getViewport({ scale: 1 });
            const fitScale = (Math.min(boardW, 900) / viewport1.width) * pdfInsertScale;
            const viewport = page.getViewport({ scale: fitScale });

            const temp = document.createElement("canvas");
            temp.width = Math.floor(viewport.width);
            temp.height = Math.floor(viewport.height);
            const tempCtx = temp.getContext("2d");
            if (!tempCtx) throw new Error("Canvas unavailable");

            await page.render({ canvasContext: tempCtx, viewport }).promise;

            const maxWidth = Math.max(220, boardW);
            const wCss = Math.min(maxWidth, viewport.width);
            const hCss = (viewport.height / viewport.width) * wCss;
            insertImageObject(temp.toDataURL("image/png"), 20, 20, wCss, hCss);
        } catch {
            alert("Could not insert that PDF page.");
        }
    }

    function overlayXY(e: React.PointerEvent<HTMLDivElement>) {
        const el = pdfOverlayRef.current;
        if (!el) return { x: 0, y: 0 };
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        return { x, y };
    }

    function onClipDown(e: React.PointerEvent<HTMLDivElement>) {
        const pt = overlayXY(e);
        clipDragRef.current = true;
        clipStartRef.current = pt;
        setClipRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }

    function onClipMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!clipDragRef.current || !clipStartRef.current) return;
        const pt = overlayXY(e);
        const start = clipStartRef.current;
        const x = Math.min(start.x, pt.x);
        const y = Math.min(start.y, pt.y);
        const w = Math.abs(pt.x - start.x);
        const h = Math.abs(pt.y - start.y);
        setClipRect({ x, y, w, h });
    }

    function onClipUp() {
        clipDragRef.current = false;
        clipStartRef.current = null;
    }

    function onPdfViewerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (snipMode) return;
        const viewer = pdfViewerRef.current;
        if (!viewer) return;
        pdfPanRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: viewer.scrollLeft,
            scrollTop: viewer.scrollTop,
        };
        viewer.setPointerCapture?.(e.pointerId);
    }

    function onPdfViewerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (snipMode || !pdfPanRef.current.active) return;
        const viewer = pdfViewerRef.current;
        if (!viewer) return;
        viewer.scrollLeft = pdfPanRef.current.scrollLeft - (e.clientX - pdfPanRef.current.startX);
        viewer.scrollTop = pdfPanRef.current.scrollTop - (e.clientY - pdfPanRef.current.startY);
    }

    function onPdfViewerPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
        const viewer = pdfViewerRef.current;
        if (viewer) {
            try {
                viewer.releasePointerCapture?.(e.pointerId);
            } catch { }
        }
        pdfPanRef.current.active = false;
    }

    function onBoardViewportPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (!isPannableViewport) return;
        const viewport = viewportRef.current;
        if (!viewport) return;

        boardPanRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
        };
        viewport.setPointerCapture?.(e.pointerId);
    }

    function onBoardViewportPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!isPannableViewport || !boardPanRef.current.active) return;
        const viewport = viewportRef.current;
        if (!viewport) return;

        viewport.scrollLeft = boardPanRef.current.scrollLeft - (e.clientX - boardPanRef.current.startX);
        viewport.scrollTop = boardPanRef.current.scrollTop - (e.clientY - boardPanRef.current.startY);
    }

    function onBoardViewportPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
        const viewport = viewportRef.current;
        if (viewport) {
            try {
                viewport.releasePointerCapture?.(e.pointerId);
            } catch { }
        }
        boardPanRef.current.active = false;
    }

    function closePdfImport() {
        pdfRenderTokenRef.current += 1;
        if (pdfRenderTaskRef.current?.cancel) {
            try {
                pdfRenderTaskRef.current.cancel();
            } catch { }
        }
        pdfRenderTaskRef.current = null;
        const canvas = pdfCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        }
        setShowPdfPanel(false);
        setShowImportModal(false);
        setImportedPdf(null);
        setSnipMode(false);
        setClipRect(null);
    }

    async function snipToBoardAndClose() {
        if (!clipRect) return;

        const src = pdfCanvasRef.current;
        if (!src) return;

        const min = 12;
        if (clipRect.w < min || clipRect.h < min) {
            alert("Selection is too small.");
            return;
        }

        const scaleX = src.width / Math.max(pdfCanvasSize.w || 1, 1);
        const scaleY = src.height / Math.max(pdfCanvasSize.h || 1, 1);

        const crop = document.createElement("canvas");
        crop.width = Math.floor(clipRect.w * scaleX);
        crop.height = Math.floor(clipRect.h * scaleY);
        const cropCtx = crop.getContext("2d");
        if (!cropCtx) return;

        cropCtx.drawImage(
            src,
            clipRect.x * scaleX,
            clipRect.y * scaleY,
            clipRect.w * scaleX,
            clipRect.h * scaleY,
            0,
            0,
            crop.width,
            crop.height
        );

        const boardW = Math.max(260, (containerRef.current?.clientWidth || 720) - 40);
        const w = Math.min(boardW, clipRect.w);
        const h = (clipRect.h / clipRect.w) * w;
        insertImageObject(crop.toDataURL("image/png"), 20, 20, w, h);
        closePdfImport();
    }

    useEffect(() => {
        syncCanvasSize();
        const onResize = () => syncCanvasSize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [syncCanvasSize]);

    useEffect(() => {
        connectionVersionRef.current += 1;
        const connectionVersion = connectionVersionRef.current;

        clearBoardState(false);

        if (!sessionCode || !roomKey) {
            setIsConnected(false);
            return;
        }

        const ws = new WebSocket(`${getWsBase()}/ws/collab/${sessionCode}/${roomKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            if (connectionVersion !== connectionVersionRef.current) return;
            setIsConnected(true);
            ws.send(JSON.stringify({ type: "ping" }));
        };

        ws.onclose = () => {
            if (connectionVersion !== connectionVersionRef.current) return;
            setIsConnected(false);
        };

        ws.onerror = () => {
            if (connectionVersion !== connectionVersionRef.current) return;
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            if (connectionVersion !== connectionVersionRef.current) return;
            try {
                const data = JSON.parse(event.data) as SocketPayload;

                if (data.type === "stroke" && data.stroke) {
                    const incoming = data.stroke;
                    if (!readOnly && incoming.createdBy === participantId) return;
                    remotePreviewStrokesRef.current.delete(incoming.id);
                    strokesRef.current.push(incoming);
                    redrawCommitted();
                    clearPreview();
                    drawPreviewStroke();
                    return;
                }

                if (data.type === "stroke-progress" && data.stroke) {
                    const incoming = data.stroke;
                    if (incoming.createdBy === participantId) return;
                    remotePreviewStrokesRef.current.set(incoming.id, incoming);
                    drawPreviewStroke();
                    return;
                }

                if (data.type === "object-create" && data.object) {
                    const incoming = data.object;
                    if (!readOnly && incoming.createdBy === participantId) return;

                    setObjects((prev) => {
                        const exists = prev.some((obj) => obj.id === incoming.id);
                        if (exists) return prev;
                        return [...prev, incoming];
                    });
                    return;
                }

                if (data.type === "object-update" && data.object) {
                    const incoming = data.object;
                    if (!readOnly && incoming.createdBy === participantId) return;

                    setObjects((prev) =>
                        prev.map((obj) => {
                            if (obj.id !== incoming.id) return obj;
                            if ((obj.updatedAt || 0) > (incoming.updatedAt || 0)) return obj;
                            return incoming;
                        })
                    );
                    return;
                }

                if (data.type === "object-delete" && data.id) {
                    setObjects((prev) => prev.filter((obj) => obj.id !== data.id));
                    return;
                }

                if (data.type === "clear-preview") {
                    clearPreview();
                    drawPreviewStroke();
                    return;
                }

                if (data.type === "snapshot-sync" && data.snapshot) {
                    if (data.sourceId === participantId) return;

                    strokesRef.current = data.snapshot.strokes.map(cloneStroke);
                    remotePreviewStrokesRef.current.clear();
                    setObjects(data.snapshot.objects.map(cloneObject));
                    redrawCommitted();
                    clearPreview();
                    setSelectedObjectId(null);
                    return;
                }

            } catch {
                // ignore malformed packets
            }
        };

        return () => {
            remotePreviewStrokesRef.current.clear();
            ws.close();
        };
    }, [clearBoardState, clearPreview, drawPreviewStroke, participantId, readOnly, redrawCommitted, roomKey, sessionCode]);

    useEffect(() => {
        if (!onUndoReady) return;
        onUndoReady(undoLastAction);
    }, [onUndoReady]);

    useEffect(() => {
        if (!onExportReady) return;
        onExportReady(exportBoardAsPng);
    }, [onExportReady, sessionCode, roomKey]);

    useEffect(() => {
        function onClearBoard(event: Event) {
            const detail = (event as CustomEvent<{ roomKey?: string; nonce?: number }>).detail;
            if (!detail?.roomKey || detail.roomKey !== roomKey) return;
            clearBoardState(true);
        }

        window.addEventListener("collab-clear-board", onClearBoard as EventListener);
        return () => window.removeEventListener("collab-clear-board", onClearBoard as EventListener);
    }, [clearBoardState, roomKey]);

    useEffect(() => {
        if (pdfRenderTaskRef.current?.cancel) {
            try {
                pdfRenderTaskRef.current.cancel();
            } catch { }
        }
        pdfRenderTaskRef.current = null;
        pdfRenderTokenRef.current += 1;
        pdfDocRef.current = null;
        pdfUrlRef.current = null;
        if (pdfBlobUrlRef.current) {
            window.URL.revokeObjectURL(pdfBlobUrlRef.current);
            pdfBlobUrlRef.current = null;
        }
        pdfSourceUrlRef.current = null;
    }, [importedPdf]);

    useEffect(() => {
        return () => {
            if (pdfRenderTaskRef.current?.cancel) {
                try {
                    pdfRenderTaskRef.current.cancel();
                } catch { }
            }
            pdfRenderTaskRef.current = null;
            if (pdfBlobUrlRef.current) {
                window.URL.revokeObjectURL(pdfBlobUrlRef.current);
                pdfBlobUrlRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!editable || pdfImportRequestNonce == null) return;
        if (!hasSeenPdfImportNonceRef.current) {
            hasSeenPdfImportNonceRef.current = true;
            pdfImportNonceRef.current = pdfImportRequestNonce;
            return;
        }
        if (pdfImportNonceRef.current === pdfImportRequestNonce) return;
        pdfImportNonceRef.current = pdfImportRequestNonce;
        setShowImportModal(true);
        setShowPdfPanel(false);
        setSnipMode(false);
        setClipRect(null);
    }, [editable, pdfImportRequestNonce]);

    useEffect(() => {
        if (showImportModal) return;
        if (pdfRenderTaskRef.current?.cancel) {
            try {
                pdfRenderTaskRef.current.cancel();
            } catch { }
        }
        pdfRenderTaskRef.current = null;
    }, [showImportModal]);

    useEffect(() => {
        if (!editable) return;

        function handlePaste(event: Event) {
            const clipboardEvent = event as ClipboardEvent;
            const items = clipboardEvent.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (!item.type.startsWith("image/")) continue;

                const file = item.getAsFile();
                if (!file) continue;

                const reader = new FileReader();
                reader.onload = () => {
                    if (typeof reader.result === "string") {
                        insertImageObject(reader.result);
                    }
                };
                reader.readAsDataURL(file);
                clipboardEvent.preventDefault();
                return;
            }
        }

        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [editable, participantId]);

    useEffect(() => {
        if (!showImportModal || !canLoadPdfImports || importList.length > 0 || importLoading) return;
        void loadImportList();
    }, [showImportModal, canLoadPdfImports, importList.length, importLoading, classId, apiBase, apiFetch]);

    useEffect(() => {
        if (!importedPdf || !showPdfPanel) return;

        const frame = window.requestAnimationFrame(() => {
            void renderPdfToViewer(pdfPageNum);
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [importedPdf, showPdfPanel, pdfPageNum, pdfViewScale]);


    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        const container = containerRef.current;
        if (!container) return;
        if (!editable) return;

        if (e.pointerType === "touch" && !e.isPrimary) {
            cancelActiveInteraction();
            return;
        }

        if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) {
            cancelActiveInteraction();
            return;
        }

        activePointerIdRef.current = e.pointerId;

        const pt = getPointFromEvent(e, container);


        setCursor(tool === "eraser" ? { x: pt.x, y: pt.y, size: eraserSize } : null);

        if (tool === "select") {
            const hitObject = findTopObjectAtPoint(objects, pt);
            if (!hitObject) {
                setSelectedObjectId(null);
            }
            interactionRef.current = { mode: "idle" };
            return;
        }

        if (!isConnected) return;

        if (tool === "pen" || tool === "highlighter") {
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
            interactionRef.current = { mode: "drawing" };
            beginStroke(pt);
            return;
        }

        if (tool === "eraser") {
            (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
            interactionRef.current = { mode: "erasing" };
            eraserGestureSnapshotTakenRef.current = false;
            eraseAtPoint(pt);
            drawPreviewStroke();
            return;
        }

        const objectType = tool as BoardObjectType;
        const obj = makeObject(objectType, pt);

        if (tool === "sticky") {
            pushHistorySnapshot();
            setObjects((prev) => [...prev, obj]);
            setSelectedObjectId(obj.id);
            broadcastObjectCreate(obj);
            interactionRef.current = { mode: "idle" };
            return;
        }

        pushHistorySnapshot();

        const draftObj = { ...obj, w: 1, h: 1, updatedAt: Date.now() };
        setObjects((prev) => [...prev, draftObj]);
        setSelectedObjectId(draftObj.id);

        interactionRef.current = {
            mode: "creating-object",
            objectId: draftObj.id,
            startX: pt.x,
            startY: pt.y,
        };
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const container = containerRef.current;
        if (!container) return;

        if (activePointerIdRef.current !== e.pointerId) return;

        const pt = getPointFromEvent(e, container);


        if (tool === "eraser") {
            setCursor({ x: pt.x, y: pt.y, size: eraserSize });

            if (interactionRef.current.mode === "erasing") {
                eraseAtPoint(pt);
            }

            drawPreviewStroke();
            return;
        }

        if (interactionRef.current.mode === "drawing") {
            extendStroke(pt);
            return;
        }

        if (interactionRef.current.mode === "creating-object") {
            const { objectId, startX, startY } = interactionRef.current;
            const rect = normaliseRect(startX, startY, pt.x - startX, pt.y - startY);
            const nextObj = {
                x: rect.x,
                y: rect.y,
                w: clampSize(rect.w, 16),
                h: clampSize(rect.h, 16),
                updatedAt: Date.now(),
            };

            setObjects((prev) =>
                prev.map((obj) =>
                    obj.id === objectId
                        ? {
                            ...obj,
                            ...nextObj,
                        }
                        : obj
                )
            );

            const previewObj = objects.find((o) => o.id === objectId);
            if (previewObj) {
                drawShapePreview({
                    ...previewObj,
                    ...nextObj,
                });
            }
            return;
        }

        if (interactionRef.current.mode === "moving-object") {
            const { objectId, offsetX, offsetY } = interactionRef.current;

            const currentObj = objects.find((obj) => obj.id === objectId);
            if (!currentObj || !canEdit(currentObj.createdBy, participantId)) return;

            const nextObject: BoardObject = {
                ...currentObj,
                x: pt.x - offsetX,
                y: pt.y - offsetY,
                updatedAt: Date.now(),
            };

            updateObjectLocalAndBroadcast(nextObject);
            return;
        }

        if (interactionRef.current.mode === "resizing-object") {
            const { objectId, startX, startY, startW, startH } = interactionRef.current;
            const dx = pt.x - startX;
            const dy = pt.y - startY;

            const currentObj = objects.find((obj) => obj.id === objectId);
            if (!currentObj || !canEdit(currentObj.createdBy, participantId)) return;

            const nextObject: BoardObject = {
                ...currentObj,
                w: clampSize(startW + dx),
                h: clampSize(startH + dy),
                updatedAt: Date.now(),
            };

            updateObjectLocalAndBroadcast(nextObject);
        }
    }

    function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (activePointerIdRef.current !== e.pointerId) return;

        try {
            containerRef.current?.releasePointerCapture?.(e.pointerId);
        } catch { }

        if (interactionRef.current.mode === "drawing") {
            if (tool === "pen" || tool === "highlighter") {
                commitLiveStroke();
            }
        }

        if (interactionRef.current.mode === "creating-object") {
            const { objectId } = interactionRef.current;
            const createdObj = objects.find((obj) => obj.id === objectId);
            if (createdObj) {
                broadcastObjectCreate({
                    ...createdObj,
                    updatedAt: Date.now(),
                });
            }
        }

        if (interactionRef.current.mode === "erasing") {
            eraserGestureSnapshotTakenRef.current = false;
        }

        interactionRef.current = { mode: "idle" };
        activePointerIdRef.current = null;
        clearPreview();
        setCursor(null);
    }


    function handlePointerLeave(e: React.PointerEvent<HTMLDivElement>) {
        if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

        if (tool === "eraser") {
            setCursor(null);
            clearPreview();
        }
    }

    function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
        if (activePointerIdRef.current !== e.pointerId) return;
        try {
            containerRef.current?.releasePointerCapture?.(e.pointerId);
        } catch { }
        cancelActiveInteraction();
    }



    function startMoveObject(e: React.PointerEvent, obj: BoardObject) {
        const directEditObject =
            obj.type === "sticky" || obj.type === "speech";

        if (tool !== "select" && !directEditObject) return;
        if (!canEdit(obj.createdBy, participantId)) return;

        e.stopPropagation();

        const container = containerRef.current;
        if (!container) return;
        const pt = getPointFromEvent(e, container);

        activePointerIdRef.current = e.pointerId;
        container.setPointerCapture?.(e.pointerId);

        pushHistorySnapshot();

        setSelectedObjectId(obj.id);
        interactionRef.current = {
            mode: "moving-object",
            objectId: obj.id,
            offsetX: pt.x - obj.x,
            offsetY: pt.y - obj.y,
        };
    }

    function startResizeObject(e: React.PointerEvent, obj: BoardObject) {
        const directEditObject =
            obj.type === "sticky" || obj.type === "speech";

        if (tool !== "select" && !directEditObject) return;
        if (!canEdit(obj.createdBy, participantId)) return;

        e.stopPropagation();

        const container = containerRef.current;
        if (!container) return;

        const pt = getPointFromEvent(e, container);

        activePointerIdRef.current = e.pointerId;
        container.setPointerCapture?.(e.pointerId);

        pushHistorySnapshot();

        setSelectedObjectId(obj.id);
        interactionRef.current = {
            mode: "resizing-object",
            objectId: obj.id,
            startX: pt.x,
            startY: pt.y,
            startW: obj.w,
            startH: obj.h,
        };
    }

    function updateStickyText(objectId: string, text: string) {
        const currentObj = objects.find((obj) => obj.id === objectId);
        if (!currentObj) return;

        const nextObject: BoardObject = {
            ...currentObj,
            text,
            updatedAt: Date.now(),
        };

        updateObjectLocalAndBroadcast(nextObject);
    }

    function renderObject(obj: BoardObject) {
        const isSelected = selectedObjectId === obj.id;
        const editable = canEdit(obj.createdBy, participantId);

        const wrapperClass = "absolute select-none shadow-sm";
        const selectedRing = isSelected ? "ring-2 ring-sky-300" : "";

        if (obj.type === "sticky") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                >
                    <div className="relative h-full w-full rounded-xl border border-amber-300 bg-amber-200 shadow-sm">
                        <div
                            className="absolute inset-x-0 top-0 z-10 h-8 cursor-move rounded-t-xl bg-amber-300/40"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                startMoveObject(e, obj);
                            }}
                        />

                        <textarea
                            value={obj.text || ""}
                            onChange={(e) => updateStickyText(obj.id, e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute inset-0 h-full w-full resize-none rounded-xl bg-transparent px-3 pb-3 pt-9 text-sm font-semibold text-slate-800 outline-none"
                        />

                        {isSelected && editable && (
                            <div
                                className="absolute bottom-1 right-1 z-20 h-5 w-5 cursor-se-resize rounded-sm bg-slate-700"
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    startResizeObject(e, obj);
                                }}
                            />
                        )}
                    </div>
                </div>
            );
        }

        if (obj.type === "rectangle") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <div className="relative h-full w-full border-2 border-slate-800 bg-white/40">
                        {isSelected && editable && (
                            <div
                                className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                                onPointerDown={(e) => startResizeObject(e, obj)}
                            />
                        )}
                    </div>
                </div>
            );
        }

        if (obj.type === "circle") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <div className="relative h-full w-full rounded-full border-2 border-slate-800 bg-white/40">
                        {isSelected && editable && (
                            <div
                                className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                                onPointerDown={(e) => startResizeObject(e, obj)}
                            />
                        )}
                    </div>
                </div>
            );
        }

        if (obj.type === "triangle") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <svg className="h-full w-full overflow-visible">
                        <polygon
                            points={`${obj.w / 2},0 ${obj.w},${obj.h} 0,${obj.h}`}
                            fill="rgba(255,255,255,0.4)"
                            stroke="#0f172a"
                            strokeWidth="2"
                        />
                    </svg>
                    {isSelected && editable && (
                        <div
                            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                            onPointerDown={(e) => startResizeObject(e, obj)}
                        />
                    )}
                </div>
            );
        }

        if (obj.type === "arrow") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <svg className="h-full w-full overflow-visible">
                        <line
                            x1="6"
                            y1={obj.h / 2}
                            x2={obj.w - 16}
                            y2={obj.h / 2}
                            stroke="#0f172a"
                            strokeWidth="3"
                        />
                        <polygon
                            points={`${obj.w - 16},${obj.h / 2 - 8} ${obj.w},${obj.h / 2} ${obj.w - 16},${obj.h / 2 + 8}`}
                            fill="#0f172a"
                        />
                    </svg>
                    {isSelected && editable && (
                        <div
                            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                            onPointerDown={(e) => startResizeObject(e, obj)}
                        />
                    )}
                </div>
            );
        }

        if (obj.type === "curved-arrow") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <svg className="h-full w-full overflow-visible">
                        <path
                            d={`M 6 ${obj.h - 8} Q ${obj.w / 2} 0 ${obj.w - 18} ${obj.h / 2}`}
                            fill="none"
                            stroke="#0f172a"
                            strokeWidth="3"
                        />
                        <polygon
                            points={`${obj.w - 22},${obj.h / 2 - 6} ${obj.w},${obj.h / 2} ${obj.w - 14},${obj.h / 2 + 10}`}
                            fill="#0f172a"
                        />
                    </svg>
                    {isSelected && editable && (
                        <div
                            className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                            onPointerDown={(e) => startResizeObject(e, obj)}
                        />
                    )}
                </div>
            );
        }

        if (obj.type === "speech") {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                >
                    <div className="relative h-full w-full rounded-xl border border-sky-200 bg-white shadow-sm">
                        <div
                            className="absolute inset-x-0 top-0 z-10 h-8 cursor-move rounded-t-xl bg-sky-100/60"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                startMoveObject(e, obj);
                            }}
                        />

                        <textarea
                            value={obj.text || ""}
                            onChange={(e) => updateStickyText(obj.id, e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="absolute inset-0 h-full w-full resize-none rounded-xl bg-transparent px-3 pb-3 pt-9 text-sm font-semibold text-slate-800 outline-none"
                            placeholder="Type here..."
                        />

                        {isSelected && editable && (
                            <div
                                className="absolute bottom-1 right-1 z-20 h-5 w-5 cursor-se-resize rounded-sm bg-slate-700"
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    startResizeObject(e, obj);
                                }}
                            />
                        )}
                    </div>
                </div>
            );
        }

        if (obj.type === "image" && obj.src) {
            return (
                <div
                    key={obj.id}
                    className={`${wrapperClass} ${selectedRing}`}
                    style={{ left: obj.x, top: obj.y, width: obj.w, height: obj.h }}
                    onPointerDown={(e) => startMoveObject(e, obj)}
                >
                    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <img
                            src={obj.src}
                            alt=""
                            draggable={false}
                            className="h-full w-full object-contain pointer-events-none"
                        />
                        {isSelected && editable && (
                            <div
                                className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm bg-slate-700"
                                onPointerDown={(e) => startResizeObject(e, obj)}
                            />
                        )}
                    </div>
                </div>
            );
        }

        return null;
    }

    return (
        <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-black text-slate-900">{boardLabel}</div>

                <div className="flex items-center gap-2">
                    {editable && (
                        <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 md:inline-flex">
                            Paste image: Ctrl+V / Cmd+V
                        </div>
                    )}
                    {editable && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowImportModal(true);
                                setShowPdfPanel(false);
                                setSnipMode(false);
                                setClipRect(null);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            Import PDF
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={undoLastAction}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                        Undo
                    </button>

                    <div
                        className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${isConnected
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                    >
                        {isConnected ? "Connected" : "Connecting"}
                    </div>
                </div>
            </div>

            <div
                ref={viewportRef}
                className={isPannableViewport ? "overflow-auto bg-slate-50/60" : ""}
                style={{ height }}
                onPointerDown={isPannableViewport ? onBoardViewportPointerDown : undefined}
                onPointerMove={isPannableViewport ? onBoardViewportPointerMove : undefined}
                onPointerUp={isPannableViewport ? onBoardViewportPointerEnd : undefined}
                onPointerCancel={isPannableViewport ? onBoardViewportPointerEnd : undefined}
            >
                <div
                    ref={containerRef}
                    className="relative touch-none select-none"
                    style={{
                        height: isPannableViewport ? resolvedBoardHeight : height,
                        width: isPannableViewport ? resolvedBoardWidth : "100%",
                        touchAction: "none",
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onPointerLeave={handlePointerLeave}
                >

                    <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:26px_26px]" />

                    <div className="absolute inset-0">{backgroundObjects.map((obj) => renderObject(obj))}</div>
                    <canvas ref={committedCanvasRef} className="pointer-events-none absolute inset-0" />
                    <canvas ref={previewCanvasRef} className="pointer-events-none absolute inset-0" />

                    <div className="absolute inset-0">{foregroundObjects.map((obj) => renderObject(obj))}</div>
                </div>
            </div>

            {editable && showImportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
                    <div className="flex h-[80vh] w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.20)]">
                        <div className="w-full max-w-sm border-r border-slate-200 bg-slate-50/70 p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                                        Import PDF
                                    </div>
                                    <div className="mt-1 text-xl font-black tracking-tight text-slate-900">
                                        Add notes or exam pages
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white"
                                    onClick={closePdfImport}
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    onClick={() => void loadImportList()}
                                    disabled={importLoading}
                                >
                                    {importLoading ? "Loading..." : "Refresh list"}
                                </button>
                            </div>

                            {importError && (
                                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                    {importError}
                                </div>
                            )}

                            {!canLoadPdfImports && !importError && (
                                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                    PDF import is not connected yet in this view.
                                </div>
                            )}

                            <div className="mt-4 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "62vh" }}>
                                {canLoadPdfImports && importList.map((entry) => (
                                    <button
                                        key={`${entry.kind}-${entry.item.id}`}
                                        type="button"
                                        onClick={() => {
                                            setImportedPdf(entry);
                                            setShowPdfPanel(true);
                                            setPdfPageNum(1);
                                            setPdfNumPages(1);
                                            setClipRect(null);
                                            setSnipMode(false);
                                        }}
                                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${importedPdf?.item.id === entry.item.id && importedPdf?.kind === entry.kind
                                            ? "border-emerald-300 bg-emerald-50"
                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                            }`}
                                    >
                                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                            {entry.kind === "notes" ? "Notes" : "Exam Papers"}
                                        </div>
                                        <div className="mt-1 text-sm font-semibold text-slate-900 break-words">
                                            {entry.item.filename}
                                        </div>
                                    </button>
                                ))}

                                {canLoadPdfImports && !importLoading && importList.length === 0 && !importError && (
                                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                                        No PDFs available to import.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex min-w-0 min-h-0 flex-1 flex-col bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                                <div className="min-w-0">
                                    <div className="text-sm font-black text-slate-900">
                                        {importedPdf ? importedPdf.item.filename : "Select a PDF to preview"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {showPdfPanel && importedPdf ? `${pdfPageNum} / ${pdfNumPages}` : "PDF preview"}
                                    </div>
                                </div>

                                {showPdfPanel && importedPdf && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            onClick={() => setPdfPageNum((p) => Math.max(1, p - 1))}
                                            disabled={pdfPageNum <= 1}
                                        >
                                            Prev
                                        </button>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                                            Page {pdfPageNum} / {pdfNumPages}
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            onClick={() => setPdfPageNum((p) => Math.min(pdfNumPages, p + 1))}
                                            disabled={pdfPageNum >= pdfNumPages}
                                        >
                                            Next
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            onClick={() => setPdfViewScale((v) => Math.max(0.6, Number((v - 0.15).toFixed(2))))}
                                        >
                                            Zoom -
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            onClick={() => setPdfViewScale((v) => Math.min(2.5, Number((v + 0.15).toFixed(2))))}
                                        >
                                            Zoom +
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                                            onClick={() => void insertPdfPage1()}
                                        >
                                            Insert page 1
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                                            onClick={() => {
                                                setSnipMode(true);
                                                setClipRect(null);
                                            }}
                                        >
                                            Snip to board
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            onClick={() => void snipToBoardAndClose()}
                                            disabled={!clipRect}
                                        >
                                            Add snip
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                            onClick={closePdfImport}
                                        >
                                            Close
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="min-h-0 flex-1 p-5">
                                {!showPdfPanel || !importedPdf ? (
                                    <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                                        Choose a PDF from the list to preview and import it.
                                    </div>
                                ) : (
                                    <div className="flex h-full min-h-0 flex-col gap-3">
                                        <div className="text-xs text-slate-500">
                                            Zoom {pdfViewScale.toFixed(2)}x | Insert scale {pdfInsertScale.toFixed(2)}x
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Scroll or drag to move around the page.
                                        </div>
                                        <div
                                            ref={pdfViewerRef}
                                            className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-[24px] border border-slate-200 bg-slate-50 p-3"
                                            onPointerDown={onPdfViewerPointerDown}
                                            onPointerMove={onPdfViewerPointerMove}
                                            onPointerUp={onPdfViewerPointerEnd}
                                            onPointerCancel={onPdfViewerPointerEnd}
                                        >
                                            <div className="relative min-h-0 w-max">
                                                <canvas ref={pdfCanvasRef} className="block max-w-none rounded-xl bg-white shadow-sm" />
                                                <div
                                                    ref={pdfOverlayRef}
                                                    className="absolute inset-0"
                                                    style={{
                                                        width: pdfCanvasSize.w || undefined,
                                                        height: pdfCanvasSize.h || undefined,
                                                        cursor: snipMode ? "crosshair" : "default",
                                                        pointerEvents: snipMode ? "auto" : "none",
                                                    }}
                                                    onPointerDown={snipMode ? onClipDown : undefined}
                                                    onPointerMove={snipMode ? onClipMove : undefined}
                                                    onPointerUp={snipMode ? onClipUp : undefined}
                                                    onPointerCancel={snipMode ? onClipUp : undefined}
                                                >
                                                    {clipRect && (
                                                        <div
                                                            className="absolute border-2 border-sky-500 bg-sky-400/15"
                                                            style={{
                                                                left: clipRect.x,
                                                                top: clipRect.y,
                                                                width: clipRect.w,
                                                                height: clipRect.h,
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {snipMode && (
                                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                                                Drag a rectangle over the PDF, then click <span className="font-semibold">Add snip</span>.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
