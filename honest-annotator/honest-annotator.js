/**
 * Honest Annotator
 * Custom PDF/HTML page annotation tools used by Honest Academy.
 */
(function (global) {
    'use strict';

    const IMAGE_LONG_PRESS_MS = 1500;
    const IMAGE_LONG_PRESS_MOVE_TOLERANCE = 9;
    const STRAIGHT_LINE_SNAP_TANGENT = Math.tan(10 * Math.PI / 180);
    const PEN_HOVER_CATCHER_CSS_SIZE = 48;
    const ANNOTATION_COLORS = [
        '#ef4444', '#f97316', '#facc15', '#22c55e', '#2dd4bf',
        '#38bdf8', '#3b82f6', '#8b5cf6', '#d946ef', '#111827'
    ];

    const annotationPresets = [
        { type: 'pen', color: '#facc15', width: 2.5, opacity: 1, straight: false },
        { type: 'pen', color: '#38bdf8', width: 2.5, opacity: 1, straight: false },
        { type: 'pen', color: '#ef4444', width: 2.5, opacity: 1, straight: false },
        { type: 'highlighter', color: '#facc15', width: 18, opacity: 0.32, straight: false },
        { type: 'highlighter', color: '#22c55e', width: 18, opacity: 0.3, straight: false },
        { type: 'highlighter', color: '#38bdf8', width: 18, opacity: 0.3, straight: false }
    ];

    let ui = null;
    let readStoredAnnotations = null;
    let storeAnnotations = null;
    let isSetup = false;
    let selectedAnnotationPreset = 0;
    let activeAnnotationTool = null;
    let activeAnnotationKey = null;
    let annotationDocument = { version: 1, pages: {} };
    let annotationSaveTimer = null;
    let annotationToastTimer = null;
    let currentStrokeGesture = null;
    let pendingAnnotationImage = null;
    let selectedAnnotationImageId = null;
    let stylusConnectionEnabled = true;
    let activePenScrollLock = null;
    let armedPenHoverCatcher = null;

    function mountUi() {
        if (document.getElementById('annotation-toolbar')) return;
        const template = document.createElement('template');
        template.innerHTML = `
            <div id="annotation-toolbar" class="hidden" role="toolbar" aria-label="Annotation tools">
                <button id="btn-annotation-ink" class="annotation-tool-btn" type="button" aria-label="Drawing tools" aria-expanded="false" aria-controls="annotation-tray">
                    <svg id="annotation-ink-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 16c2.2-6.3 4.2-8.8 6-7.5 1.8 1.2-1.1 7.1.8 7.8 2.1.8 3.1-6.5 5.1-6 1.7.5-.5 5.4 1.7 5.7 1.2.2 2.7-1 4.4-3.1"/></svg>
                </button>
                <div id="annotation-tray" class="hidden" aria-label="Pens and highlighters"></div>
                <button id="annotation-eraser" class="annotation-tool-btn hidden" type="button" aria-label="Stroke eraser" title="Stroke eraser">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m4 15 8.7-9a2 2 0 0 1 2.8 0l3.1 3a2 2 0 0 1 0 2.8L12.3 18H7.1Z"/><path d="m9.2 9.2 6 5.8M12.2 18H20"/></svg>
                </button>
                <div id="annotation-toolbar-divider"></div>
                <button id="btn-annotation-image" class="annotation-tool-btn" type="button" aria-label="Embed image" title="Embed image">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5 17 4.2-4.2 3.1 3.1 2.2-2.2L19 18"/></svg>
                </button>
                <input id="annotation-image-input" class="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
            </div>
            <div id="annotation-settings" class="hidden" role="dialog" aria-label="Annotator settings">
                <div class="annotation-type-switch">
                    <button id="annotation-type-pen" type="button">Pen</button>
                    <button id="annotation-type-highlighter" type="button">Highlighter</button>
                </div>
                <div class="annotation-setting-row">
                    <div class="annotation-setting-label"><span>Thickness</span><span id="annotation-width-value" class="annotation-setting-value">2.4 px</span></div>
                    <input id="annotation-width" type="range" min="1" max="30" step="0.5" value="2.5" aria-label="Annotator thickness">
                </div>
                <div id="annotation-opacity-row" class="annotation-setting-row hidden">
                    <div class="annotation-setting-label"><span>Ink opacity</span><span id="annotation-opacity-value" class="annotation-setting-value">32%</span></div>
                    <input id="annotation-opacity" type="range" min="10" max="80" step="1" value="32" aria-label="Highlighter opacity">
                </div>
                <div class="annotation-straight-row">
                    <span>Straight line</span>
                    <label class="annotation-toggle">
                        <input id="annotation-straight" type="checkbox" aria-label="Draw straight lines">
                        <span></span>
                    </label>
                </div>
                <div class="annotation-colors-title">Basic colors</div>
                <div id="annotation-colors"></div>
            </div>
            <div id="annotation-toast" role="status" aria-live="polite"></div>
        `;
        document.body.appendChild(template.content);
    }

    function configure(options) {
        mountUi();
        ui = {
            pdfContainer: options.container,
            annotationToolbar: document.getElementById('annotation-toolbar'),
            annotationInkBtn: document.getElementById('btn-annotation-ink'),
            annotationTray: document.getElementById('annotation-tray'),
            annotationEraser: document.getElementById('annotation-eraser'),
            annotationImageBtn: document.getElementById('btn-annotation-image'),
            annotationImageInput: document.getElementById('annotation-image-input'),
            annotationSettings: document.getElementById('annotation-settings'),
            annotationTypePen: document.getElementById('annotation-type-pen'),
            annotationTypeHighlighter: document.getElementById('annotation-type-highlighter'),
            annotationWidth: document.getElementById('annotation-width'),
            annotationWidthValue: document.getElementById('annotation-width-value'),
            annotationOpacityRow: document.getElementById('annotation-opacity-row'),
            annotationOpacity: document.getElementById('annotation-opacity'),
            annotationOpacityValue: document.getElementById('annotation-opacity-value'),
            annotationStraight: document.getElementById('annotation-straight'),
            annotationColors: document.getElementById('annotation-colors'),
            annotationToast: document.getElementById('annotation-toast')
        };
        readStoredAnnotations = options.readDocument;
        storeAnnotations = options.writeDocument;
        if (!ui?.pdfContainer || !readStoredAnnotations || !storeAnnotations) {
            throw new Error('Honest Annotator requires its UI, reader, and writer.');
        }
    }

    function makeAnnotationId() {
        return crypto.randomUUID
            ? crypto.randomUUID()
            : `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function annotationItemsForPage(pageIndex) {
        const key = String(pageIndex);
        if (!Array.isArray(annotationDocument.pages[key])) annotationDocument.pages[key] = [];
        return annotationDocument.pages[key];
    }

    function showAnnotationToast(message) {
        if (annotationToastTimer) clearTimeout(annotationToastTimer);
        ui.annotationToast.textContent = message;
        ui.annotationToast.classList.add('is-visible');
        annotationToastTimer = setTimeout(() => ui.annotationToast.classList.remove('is-visible'), 1900);
    }

    async function loadAnnotationsForDocument(storageKey) {
        if (annotationSaveTimer) {
            clearTimeout(annotationSaveTimer);
            annotationSaveTimer = null;
        }
        activeAnnotationKey = storageKey;
        selectedAnnotationImageId = null;
        pendingAnnotationImage = null;
        try {
            annotationDocument = await readStoredAnnotations(storageKey);
        } catch (error) {
            console.warn('Unable to load annotations.', error);
            annotationDocument = { version: 1, pages: {} };
        }
    }

    function scheduleAnnotationSave() {
        if (!activeAnnotationKey) return;
        if (annotationSaveTimer) clearTimeout(annotationSaveTimer);
        annotationSaveTimer = setTimeout(() => {
            annotationSaveTimer = null;
            storeAnnotations(activeAnnotationKey, annotationDocument).catch(error => {
                console.warn('Unable to save annotations.', error);
                showAnnotationToast('Could not save this annotation');
            });
        }, 180);
    }

    async function flushAnnotationSave() {
        if (annotationSaveTimer) {
            clearTimeout(annotationSaveTimer);
            annotationSaveTimer = null;
        }
        if (activeAnnotationKey) {
            try {
                await storeAnnotations(activeAnnotationKey, annotationDocument);
            } catch (error) {
                console.warn('Unable to save annotations.', error);
            }
        }
    }

    function strokePathData(points) {
        if (!points || !points.length) return '';
        if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} l 0.01 0`;
        if (points.length === 2) return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
        let path = `M ${points[0][0]} ${points[0][1]}`;
        for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i][0] + points[i + 1][0]) / 2;
            const midY = (points[i][1] + points[i + 1][1]) / 2;
            path += ` Q ${points[i][0]} ${points[i][1]} ${midX} ${midY}`;
        }
        const last = points[points.length - 1];
        path += ` L ${last[0]} ${last[1]}`;
        return path;
    }

    function createStrokePath(item, ownerDocument = document) {
        const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.dataset.annotationId = item.id;
        path.setAttribute('d', strokePathData(item.points));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', item.color);
        path.setAttribute('stroke-width', String(item.width));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        if (item.tool === 'highlighter') {
            path.classList.add('annotation-highlighter-stroke');
            path.setAttribute('stroke-opacity', String(item.opacity));
        } else {
            path.setAttribute('opacity', String(item.opacity));
        }
        return path;
    }

    function consumeOpenAnnotationSettings(event) {
        if (ui.annotationSettings.classList.contains('hidden')) return false;
        closeAnnotationSettings();
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    function selectAnnotationImage(id) {
        selectedAnnotationImageId = id;
        ui.pdfContainer.querySelectorAll('.annotation-image').forEach(node => {
            node.classList.toggle('is-selected', node.dataset.annotationId === id);
        });
    }

    function removeAnnotationItem(pageIndex, id) {
        const items = annotationItemsForPage(pageIndex);
        const index = items.findIndex(item => item.id === id);
        if (index >= 0) items.splice(index, 1);
        if (selectedAnnotationImageId === id) selectedAnnotationImageId = null;
        renderAnnotationPage(pageIndex);
        scheduleAnnotationSave();
    }

    function beginImageMove(event, layer, item, node, resizing = false) {
        if (selectedAnnotationImageId !== item.id) return;
        event.preventDefault();
        event.stopPropagation();
        selectAnnotationImage(item.id);
        const start = getAnnotationPoint(layer, event);
        const original = { x: item.x, y: item.y, width: item.width, height: item.height };
        const aspect = original.width / Math.max(1, original.height);
        const pointerTarget = event.currentTarget;
        pointerTarget.setPointerCapture?.(event.pointerId);

        const move = moveEvent => {
            const point = getAnnotationPoint(layer, moveEvent);
            const dx = point.x - start.x;
            const dy = point.y - start.y;
            const baseWidth = Number(layer.dataset.baseWidth);
            const baseHeight = Number(layer.dataset.baseHeight);
            if (resizing) {
                const width = Math.max(42, Math.min(baseWidth - original.x, original.width + dx));
                const height = width / aspect;
                item.width = width;
                item.height = Math.min(baseHeight - original.y, height);
            } else {
                item.x = Math.max(0, Math.min(baseWidth - item.width, original.x + dx));
                item.y = Math.max(0, Math.min(baseHeight - item.height, original.y + dy));
            }
            node.style.left = `${item.x}px`;
            node.style.top = `${item.y}px`;
            node.style.width = `${item.width}px`;
            node.style.height = `${item.height}px`;
        };
        const end = () => {
            pointerTarget.removeEventListener('pointermove', move);
            pointerTarget.removeEventListener('pointerup', end);
            pointerTarget.removeEventListener('pointercancel', end);
            scheduleAnnotationSave();
        };
        pointerTarget.addEventListener('pointermove', move);
        pointerTarget.addEventListener('pointerup', end);
        pointerTarget.addEventListener('pointercancel', end);
    }

    function beginImageLongPress(event, item, node) {
        if (event.button !== undefined && event.button !== 0) return;
        if (consumeOpenAnnotationSettings(event)) return;

        const startX = event.clientX;
        const startY = event.clientY;
        let longPressTimer = setTimeout(() => {
            longPressTimer = null;
            selectAnnotationImage(item.id);
            showAnnotationToast('Image selected · drag it or use the corner handles');
            if (navigator.vibrate) navigator.vibrate(20);
        }, IMAGE_LONG_PRESS_MS);

        const cancelTimer = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };
        const move = moveEvent => {
            if (
                Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >
                IMAGE_LONG_PRESS_MOVE_TOLERANCE
            ) cancelTimer();
        };
        const finish = () => {
            cancelTimer();
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', finish);
            node.removeEventListener('pointercancel', finish);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', finish);
        node.addEventListener('pointercancel', finish);
    }

    function createAnnotationImageNode(item, pageIndex, layer) {
        const node = document.createElement('div');
        node.className = 'annotation-image';
        node.dataset.annotationId = item.id;
        node.style.left = `${item.x}px`;
        node.style.top = `${item.y}px`;
        node.style.width = `${item.width}px`;
        node.style.height = `${item.height}px`;
        node.classList.toggle('is-selected', selectedAnnotationImageId === item.id);

        const image = document.createElement('img');
        image.src = item.src;
        image.alt = 'Embedded annotation';
        image.draggable = false;

        const deleteButton = document.createElement('button');
        deleteButton.className = 'annotation-image-control annotation-image-delete';
        deleteButton.type = 'button';
        deleteButton.setAttribute('aria-label', 'Delete embedded image');
        deleteButton.textContent = '×';
        deleteButton.addEventListener('pointerdown', event => {
            if (consumeOpenAnnotationSettings(event)) return;
            event.preventDefault();
            event.stopPropagation();
            removeAnnotationItem(pageIndex, item.id);
        });

        const resizeHandle = document.createElement('button');
        resizeHandle.className = 'annotation-image-control annotation-image-resize';
        resizeHandle.type = 'button';
        resizeHandle.setAttribute('aria-label', 'Resize embedded image');
        resizeHandle.addEventListener('pointerdown', event => {
            if (consumeOpenAnnotationSettings(event)) return;
            beginImageMove(event, layer, item, node, true);
        });

        node.append(image, deleteButton, resizeHandle);
        node.addEventListener('pointerdown', event => {
            if (event.target.closest('.annotation-image-control')) return;
            if (consumeOpenAnnotationSettings(event)) return;
            if (selectedAnnotationImageId === item.id) {
                beginImageMove(event, layer, item, node, false);
                return;
            }
            beginImageLongPress(event, item, node);
        });
        node.addEventListener('contextmenu', event => event.preventDefault());
        return node;
    }

    function renderAnnotationPage(pageIndex) {
        const layer = ui.pdfContainer.querySelector(`.annotation-layer[data-page-index="${pageIndex}"]`);
        if (!layer) return;
        const highlighterSvg = layer.querySelector('.annotation-highlighter-strokes');
        const inkSvg = layer.querySelector('.annotation-ink-strokes');
        const images = layer.querySelector('.annotation-images');
        highlighterSvg.replaceChildren();
        inkSvg.replaceChildren();
        images.replaceChildren();
        const items = annotationItemsForPage(pageIndex);
        items.forEach(item => {
            if (item.type === 'stroke' && item.tool === 'highlighter') {
                highlighterSvg.appendChild(createStrokePath(item));
            } else if (item.type === 'stroke') {
                inkSvg.appendChild(createStrokePath(item));
            } else if (item.type === 'image') {
                images.appendChild(createAnnotationImageNode(item, pageIndex, layer));
            }
        });
    }

    function getAnnotationPoint(layerOrSurface, event) {
        const layer = layerOrSurface.classList?.contains('annotation-layer')
            ? layerOrSurface
            : layerOrSurface.closest('.annotation-layer');
        const rect = layer.getBoundingClientRect();
        const baseWidth = Number(layer.dataset.baseWidth);
        const baseHeight = Number(layer.dataset.baseHeight);
        return {
            x: Math.max(0, Math.min(baseWidth, (event.clientX - rect.left) * baseWidth / rect.width)),
            y: Math.max(0, Math.min(baseHeight, (event.clientY - rect.top) * baseHeight / rect.height))
        };
    }

    function snapStraightLinePoint(start, point) {
        const dx = point.x - start[0];
        const dy = point.y - start[1];
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absY <= absX * STRAIGHT_LINE_SNAP_TANGENT) {
            return { x: point.x, y: start[1] };
        }
        if (absX <= absY * STRAIGHT_LINE_SNAP_TANGENT) {
            return { x: start[0], y: point.y };
        }
        return point;
    }

    function pointSegmentDistance(point, start, end) {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        if (!dx && !dy) return Math.hypot(point.x - start[0], point.y - start[1]);
        const t = Math.max(0, Math.min(
            1,
            ((point.x - start[0]) * dx + (point.y - start[1]) * dy) / (dx * dx + dy * dy)
        ));
        return Math.hypot(
            point.x - (start[0] + t * dx),
            point.y - (start[1] + t * dy)
        );
    }

    function eraseAnnotationAt(pageIndex, point, pointerType) {
        const items = annotationItemsForPage(pageIndex);
        const radius = pointerType === 'touch' ? 15 : 9;
        const removed = items.some(item => {
            if (item.type !== 'stroke' || !item.points?.length) return false;
            if (item.points.length === 1) {
                return Math.hypot(point.x - item.points[0][0], point.y - item.points[0][1])
                    <= radius + item.width / 2;
            }
            for (let i = 1; i < item.points.length; i++) {
                if (pointSegmentDistance(point, item.points[i - 1], item.points[i])
                    <= radius + item.width / 2) return true;
            }
            return false;
        });
        if (!removed) return false;

        const kept = items.filter(item => {
            if (item.type !== 'stroke' || !item.points?.length) return true;
            if (item.points.length === 1) {
                return Math.hypot(point.x - item.points[0][0], point.y - item.points[0][1])
                    > radius + item.width / 2;
            }
            return !item.points.slice(1).some((end, index) =>
                pointSegmentDistance(point, item.points[index], end) <= radius + item.width / 2
            );
        });
        annotationDocument.pages[String(pageIndex)] = kept;
        renderAnnotationPage(pageIndex);
        scheduleAnnotationSave();
        return true;
    }

    function placePendingImage(layer, pageIndex, point) {
        if (!pendingAnnotationImage) {
            selectAnnotationImage(null);
            updateAnnotationInteraction();
            return;
        }
        const baseWidth = Number(layer.dataset.baseWidth);
        const baseHeight = Number(layer.dataset.baseHeight);
        const width = Math.min(260, baseWidth * 0.42);
        const height = width / pendingAnnotationImage.aspect;
        const item = {
            id: makeAnnotationId(),
            type: 'image',
            src: pendingAnnotationImage.src,
            x: Math.max(0, Math.min(baseWidth - width, point.x - width / 2)),
            y: Math.max(0, Math.min(baseHeight - height, point.y - height / 2)),
            width,
            height: Math.min(height, baseHeight)
        };
        annotationItemsForPage(pageIndex).push(item);
        pendingAnnotationImage = null;
        selectedAnnotationImageId = null;
        updateAnnotationInteraction();
        renderAnnotationPage(pageIndex);
        scheduleAnnotationSave();
        showAnnotationToast('Image placed · long-press it to edit');
    }

    function viewerScrollContainer() {
        return ui.pdfContainer.closest('#screen-viewer');
    }

    function lockViewerForPenStroke() {
        const viewer = viewerScrollContainer();
        if (!viewer || activePenScrollLock) return;
        activePenScrollLock = {
            viewer,
            scrollTop: viewer.scrollTop,
            overflowY: viewer.style.getPropertyValue('overflow-y'),
            overflowYPriority: viewer.style.getPropertyPriority('overflow-y')
        };
        viewer.style.setProperty('overflow-y', 'hidden');
    }

    function unlockViewerAfterPenStroke() {
        const lock = activePenScrollLock;
        activePenScrollLock = null;
        if (!lock) return;
        if (lock.overflowY) {
            lock.viewer.style.setProperty('overflow-y', lock.overflowY, lock.overflowYPriority);
        } else {
            lock.viewer.style.removeProperty('overflow-y');
        }
        lock.viewer.scrollTop = lock.scrollTop;
    }

    function isInkInteractionActive() {
        return ['pen', 'highlighter', 'eraser'].includes(activeAnnotationTool);
    }

    function disarmPenHoverCatcher(catcher = armedPenHoverCatcher) {
        if (!catcher) return;
        catcher.classList.remove('is-armed');
        catcher.style.transform = 'translate3d(-10000px, -10000px, 0)';
        if (armedPenHoverCatcher === catcher) armedPenHoverCatcher = null;
    }

    function armPenHoverCatcher(surface, event) {
        if (
            event.pointerType !== 'pen'
            || event.buttons !== 0
            || !stylusConnectionEnabled
            || !isInkInteractionActive()
            || currentStrokeGesture
        ) return;

        const layer = surface.closest('.annotation-layer');
        const catcher = surface.querySelector('.annotation-pen-hover-catcher');
        if (!layer || !catcher) return;

        const rect = layer.getBoundingClientRect();
        const baseWidth = Number(layer.dataset.baseWidth);
        const baseHeight = Number(layer.dataset.baseHeight);
        if (!rect.width || !rect.height || !baseWidth || !baseHeight) return;

        if (armedPenHoverCatcher && armedPenHoverCatcher !== catcher) {
            disarmPenHoverCatcher();
        }

        // Keep the hit target a constant visual size even though each document
        // page is rendered in base coordinates and scaled with CSS transforms.
        const width = PEN_HOVER_CATCHER_CSS_SIZE * baseWidth / rect.width;
        const height = PEN_HOVER_CATCHER_CSS_SIZE * baseHeight / rect.height;
        const x = (event.clientX - rect.left) * baseWidth / rect.width;
        const y = (event.clientY - rect.top) * baseHeight / rect.height;

        catcher.style.width = `${width}px`;
        catcher.style.height = `${height}px`;
        catcher.style.transform = `translate3d(${x - width / 2}px, ${y - height / 2}px, 0)`;
        catcher.classList.add('is-armed');
        armedPenHoverCatcher = catcher;
    }

    function onAnnotationPenHover(event) {
        armPenHoverCatcher(event.currentTarget, event);
    }

    function onAnnotationSurfacePointerLeave(event) {
        if (event.pointerType !== 'pen' || currentStrokeGesture?.pointerId === event.pointerId) return;
        const catcher = event.currentTarget.querySelector('.annotation-pen-hover-catcher');
        if (catcher && armedPenHoverCatcher === catcher) disarmPenHoverCatcher(catcher);
    }

    function onAnnotationPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        const startedOnHoverCatcher = event.currentTarget.classList.contains('annotation-pen-hover-catcher');
        if (startedOnHoverCatcher) {
            // The catcher is nested inside the normal surface; avoid starting a
            // duplicate stroke when this pointerdown would otherwise bubble.
            event.stopPropagation();
            if (event.pointerType !== 'pen') {
                // This contact cannot be retargeted for the current gesture, but
                // disarming immediately keeps the catcher from affecting another
                // finger contact after this one ends.
                disarmPenHoverCatcher(event.currentTarget);
                return;
            }
        }
        if (consumeOpenAnnotationSettings(event)) return;
        const surface = event.currentTarget;
        const layer = surface.closest('.annotation-layer');
        const pageIndex = Number(layer.dataset.pageIndex);
        const point = getAnnotationPoint(layer, event);
        if (selectedAnnotationImageId) selectAnnotationImage(null);

        if (pendingAnnotationImage) {
            event.preventDefault();
            placePendingImage(layer, pageIndex, point);
            return;
        }
        if (!['pen', 'highlighter', 'eraser'].includes(activeAnnotationTool)) return;
        // Finger contacts always remain native viewer navigation. Ink tools only
        // take ownership of a confirmed stylus while Stylus Connection is on.
        if (!stylusConnectionEnabled || event.pointerType !== 'pen') return;
        if (!startedOnHoverCatcher) disarmPenHoverCatcher();
        lockViewerForPenStroke();
        event.preventDefault();
        surface.setPointerCapture?.(event.pointerId);

        if (activeAnnotationTool === 'eraser') {
            eraseAnnotationAt(pageIndex, point, event.pointerType);
            currentStrokeGesture = {
                mode: 'eraser',
                surface,
                pageIndex,
                pointerId: event.pointerId
            };
            return;
        }

        const preset = annotationPresets[selectedAnnotationPreset];
        const item = {
            id: makeAnnotationId(),
            type: 'stroke',
            tool: preset.type,
            color: preset.color,
            width: preset.width,
            opacity: preset.type === 'highlighter' ? preset.opacity : 1,
            straight: preset.straight,
            points: [[point.x, point.y]]
        };
        annotationItemsForPage(pageIndex).push(item);
        renderAnnotationPage(pageIndex);
        const path = layer.querySelector(`path[data-annotation-id="${item.id}"]`);
        currentStrokeGesture = {
            mode: 'draw',
            surface,
            pageIndex,
            pointerId: event.pointerId,
            item,
            path
        };
    }

    function onAnnotationPointerMove(event) {
        const gesture = currentStrokeGesture;
        if (!gesture || gesture.pointerId !== event.pointerId || gesture.surface !== event.currentTarget) return;
        event.preventDefault();
        const layer = gesture.surface.closest('.annotation-layer');
        const point = getAnnotationPoint(layer, event);
        if (gesture.mode === 'eraser') {
            eraseAnnotationAt(gesture.pageIndex, point, event.pointerType);
            return;
        }
        const points = gesture.item.points;
        if (gesture.item.straight) {
            const snappedPoint = snapStraightLinePoint(points[0], point);
            if (points.length === 1) points.push([snappedPoint.x, snappedPoint.y]);
            else points[1] = [snappedPoint.x, snappedPoint.y];
        } else {
            const previous = points[points.length - 1];
            if (Math.hypot(point.x - previous[0], point.y - previous[1]) < 0.7) return;
            points.push([point.x, point.y]);
        }
        gesture.path?.setAttribute('d', strokePathData(points));
    }

    function finishAnnotationPointer(event) {
        if (!currentStrokeGesture || currentStrokeGesture.pointerId !== event.pointerId) return;
        const gesture = currentStrokeGesture;
        currentStrokeGesture = null;
        if (gesture.surface.hasPointerCapture?.(event.pointerId)) {
            gesture.surface.releasePointerCapture?.(event.pointerId);
        }
        if (event.type === 'pointercancel' && gesture.surface.classList.contains('annotation-pen-hover-catcher')) {
            disarmPenHoverCatcher(gesture.surface);
        }
        unlockViewerAfterPenStroke();
        scheduleAnnotationSave();
    }

    function currentAnnotationInteraction() {
        return pendingAnnotationImage
            ? 'image-placement'
            : activeAnnotationTool || 'none';
    }

    function createAnnotationLayer(pageDom, pageIndex, baseWidth, baseHeight) {
        const layer = document.createElement('div');
        layer.className = 'annotation-layer';
        layer.dataset.pageIndex = pageIndex;
        layer.dataset.baseWidth = baseWidth;
        layer.dataset.baseHeight = baseHeight;
        layer.dataset.interaction = currentAnnotationInteraction();
        layer.dataset.stylusConnection = String(stylusConnectionEnabled);
        layer.style.width = `${baseWidth}px`;
        layer.style.height = `${baseHeight}px`;

        const createStrokeSvg = className => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('annotation-strokes', className);
            svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('aria-hidden', 'true');
            return svg;
        };
        const highlighterSvg = createStrokeSvg('annotation-highlighter-strokes');
        const inkSvg = createStrokeSvg('annotation-ink-strokes');

        const surface = document.createElement('div');
        surface.className = 'annotation-input-surface';
        surface.addEventListener('pointerdown', onAnnotationPointerDown);
        surface.addEventListener('pointermove', onAnnotationPointerMove);
        surface.addEventListener('pointerover', onAnnotationPenHover);
        surface.addEventListener('pointermove', onAnnotationPenHover);
        surface.addEventListener('pointerrawupdate', onAnnotationPenHover);
        surface.addEventListener('pointerleave', onAnnotationSurfacePointerLeave);
        surface.addEventListener('pointerup', finishAnnotationPointer);
        surface.addEventListener('pointercancel', finishAnnotationPointer);

        const penHoverCatcher = document.createElement('div');
        penHoverCatcher.className = 'annotation-pen-hover-catcher';
        penHoverCatcher.setAttribute('aria-hidden', 'true');
        penHoverCatcher.addEventListener('pointerdown', onAnnotationPointerDown);
        penHoverCatcher.addEventListener('pointermove', onAnnotationPointerMove);
        penHoverCatcher.addEventListener('pointerup', finishAnnotationPointer);
        penHoverCatcher.addEventListener('pointercancel', finishAnnotationPointer);
        surface.appendChild(penHoverCatcher);

        const images = document.createElement('div');
        images.className = 'annotation-images';
        layer.append(surface, highlighterSvg, inkSvg, images);
        pageDom.appendChild(layer);
        renderAnnotationPage(pageIndex);
        return layer;
    }

    function updateAnnotationInteraction() {
        const interaction = currentAnnotationInteraction();
        if (!stylusConnectionEnabled || !isInkInteractionActive()) disarmPenHoverCatcher();
        ui.pdfContainer.querySelectorAll('.annotation-layer').forEach(layer => {
            layer.dataset.interaction = interaction;
            layer.dataset.stylusConnection = String(stylusConnectionEnabled);
        });
        ui.annotationInkBtn.classList.toggle(
            'is-active',
            activeAnnotationTool === 'pen'
                || activeAnnotationTool === 'highlighter'
                || activeAnnotationTool === 'eraser'
        );
        ui.annotationEraser.classList.toggle('is-active', activeAnnotationTool === 'eraser');
        ui.annotationImageBtn.classList.remove('is-active');
        ui.annotationTray.querySelectorAll('.annotation-preset').forEach((button, index) => {
            button.classList.toggle('is-selected', index === selectedAnnotationPreset);
        });
    }

    function setStylusConnectionEnabled(enabled) {
        stylusConnectionEnabled = Boolean(enabled);
        if (!stylusConnectionEnabled) {
            currentStrokeGesture = null;
            disarmPenHoverCatcher();
            unlockViewerAfterPenStroke();
        }
        updateAnnotationInteraction();
    }

    function closeAnnotationSettings() {
        ui.annotationSettings.classList.add('hidden');
    }

    function syncAnnotationSettings() {
        const preset = annotationPresets[selectedAnnotationPreset];
        ui.annotationTypePen.classList.toggle('is-active', preset.type === 'pen');
        ui.annotationTypeHighlighter.classList.toggle('is-active', preset.type === 'highlighter');
        ui.annotationWidth.value = preset.width;
        ui.annotationWidthValue.textContent = `${Number(preset.width).toFixed(1)} px`;
        ui.annotationOpacity.value = Math.round(preset.opacity * 100);
        ui.annotationOpacityValue.textContent = `${Math.round(preset.opacity * 100)}%`;
        ui.annotationOpacityRow.classList.toggle('hidden', preset.type !== 'highlighter');
        ui.annotationStraight.checked = preset.straight;
        ui.annotationColors.querySelectorAll('.annotation-color').forEach(button => {
            button.classList.toggle(
                'is-selected',
                button.dataset.color.toLowerCase() === preset.color.toLowerCase()
            );
        });
    }

    function setAnnotationTrayOpen(open) {
        ui.annotationTray.classList.toggle('hidden', !open);
        ui.annotationEraser.classList.toggle('hidden', !open);
        ui.annotationInkBtn.setAttribute('aria-expanded', String(open));
        if (!open) closeAnnotationSettings();
    }

    function penPresetIcon(type) {
        return type === 'highlighter'
            ? '<svg class="annotation-stylus-icon" viewBox="0 0 20 32" fill="none" aria-hidden="true"><path d="M5.1 1.5h9.8a3 3 0 0 1 3 3v13.2H2.1V4.5a3 3 0 0 1 3-3Z" fill="currentColor"/><path d="M5.1 1.5h3.3L5.5 17.7H2.1V4.5a3 3 0 0 1 3-3Z" fill="#fff" opacity=".28"/><path d="M12.2 1.5h2.7a3 3 0 0 1 3 3v13.2h-4.2Z" fill="#000" opacity=".18"/><path d="M2.1 16.2h15.8v5H2.1z" fill="#8b7539"/><path d="m4 21.2 1.7 6.4 3 2.9h4.1l3-2.9 1-6.4Z" fill="#5796cf"/><path d="M5.7 27.6 3.5 30.7l5.2-.2Z" fill="currentColor"/><path d="M8.7 30.5h4.1l.6-2.3-2.9.5Z" fill="#2f6ea8" opacity=".9"/></svg>'
            : '<svg class="annotation-stylus-icon" viewBox="0 0 18 32" fill="none" aria-hidden="true"><rect x="7" y=".5" width="4" height="4" rx="1.8" fill="currentColor"/><path d="M4.2 5.2A3.7 3.7 0 0 1 7.9 1.5h2.2a3.7 3.7 0 0 1 3.7 3.7v10.5H4.2Z" fill="#cfd3d4"/><path d="M4.2 5.2A3.7 3.7 0 0 1 7.9 1.5h1.5L6.3 15.7H4.2Z" fill="#fff" opacity=".48"/><path d="M11.1 2.1a3.7 3.7 0 0 1 2.7 3.6v10h-3.9Z" fill="#aeb3b5" opacity=".55"/><path d="M4.2 13.8h9.6v11.1L10.7 28H7.3l-3.1-3.1Z" fill="currentColor"/><path d="m4.2 22.7 6.6-8.9h3v11.1L10.7 28H7.3l-3.1-3.1Z" fill="#000" opacity=".09"/><path d="m4.8 25.5 2.5 5h3.4l2.5-5-2.5 2.5H7.3Z" fill="#d9ddde"/><path d="m8 30.5 1 1 1-1Z" fill="#6f7477"/><path d="M13.1 6.3h2v9.8c0 2.4-1.2 4-3.2 5.4l-.8-1.7c1.4-1.1 2-2.1 2-3.9Z" fill="currentColor"/></svg>';
    }

    function straightRulerIcon() {
        return '<span class="annotation-preset-ruler" aria-hidden="true"><svg viewBox="0 0 14 28" fill="none"><rect x="1" y=".75" width="12" height="26.5" rx="2" fill="currentColor" fill-opacity=".74" stroke="#dff8ff" stroke-opacity=".72"/><path d="M2.7 5h4M2.7 8h2.5M2.7 11h4M2.7 14h2.5M2.7 17h4M2.7 20h2.5M2.7 23h4" stroke="#245a6c" stroke-width=".8" stroke-linecap="round" opacity=".85"/></svg></span>';
    }

    function renderAnnotationPresets() {
        ui.annotationTray.replaceChildren();
        annotationPresets.forEach((preset, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `annotation-preset ${preset.type === 'highlighter' ? 'is-highlighter' : ''} ${preset.straight ? 'has-ruler' : ''}`;
            button.style.setProperty('--preset-color', preset.color);
            const straightLabel = preset.straight ? ' with straight-line ruler' : '';
            button.setAttribute('aria-label', `${preset.type} ${index + 1}${straightLabel}`);
            button.title = index === selectedAnnotationPreset
                ? `Press again for settings${straightLabel}`
                : `Select ${preset.type}${straightLabel}`;
            button.innerHTML = `${preset.straight ? straightRulerIcon() : ''}${penPresetIcon(preset.type)}`;
            button.addEventListener('click', event => {
                event.stopPropagation();
                if (selectedAnnotationPreset === index && activeAnnotationTool === preset.type) {
                    ui.annotationSettings.classList.toggle('hidden');
                    syncAnnotationSettings();
                } else {
                    selectedAnnotationPreset = index;
                    activeAnnotationTool = preset.type;
                    closeAnnotationSettings();
                    renderAnnotationPresets();
                    updateAnnotationInteraction();
                }
            });
            ui.annotationTray.appendChild(button);
        });
        updateAnnotationInteraction();
    }

    function changeSelectedPresetType(type) {
        const preset = annotationPresets[selectedAnnotationPreset];
        preset.type = type;
        preset.width = type === 'highlighter'
            ? Math.max(8, preset.width)
            : Math.min(8, preset.width);
        preset.opacity = type === 'highlighter'
            ? Math.min(0.8, preset.opacity || 0.32)
            : 1;
        activeAnnotationTool = type;
        renderAnnotationPresets();
        syncAnnotationSettings();
    }

    function readImageForAnnotation(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('Unable to read this image.'));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error('This image could not be opened.'));
                image.onload = () => resolve({
                    src: String(reader.result),
                    aspect: image.naturalWidth / Math.max(1, image.naturalHeight)
                });
                image.src = String(reader.result);
            };
            reader.readAsDataURL(file);
        });
    }

    function setupAnnotationTools() {
        if (isSetup) return;
        if (!ui) throw new Error('Configure Honest Annotator before setup.');
        isSetup = true;

        ANNOTATION_COLORS.forEach(color => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'annotation-color';
            button.dataset.color = color;
            button.style.setProperty('--swatch', color);
            button.setAttribute('aria-label', `Use color ${color}`);
            button.addEventListener('click', () => {
                annotationPresets[selectedAnnotationPreset].color = color;
                renderAnnotationPresets();
                syncAnnotationSettings();
            });
            ui.annotationColors.appendChild(button);
        });
        renderAnnotationPresets();

        ui.annotationInkBtn.addEventListener('click', event => {
            event.stopPropagation();
            const willOpen = ui.annotationTray.classList.contains('hidden');
            setAnnotationTrayOpen(willOpen);
            activeAnnotationTool = willOpen ? annotationPresets[selectedAnnotationPreset].type : null;
            updateAnnotationInteraction();
        });
        ui.annotationEraser.addEventListener('click', event => {
            event.stopPropagation();
            activeAnnotationTool = 'eraser';
            closeAnnotationSettings();
            updateAnnotationInteraction();
        });
        ui.annotationImageBtn.addEventListener('click', event => {
            event.stopPropagation();
            pendingAnnotationImage = null;
            closeAnnotationSettings();
            updateAnnotationInteraction();
            ui.annotationImageInput.click();
        });
        ui.annotationImageInput.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) {
                pendingAnnotationImage = null;
                updateAnnotationInteraction();
                return;
            }
            try {
                pendingAnnotationImage = await readImageForAnnotation(file);
                updateAnnotationInteraction();
                showAnnotationToast('Tap anywhere on a page to place the image');
            } catch (error) {
                console.warn(error);
                pendingAnnotationImage = null;
                updateAnnotationInteraction();
                showAnnotationToast(error.message || 'Unable to open this image');
            }
        });
        ui.annotationImageInput.addEventListener('cancel', () => {
            pendingAnnotationImage = null;
            updateAnnotationInteraction();
        });
        ui.annotationTypePen.addEventListener('click', () => changeSelectedPresetType('pen'));
        ui.annotationTypeHighlighter.addEventListener('click', () => changeSelectedPresetType('highlighter'));
        ui.annotationWidth.addEventListener('input', event => {
            annotationPresets[selectedAnnotationPreset].width = Number(event.target.value);
            ui.annotationWidthValue.textContent = `${Number(event.target.value).toFixed(1)} px`;
        });
        ui.annotationOpacity.addEventListener('input', event => {
            annotationPresets[selectedAnnotationPreset].opacity = Number(event.target.value) / 100;
            ui.annotationOpacityValue.textContent = `${event.target.value}%`;
        });
        ui.annotationStraight.addEventListener('change', event => {
            annotationPresets[selectedAnnotationPreset].straight = event.target.checked;
            renderAnnotationPresets();
            syncAnnotationSettings();
        });
        document.addEventListener('pointerdown', event => {
            if (!event.target.closest('#annotation-settings') && !event.target.closest('.annotation-preset')) {
                closeAnnotationSettings();
            }
        });
        document.addEventListener('keydown', event => {
            if (
                (event.key === 'Delete' || event.key === 'Backspace')
                && selectedAnnotationImageId
            ) {
                const image = ui.pdfContainer.querySelector(
                    `.annotation-image[data-annotation-id="${selectedAnnotationImageId}"]`
                );
                const layer = image?.closest('.annotation-layer');
                if (layer) {
                    event.preventDefault();
                    removeAnnotationItem(Number(layer.dataset.pageIndex), selectedAnnotationImageId);
                }
            }
            if (event.key === 'Escape') {
                pendingAnnotationImage = null;
                updateAnnotationInteraction();
                closeAnnotationSettings();
            }
        });
        window.addEventListener('blur', () => disarmPenHoverCatcher());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) disarmPenHoverCatcher();
        });
    }

    function enterViewer() {
        ui.annotationToolbar.classList.remove('hidden');
    }

    function leaveViewer() {
        currentStrokeGesture = null;
        disarmPenHoverCatcher();
        unlockViewerAfterPenStroke();
        ui.annotationToolbar.classList.add('hidden');
        closeAnnotationSettings();
        setAnnotationTrayOpen(false);
        activeAnnotationTool = null;
        pendingAnnotationImage = null;
        updateAnnotationInteraction();
    }

    function hideToolbar() {
        ui.annotationToolbar.classList.add('hidden');
        closeAnnotationSettings();
    }

    function clearDocument() {
        activeAnnotationKey = null;
        annotationDocument = { version: 1, pages: {} };
        selectedAnnotationImageId = null;
        pendingAnnotationImage = null;
        currentStrokeGesture = null;
        disarmPenHoverCatcher();
        unlockViewerAfterPenStroke();
    }

    global.HonestAnnotator = Object.freeze({
        configure,
        setup: setupAnnotationTools,
        loadDocument: loadAnnotationsForDocument,
        flush: flushAnnotationSave,
        createLayer: createAnnotationLayer,
        renderPage: renderAnnotationPage,
        setStylusConnectionEnabled,
        enterViewer,
        leaveViewer,
        hideToolbar,
        clearDocument
    });
})(window);
