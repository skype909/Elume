import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    | "speech";

type BoardObject = {
    id: string;
    type: BoardObjectType;
    x: number;
    y: number;
    w: number;
    h: number;
    text?: string;
    fill?: string;
    createdBy: string;
    updatedAt: number;
};

type BoardSnapshot = {
    strokes: Stroke[];
    objects: BoardObject[];
};

type SocketPayload =
    | { type: "stroke"; stroke: Stroke }
    | { type: "cursor"; x: number; y: number; size: number }
    | { type: "clear-preview" }
    | { type: "ping" }
    | { type: "pong" }
    | { type: "object-create"; object: BoardObject }
    | { type: "object-update"; object: BoardObject }
    | { type: "object-delete"; id: string };

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
}: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const committedCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
    const [objects, setObjects] = useState<BoardObject[]>([]);
    const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

    const strokesRef = useRef<Stroke[]>([]);
    const liveStrokeRef = useRef<Stroke | null>(null);
    const interactionRef = useRef<Interaction>({ mode: "idle" });
    const historyRef = useRef<BoardSnapshot[]>([]);
    const eraserGestureSnapshotTakenRef = useRef(false);

    const boardLabel = useMemo(() => `${sessionCode} / ${roomKey}`, [sessionCode, roomKey]);

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
        const container = containerRef.current;
        if (!committed || !container) return;

        const ctx = committed.getContext("2d");
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);

        for (const stroke of strokesRef.current) {
            drawStroke(ctx, stroke);
        }
    }, []);

    const clearPreview = useCallback(() => {
        const preview = previewCanvasRef.current;
        const container = containerRef.current;
        if (!preview || !container) return;

        const ctx = preview.getContext("2d");
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
    }, []);

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
    }

    const syncCanvasSize = useCallback(() => {
        const container = containerRef.current;
        const committed = committedCanvasRef.current;
        const preview = previewCanvasRef.current;
        if (!container || !committed || !preview) return;

        const rect = container.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

        committed.width = Math.floor(rect.width * dpr);
        committed.height = Math.floor(rect.height * dpr);
        preview.width = Math.floor(rect.width * dpr);
        preview.height = Math.floor(rect.height * dpr);

        committed.style.width = `${rect.width}px`;
        committed.style.height = `${rect.height}px`;
        preview.style.width = `${rect.width}px`;
        preview.style.height = `${rect.height}px`;

        const cctx = committed.getContext("2d");
        const pctx = preview.getContext("2d");
        if (!cctx || !pctx) return;

        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        redrawCommitted();
        clearPreview();
    }, [clearPreview, redrawCommitted]);

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
        drawPreviewStroke();
    }

    function extendStroke(pt: StrokePoint) {
        if (!liveStrokeRef.current) return;
        liveStrokeRef.current.points.push(pt);
        drawPreviewStroke();
    }

    function updateObjectLocalAndBroadcast(nextObject: BoardObject) {
        setObjects((prev) =>
            prev.map((obj) => (obj.id === nextObject.id ? nextObject : obj))
        );
        broadcastObjectUpdate(nextObject);
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

    useEffect(() => {
        syncCanvasSize();
        const onResize = () => syncCanvasSize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [syncCanvasSize]);

    useEffect(() => {
        const ws = new WebSocket(`${getWsBase()}/ws/collab/${sessionCode}/${roomKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            ws.send(JSON.stringify({ type: "ping" }));
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        ws.onerror = () => {
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as SocketPayload;

                if (data.type === "stroke" && data.stroke) {
                    const incoming = data.stroke;
                    if (incoming.createdBy === participantId) return;
                    strokesRef.current.push(incoming);
                    redrawCommitted();
                    return;
                }

                if (data.type === "object-create" && data.object) {
                    const incoming = data.object;
                    if (incoming.createdBy === participantId) return;

                    setObjects((prev) => {
                        const exists = prev.some((obj) => obj.id === incoming.id);
                        if (exists) return prev;
                        return [...prev, incoming];
                    });
                    return;
                }

                if (data.type === "object-update" && data.object) {
                    const incoming = data.object;
                    if (incoming.createdBy === participantId) return;

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
                }
            } catch {
                // ignore malformed packets
            }
        };

        return () => {
            ws.close();
        };
    }, [sessionCode, roomKey, participantId, redrawCommitted, clearPreview]);

    useEffect(() => {
        if (!onUndoReady) return;
        onUndoReady(undoLastAction);
    }, [onUndoReady]);

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        const container = containerRef.current;
        if (!container) return;

        const pt = getPointFromEvent(e, container);

        setCursor(tool === "eraser" ? { x: pt.x, y: pt.y, size: eraserSize } : null);

        if (tool === "select") {
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

    function handlePointerUp() {
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
        clearPreview();

        if (tool === "eraser" && cursor) {
            setCursor(null);
        }
    }

    function handlePointerLeave() {
        if (tool === "eraser") {
            setCursor(null);
            clearPreview();
        }
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

        return null;
    }

    return (
        <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-black text-slate-900">{boardLabel}</div>

                <div className="flex items-center gap-2">
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
                ref={containerRef}
                className="relative touch-none select-none"
                style={{ height }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerLeave}
            >
                <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:26px_26px]" />

                <canvas ref={committedCanvasRef} className="absolute inset-0" />
                <canvas ref={previewCanvasRef} className="absolute inset-0" />

                <div className="absolute inset-0">{objects.map((obj) => renderObject(obj))}</div>
            </div>
        </div>
    );
}