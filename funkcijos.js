// Nustatome versijos pavadinimą ir pakeičiame jo dizainą per JS
const watermarkEl = document.getElementById('version-watermark');
watermarkEl.innerText = "V1.17";
watermarkEl.style.cssText = "position: absolute; bottom: 8px; right: 10px; font-size: 11px; color: #888; font-weight: normal; z-index: 100; pointer-events: none; font-family: sans-serif; opacity: 0.7;";

let isGridOn = true;
function toggleGrid() {
    const ws = document.getElementById('workspace');
    ws.style.backgroundImage = (isGridOn = !isGridOn) ? 'radial-gradient(#d5d5d5 1px, transparent 1px)' : 'none';
}

let dimState = 1; 
function cycleDimensions() {
    dimState = (dimState + 1) % 3;
    const btn = document.getElementById('arrow-toggle-btn');
    const ind = document.getElementById('dim-state-indicator');
    if (dimState === 0) {
        btn.style.background = 'transparent';
        btn.style.borderColor = 'transparent';
        btn.style.filter = 'none';
        ind.innerText = '';
    } else if (dimState === 1) {
        btn.style.background = '#eef5ff';
        btn.style.borderColor = '#b8daff';
        btn.style.filter = 'drop-shadow(0px 0px 2px rgba(0,123,255,0.5))';
        ind.innerText = '1';
    } else if (dimState === 2) {
        btn.style.background = '#cce5ff';
        btn.style.borderColor = '#007bff';
        btn.style.filter = 'drop-shadow(0px 0px 3px rgba(0,123,255,0.8))';
        ind.innerText = '2';
    }
    updateDimensions();
}

let scale = window.innerWidth < 768 ? 0.8 : 1.5; 
const createSVG = (w, h, c) => `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" style="position:absolute;overflow:visible;"><g stroke="#222" stroke-width="1.5" fill="#fff">${c}</g></svg>`;
const getPrice = (w, h) => Math.floor((w + h) * 1.8 / 5) * 5;

const furnitureModels = {};
for(let k in rawModels) {
    furnitureModels[k] = rawModels[k].map(m => {
        let pKey = k + '_' + m.id;
        let p = appSettings.customPrices[pKey] !== undefined ? appSettings.customPrices[pKey] : (m.price || getPrice(m.w, m.h));
        let processedMod = { ...m, price: p, svg: createSVG(m.w, m.h, m.svg) };
        if(m.expandable && m.svgExpanded) processedMod.svgExpanded = createSVG(m.expW, m.expH, m.svgExpanded);
        return processedMod;
    });
}

const canvasArea = document.getElementById('canvas-area'), orderList = document.getElementById('order-list'), totalPriceEl = document.getElementById('total-price'), modelSelect = document.getElementById('model-select');
let zIndexCounter = 1, selectedModule = null, historyStack = [];

let isGlobalDragging = false, dragStartX = 0, dragStartY = 0, dragGroup = [], dragInitials = [], draggedModule = null;
let cachedOtherRects = [], initialDraggedRect = null;

let isPanning = false, panStartX = 0, panStartY = 0;
let currentPanX = 0, currentPanY = 0, initialPanX = 0, initialPanY = 0;

function getDisplayName(modData, isMixed) {
    return isMixed ? `${modData.collection.toUpperCase()} ${modData.name}` : modData.name;
}

function generateModuleChainText(modules, isMixed) {
    if (!modules || modules.length === 0) return "";
    if (!isMixed) {
        let sorted = [...modules].sort((a,b) => parseFloat(a.style.left) - parseFloat(b.style.left));
        return sorted.map(m => m.dataset.name).join(' + ');
    } else {
        let collections = {};
        [...modules].forEach(m => {
            let col = m.dataset.collection;
            if (!collections[col]) collections[col] = [];
            collections[col].push(m);
        });
        let chainParts = [];
        for (let col in collections) {
            let sorted = collections[col].sort((a,b) => parseFloat(a.style.left) - parseFloat(b.style.left));
            chainParts.push(sorted.map(m => `${col.toUpperCase()} ${m.dataset.name}`).join(' + '));
        }
        return chainParts.join('  |  ');
    }
}

function updateLabels() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1;
    modules.forEach(m => {
        const label = m.querySelector('.label');
        if(!label) return;
        const modBase = rawModels[m.dataset.collection]?.find(x => x.id === m.dataset.id);
        let expIcon = modBase && modBase.expandable ? ' <b style="color:#007bff; font-size:14px;">⇕</b>' : '';
        label.innerHTML = `${getDisplayName({collection: m.dataset.collection, name: m.dataset.name}, isMixed)}${expIcon}<br><span class="dim-text">${m.dataset.w}x${m.dataset.h}</span>`;
    });
}

function getModulePrice(collectionKey, moduleId) {
    let modBase = rawModels[collectionKey]?.find(m => m.id === moduleId);
    if (!modBase) return 0;
    let basePrice = appSettings.customPrices[collectionKey + '_' + moduleId] !== undefined ? appSettings.customPrices[collectionKey + '_' + moduleId] : (modBase.price || getPrice(modBase.w, modBase.h));
    let group = parseInt(document.getElementById('fabric-group-select').value) || 1;
    let surcharge = modBase.prices && group > 1 ? modBase.prices['gr' + group] || 0 : 0;
    return basePrice + surcharge;
}

function updateZoomText() { document.getElementById('zoom-level').innerText = Math.round((scale / 1.5) * 100) + '%'; }

function changeZoom(f, e = null) { 
    let oldScale = scale; 
    scale = Math.max(0.4, Math.min(2.5, scale + f)); 
    let ratio = scale / oldScale;
    
    let rect = document.getElementById('workspace').getBoundingClientRect();
    let mouseX = e ? (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left : rect.width / 2;
    let mouseY = e ? (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top : rect.height / 2;

    let relX = mouseX - currentPanX;
    let relY = mouseY - currentPanY;

    currentPanX = mouseX - relX * ratio;
    currentPanY = mouseY - relY * ratio;

    document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;

    document.querySelectorAll('.canvas-module').forEach(m => {
        m.style.width = (parseFloat(m.style.width) / oldScale * scale) + 'px';
        m.style.height = (parseFloat(m.style.height) / oldScale * scale) + 'px';
        m.style.left = (parseFloat(m.style.left) * ratio) + 'px';
        m.style.top = (parseFloat(m.style.top) * ratio) + 'px';
    });
    updateZoomText(); 
    setTimeout(() => { updateDimensions(); }, 50); 
}

function saveState() { 
    const s = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({
        id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, 
        l: (parseFloat(m.style.left) || 0) / scale,
        t: (parseFloat(m.style.top) || 0) / scale,
        a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded
    })); 
    const stateStr = JSON.stringify(s);
    historyStack.push(stateStr); 
    if(historyStack.length > 20) historyStack.shift(); 
    localStorage.setItem('sofaState', stateStr); 
    updateOrderSummary(); updateLabels();
}

function undo() { if(historyStack.length>1){ historyStack.pop(); restoreState(JSON.parse(historyStack[historyStack.length-1])); } }

function restoreState(data) { 
    canvasArea.innerHTML=''; 
    data.forEach(d=>{ 
        let modBase = furnitureModels[d.c]?.find(x=>x.id===d.id);
        if (!modBase) return;
        const el=document.createElement('div'); el.className='canvas-module'; 
        Object.assign(el.dataset,{id:d.id, name:d.n, price:d.p, collection:d.c, w:d.w, h:d.h, angle:d.a, isExpanded: d.exp || 'false'}); 
        let leftVal = (typeof d.l === 'string' && d.l.includes('px')) ? parseFloat(d.l) : parseFloat(d.l) * scale;
        let topVal = (typeof d.t === 'string' && d.t.includes('px')) ? parseFloat(d.t) : parseFloat(d.t) * scale;
        el.style.cssText=`width:${d.w*scale}px; height:${d.h*scale}px; left:${leftVal}px; top:${topVal}px; z-index:${d.z}; transform:rotate(${d.a}deg)`; 
        el.innerHTML= (d.exp === 'true' && modBase.expandable ? modBase.svgExpanded : modBase.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; 
        attachEvents(el); canvasArea.appendChild(el); 
    }); 
    updateOrderSummary(); updateLabels(); 
    setTimeout(() => { updateDimensions(); }, 50);
}

function clearWorkspace() { 
    if(confirm("Išvalyti viską?")) { 
        canvasArea.innerHTML = ''; 
        currentPanX = 0; currentPanY = 0;
        document.getElementById('canvas-wrapper').style.transform = `translate(0px, 0px)`;
        document.getElementById('workspace').style.backgroundPosition = `0px 0px`;
        saveState(); updateDimensions(); 
    } 
}

function updateOrderSummary() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1;
    let counts = {}; let total = 0;
    modules.forEach(m => {
        let dName = getDisplayName({collection: m.dataset.collection, name: m.dataset.name}, isMixed);
        let price = getModulePrice(m.dataset.collection, m.dataset.id);
        if(!counts[dName]) counts[dName] = { qty: 0, price: price };
        counts[dName].qty++; total += price;
    });
    orderList.innerHTML = Object.keys(counts).length ? Object.keys(counts).map(n => `<div class="order-item"><span><b>${counts[n].qty}x</b> ${n}</span><span>${counts[n].price * counts[n].qty} €</span></div>`).join('') : '<div style="color:#888; text-align:center; padding: 20px 0;">Sofa tuščia</div>'; 
    const chain = generateModuleChainText(modules, isMixed);
    document.getElementById('module-chain-display').innerText = chain ? "Specifikacija: " + chain : "";
    totalPriceEl.innerText = total;
}

function updateDimensions() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const svgAr = document.getElementById('svg-arrows');
    svgAr.style.overflow = 'visible';
    if (modules.length === 0) { 
        document.getElementById('dimension-display').innerHTML = 'Išmatavimai: <b>0 x 0 cm</b>'; 
        svgAr.style.display = 'none'; 
        return; 
    }
    let groups = [], unvisited = new Set(modules);
    while(unvisited.size > 0) {
        let startMod = unvisited.values().next().value, group = new Set([startMod]), added = true;
        while(added) {
            added = false;
            for(let other of unvisited) {
                if(!group.has(other)) { 
                    for(let m of group) { 
                        let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect();
                        if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; } 
                    } 
                }
            }
        }
        groups.push(Array.from(group)); group.forEach(m => unvisited.delete(m));
    }
    groups.sort((a, b) => {
        let aX = Math.min(...a.map(m => parseFloat(m.style.left))), aY = Math.min(...a.map(m => parseFloat(m.style.top)));
        let bX = Math.min(...b.map(m => parseFloat(m.style.left))), bY = Math.min(...b.map(m => parseFloat(m.style.top)));
        return (aY + aX) - (bY + bX);
    });
    let GMinX = Infinity, GMinY = Infinity, GMaxX = -Infinity, GMaxY = -Infinity;
    groups.forEach(g => {
        g.forEach(m => {
            let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
            let dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2;
            let cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
            [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
                let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle);
                let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                GMinX = Math.min(GMinX, rx); GMaxX = Math.max(GMaxX, rx);
                GMinY = Math.min(GMinY, ry); GMaxY = Math.max(GMaxY, ry);
            });
        });
    });
    let GCX = (GMinX + GMaxX) / 2, GCY = (GMinY + GMaxY) / 2;
    let svgContent = `<defs><marker id="tick" markerWidth="1.5" markerHeight="10" refX="0.75" refY="5" orient="auto"><rect x="0" y="0" width="1.5" height="10" fill="#555" /></marker></defs>`;
    svgAr.style.display = (dimState > 0) ? 'block' : 'none';
    let displayTexts = [];
    groups.forEach((g, index) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.forEach(m => {
            let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
            let dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2;
            let cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
            [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
                let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle);
                let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
            });
        });
        let cx = (minX + maxX)/2, cy = (minY + maxY)/2;
        const totalW = Math.round((maxX - minX) / scale), totalH = Math.round((maxY - minY) / scale);
        let groupName = groups.length > 1 ? `Baldo ${index + 1} išmatavimai:` : `Išmatavimai:`;
        displayTexts.push(`${groupName} <b style="color:#007bff">${totalW} x ${totalH} cm</b>`);
        if (dimState > 0) {
            let offset = 35;
            let topY = minY - offset, bottomY = maxY + offset, leftX = minX - offset, rightX = maxX + offset;
            let lineY = (Math.round(cy) <= Math.round(GCY)) ? topY : bottomY;
            let textY = (Math.round(cy) <= Math.round(GCY)) ? (lineY - 6) : (lineY + 16);
            let lineX = (Math.round(cx) >= Math.round(GCX) || groups.length === 1) ? rightX : leftX;
            let textX = (Math.round(cx) >= Math.round(GCX) || groups.length === 1) ? (lineX + 16) : (lineX - 6);
            let extStyle = "stroke='#aaa' stroke-width='0.5' stroke-dasharray='4,4' fill='none'";
            svgContent += `<line x1="${minX}" y1="${Math.round(cy)<=Math.round(GCY) ? minY : maxY}" x2="${minX}" y2="${lineY}" ${extStyle} /><line x1="${maxX}" y1="${Math.round(cy)<=Math.round(GCY) ? minY : maxY}" x2="${maxX}" y2="${lineY}" ${extStyle} /><line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1 ? maxX : minX}" y1="${minY}" x2="${lineX}" y2="${minY}" ${extStyle} /><line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1 ? maxX : minX}" y1="${maxY}" x2="${lineX}" y2="${maxY}" ${extStyle} />`;
            svgContent += `<path d="M ${minX} ${lineY} L ${maxX} ${lineY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${cx}" y="${textY}" fill="#333" font-size="12" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalW} cm</text>`;
            svgContent += `<path d="M ${lineX} ${minY} L ${lineX} ${maxY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${textX}" y="${cy + 4}" transform="rotate(-90 ${textX} ${cy + 4})" fill="#333" font-size="12" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalH} cm</text>`;
        }
    });
    if (dimState === 2 && groups.length > 1) {
        let offset = 85, totalW = Math.round((GMaxX - GMinX) / scale), totalH = Math.round((GMaxY - GMinY) / scale);
        let extStyle = "stroke='#007bff' stroke-width='0.5' stroke-dasharray='4,4' fill='none' opacity='0.5'";
        svgContent += `<line x1="${GMinX}" y1="${GMinY}" x2="${GMinX}" y2="${GMinY - offset}" ${extStyle} /><line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX}" y2="${GMinY - offset}" ${extStyle} /><line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX + offset}" y2="${GMinY}" ${extStyle} /><line x1="${GMaxX}" y1="${GMaxY}" x2="${GMaxX + offset}" y2="${GMaxY}" ${extStyle} />`;
        svgContent += `<path d="M ${GMinX} ${GMinY - offset} L ${GMaxX} ${GMinY - offset}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${GCX}" y="${GMinY - offset - 6}" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalW} cm (Viso)</text>`;
        svgContent += `<path d="M ${GMaxX + offset} ${GMinY} L ${GMaxX + offset} ${GMaxY}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${GMaxX + offset + 18}" y="${GCY + 5}" transform="rotate(-90 ${GMaxX + offset + 18} ${GCY + 5})" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalH} cm (Viso)</text>`;
        displayTexts.unshift(`<b>Bendri išmatavimai:</b> <b style="color:#007bff">${totalW} x ${totalH} cm</b>`); 
    }
    svgAr.innerHTML = svgContent; document.getElementById('dimension-display').innerHTML = displayTexts.join('<br>');
}

function loadModel(modelKey) {
    const list = document.getElementById('module-list'); list.innerHTML = '';
    if(!furnitureModels[modelKey]) return;
    furnitureModels[modelKey].forEach(mod => {
        const btn = document.createElement('div'); btn.className = 'menu-item';
        btn.innerHTML = `<span>${mod.name}${mod.expandable ? ' ⇕' : ''}<br><small>${mod.w}x${mod.h} cm</small></span> <span class="menu-price">${getModulePrice(modelKey, mod.id)}€</span>`;
        btn.onclick = () => addModuleToWorkspace(mod, modelKey);
        list.appendChild(btn);
    });
}

modelSelect.onchange = (e) => loadModel(e.target.value);
document.getElementById('fabric-group-select').onchange = () => { loadModel(modelSelect.value); updateOrderSummary(); };

function selectModule(modEl) { if (selectedModule) selectedModule.classList.remove('selected'); selectedModule = modEl; if (selectedModule) selectedModule.classList.add('selected'); }
function startPan(e) { if (e.target.id === 'workspace' || e.target.id === 'canvas-wrapper' || e.target.id === 'canvas-area') { selectModule(null); isPanning = true; panStartX = getEventX(e); panStartY = getEventY(e); initialPanX = currentPanX; initialPanY = currentPanY; document.getElementById('workspace').style.cursor = 'grabbing'; } }
const workspaceArea = document.getElementById('workspace');
workspaceArea.addEventListener('mousedown', startPan); workspaceArea.addEventListener('touchstart', startPan, {passive: false});
workspaceArea.addEventListener('wheel', (e) => { if (e.deltaY < 0) changeZoom(0.05, e); else if (e.deltaY > 0) changeZoom(-0.05, e); e.preventDefault(); }, { passive: false });
function getEventX(e) { return e.type.includes('touch') ? e.touches[0].clientX : e.clientX; }
function getEventY(e) { return e.type.includes('touch') ? e.touches[0].clientY : e.clientY; }
function getConnectedGroup(startModule) { let group = new Set([startModule]), added = true; while(added) { added = false; document.querySelectorAll('.canvas-module').forEach(other => { if(!group.has(other)) { for(let m of group) { let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect(); if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; } } } }); } return Array.from(group); }
function toggleExpand(modEl) {
    let coll = modEl.dataset.collection, id = modEl.dataset.id, modData = furnitureModels[coll]?.find(m => m.id === id); if (!modData || !modData.expandable) return;
    let isExp = modEl.dataset.isExpanded === 'true', currentW = !isExp ? modData.w : modData.expW, currentH = !isExp ? modData.h : modData.expH, targetW = !isExp ? modData.expW : modData.w, targetH = !isExp ? modData.expH : modData.h;
    let currentAngle = parseInt(modEl.dataset.angle) || 0, rad = currentAngle * Math.PI / 180, dw = (targetW - currentW) * scale, dh = (targetH - currentH) * scale;
    let rx = (dw/2) * Math.cos(rad) - (dh/2) * Math.sin(rad), ry = (dw/2) * Math.sin(rad) + (dh/2) * Math.cos(rad);
    modEl.style.left = (parseFloat(modEl.style.left) - dw/2 + rx) + 'px'; modEl.style.top = (parseFloat(modEl.style.top) - dh/2 + ry) + 'px';
    modEl.dataset.isExpanded = !isExp; modEl.style.width = (targetW * scale) + 'px'; modEl.style.height = (targetH * scale) + 'px';
    modEl.innerHTML = (!isExp ? modData.svgExpanded : modData.svg) + `<span class="label" style="transform:rotate(${-currentAngle}deg)"></span>`; updateLabels(); updateDimensions(); saveState();
}

function addModuleToWorkspace(modData, collectionKey) {
    const el = document.createElement('div'); el.className = 'canvas-module'; Object.assign(el.dataset, { id:modData.id, name:modData.name, price:modData.price, collection:collectionKey, w:modData.w, h:modData.h, angle:0, isExpanded:'false' });
    let baseSpawnX = (window.innerWidth < 768 ? 50 : 350) - currentPanX, baseSpawnY = (window.innerWidth < 768 ? 50 : 150) - currentPanY, finalSpawnX = baseSpawnX, finalSpawnY = baseSpawnY;
    const existing = Array.from(document.querySelectorAll('.canvas-module'));
    if (existing.length > 0) { let maxR = -Infinity, refY = baseSpawnY; existing.forEach(m => { let r = (parseFloat(m.style.left)||0) + (parseFloat(m.style.width)||0); if (r > maxR) { maxR = r; refY = parseFloat(m.style.top) || baseSpawnY; } }); finalSpawnX = maxR + 15; finalSpawnY = refY; }
    el.style.cssText = `width:${modData.w*scale}px; height:${modData.h*scale}px; top:${finalSpawnY}px; left:${finalSpawnX}px; z-index:${zIndexCounter++};`;
    el.innerHTML = modData.svg + `<span class="label"></span>`; attachEvents(el); canvasArea.appendChild(el); selectModule(el); saveState(); setTimeout(() => { updateDimensions(); }, 50);
}

function globalDragOrPan(e) {
    if (isGlobalDragging) {
        const dx = getEventX(e) - dragStartX, dy = getEventY(e) - dragStartY;
        dragGroup.forEach((m, i) => { m.style.left = (dragInitials[i].left + dx) + 'px'; m.style.top = (dragInitials[i].top + dy) + 'px'; });
        const snap = 15; let snapDx = 0, snapDy = 0, sx = false, sy = false; 
        let dRect = { left: initialDraggedRect.left + dx, right: initialDraggedRect.right + dx, top: initialDraggedRect.top + dy, bottom: initialDraggedRect.bottom + dy };
        cachedOtherRects.forEach(o => {
            if (!sx) { if (Math.abs(dRect.right - o.left) < snap) { snapDx = o.left - dRect.right; sx = true; } else if (Math.abs(dRect.left - o.right) < snap) { snapDx = o.right - dRect.left; sx = true; } }
            if (!sy) { if (Math.abs(dRect.bottom - o.top) < snap) { snapDy = o.top - dRect.bottom; sy = true; } else if (Math.abs(dRect.top - o.bottom) < snap) { snapDy = o.bottom - dRect.top; sy = true; } }
        });
        if (sx || sy) dragGroup.forEach((m, i) => { m.style.left = (dragInitials[i].left + dx + snapDx) + 'px'; m.style.top = (dragInitials[i].top + dy + snapDy) + 'px'; });
        updateDimensions(); if(e.cancelable) e.preventDefault();
    } else if (isPanning) {
        currentPanX = initialPanX + (getEventX(e) - panStartX); currentPanY = initialPanY + (getEventY(e) - panStartY);
        document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
        document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
        if(e.cancelable) e.preventDefault();
    }
}

function globalStopDragOrPan() { if (isGlobalDragging) { isGlobalDragging = false; dragGroup.forEach(m => m.classList.remove('dragging')); saveState(); } if (isPanning) { isPanning = false; document.getElementById('workspace').style.cursor = 'crosshair'; setTimeout(() => { updateDimensions(); }, 50); } }
document.addEventListener('mousemove', globalDragOrPan); document.addEventListener('touchmove', globalDragOrPan, {passive: false}); document.addEventListener('mouseup', globalStopDragOrPan); document.addEventListener('touchend', globalStopDragOrPan);

function attachEvents(modEl) {
    function startDrag(e) {
        isGlobalDragging = true; draggedModule = modEl; selectModule(modEl); 
        dragGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(modEl) : [modEl];
        let topZ = zIndexCounter++; dragGroup.forEach(m => { m.style.zIndex = topZ; m.classList.add('dragging'); });
        dragStartX = getEventX(e); dragStartY = getEventY(e);
        dragInitials = dragGroup.map(m => ({ left: parseFloat(m.style.left)||0, top: parseFloat(m.style.top)||0 }));
        initialDraggedRect = modEl.getBoundingClientRect(); cachedOtherRects = [];
        document.querySelectorAll('.canvas-module').forEach(o => { if (!dragGroup.includes(o)) cachedOtherRects.push(o.getBoundingClientRect()); });
        if(e.cancelable && !e.type.includes('touch')) e.preventDefault(); 
    }
    modEl.addEventListener('mousedown', startDrag); modEl.addEventListener('touchstart', startDrag, {passive: false});
    modEl.addEventListener('dblclick', () => toggleExpand(modEl));
    let lastTap = 0; modEl.addEventListener('touchend', (e) => { let now = new Date().getTime(); if (now - lastTap < 300) { toggleExpand(modEl); e.preventDefault(); } lastTap = now; });
}

function shareConfiguration() {
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if (modules.length === 0) return alert("Sofa tuščia!");
    const cols = {}; modules.forEach(m => { const c = m.dataset.collection; if (!cols[c]) cols[c] = []; cols[c].push(`${m.dataset.id},${Math.round(parseFloat(m.style.left)/scale)},${Math.round(parseFloat(m.style.top)/scale)},${m.dataset.angle},${m.dataset.isExpanded==='true'?1:0}`); });
    const shareUrl = `${window.location.href.split('?')[0]}?s=${btoa(Object.keys(cols).map(c => `${c}:${cols[c].join('!')}`).join('~'))}`;
    navigator.clipboard.writeText(shareUrl).then(() => { const btn = document.getElementById('share-btn'); const old = btn.innerHTML; btn.innerHTML = '✅ Nuoroda nukopijuota!'; setTimeout(() => btn.innerHTML = old, 2000); });
}

// --- COLOR PICKER LOGIKA SU MOBILIUOJU PATOBULINIMU ---
const colors = [
    { name: 'Balta', hex: '#ffffff' }, { name: 'Kreminė', hex: '#fdf4e3' }, { name: 'Šv. Pilka', hex: '#e2e2e2' }, { name: 'Rusva', hex: '#c9bcae' },
    { name: 'Smėlio', hex: '#d2b48c' }, { name: 'Garstyčių', hex: '#d4af37' }, { name: 'Ryža', hex: '#c86b3c' }, { name: 'Ruda', hex: '#6b4423' },
    { name: 'Alyvuogių', hex: '#a3b18a' }, { name: 'Žalia', hex: '#5f7a61' }, { name: 'Pilka', hex: '#7a7a7a' }, { name: 'Mėlyna', hex: '#3b4d61' }
];

if(!appSettings.fabricColor) appSettings.fabricColor = '#ffffff';
document.documentElement.style.setProperty('--sofa-color', appSettings.fabricColor);

const colorStyle = document.createElement('style');
colorStyle.innerHTML = `
    .canvas-module svg *:not([fill="none"]) { fill: var(--sofa-color) !important; transition: fill 0.3s; }
    .color-picker-wrapper { background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; }
    .color-picker-title { font-weight: bold; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; color: #555; text-align: center; }
    .color-picker-container { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
    .color-dot { width: 24px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid #ccc; transition: 0.2s; }
    .color-dot.active { border-color: #222; transform: scale(1.1); box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
    
    /* Mobilioji versija */
    @media (max-width: 768px) {
        .color-picker-wrapper { 
            position: fixed; bottom: -300px; left: 0; right: 0; margin-bottom: 0; z-index: 1001; 
            box-shadow: 0 -5px 20px rgba(0,0,0,0.2); transition: bottom 0.3s ease; border-radius: 15px 15px 0 0;
        }
        .color-picker-wrapper.open { bottom: 0; }
        .mobile-color-btn { 
            position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%;
            background: #007bff; color: white; display: flex; align-items: center; justify-content: center;
            font-size: 24px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: none;
        }
        .color-dot { width: 35px; height: 35px; }
    }
`;
document.head.appendChild(colorStyle);

function changeSofaColor(hex, dotEl) {
    appSettings.fabricColor = hex; localStorage.setItem('houmySettings', JSON.stringify(appSettings));
    document.documentElement.style.setProperty('--sofa-color', hex);
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    if(dotEl) dotEl.classList.add('active');
    if(window.innerWidth <= 768) document.querySelector('.color-picker-wrapper').classList.remove('open');
}

const rightSidebarMenu = document.getElementById('sidebar-right');
if (rightSidebarMenu) {
    const wrapper = document.createElement('div'); wrapper.className = 'color-picker-wrapper';
    const title = document.createElement('div'); title.className = 'color-picker-title'; title.innerText = "Audinio Spalva";
    const container = document.createElement('div'); container.className = 'color-picker-container';
    colors.forEach(c => {
        const dot = document.createElement('div'); dot.className = 'color-dot' + (appSettings.fabricColor === c.hex ? ' active' : '');
        dot.style.background = c.hex; dot.title = c.name; dot.onclick = () => changeSofaColor(c.hex, dot); container.appendChild(dot);
    });
    wrapper.appendChild(title); wrapper.appendChild(container); rightSidebarMenu.insertBefore(wrapper, rightSidebarMenu.firstChild);

    if(window.innerWidth <= 768) {
        const mobBtn = document.createElement('button'); mobBtn.className = 'mobile-color-btn'; mobBtn.innerHTML = '🎨';
        mobBtn.onclick = (e) => { e.stopPropagation(); wrapper.classList.toggle('open'); };
        document.body.appendChild(mobBtn);
        document.addEventListener('click', () => wrapper.classList.remove('open'));
        wrapper.onclick = (e) => e.stopPropagation();
    }

    if (!document.getElementById('share-btn')) {
        const shareBtn = document.createElement('button'); shareBtn.id = 'share-btn'; shareBtn.className = 'action-btn'; shareBtn.style.cssText = "background:#6c757d; margin-bottom: 6px;";
        shareBtn.innerHTML = "🔗 Dalintis nuoroda"; shareBtn.onclick = shareConfiguration;
        const pdfBtn = rightSidebarMenu.querySelector('button[onclick="openClientModal()"]');
        if (pdfBtn) rightSidebarMenu.insertBefore(shareBtn, pdfBtn); else rightSidebarMenu.appendChild(shareBtn);
    }
}

updateZoomText();
const urlParams = new URLSearchParams(window.location.search), sharedStateNew = urlParams.get('s'), sharedStateOld = urlParams.get('share');
if (sharedStateNew || sharedStateOld) {
    try {
        let parsed = [];
        if (sharedStateNew) {
            atob(sharedStateNew).split('~').forEach(g => { const p = g.split(':'); if (p[1]) p[1].split('!').forEach(m => { const [i,x,y,a,e] = m.split(','); parsed.push({c:p[0], i, x:parseInt(x), y:parseInt(y), a:parseInt(a), e:parseInt(e)}); }); });
        } else parsed = JSON.parse(decodeURIComponent(atob(sharedStateOld)));
        loadModel(parsed[0].c); canvasArea.innerHTML = '';
        parsed.forEach(d => {
            let b = furnitureModels[d.c]?.find(x => x.id === d.i); if (!b) return;
            const el = document.createElement('div'); el.className = 'canvas-module'; Object.assign(el.dataset, { id: d.i, name: b.name, price: b.price, collection: d.c, w: b.w, h: b.h, angle: d.a, isExpanded: d.e === 1 ? 'true' : 'false' });
            el.style.cssText = `width:${b.w*scale}px; height:${b.h*scale}px; left:${d.x*scale}px; top:${d.y*scale}px; z-index:${zIndexCounter++}; transform:rotate(${d.a}deg)`;
            el.innerHTML = (d.e === 1 && b.expandable ? b.svgExpanded : b.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; attachEvents(el); canvasArea.appendChild(el);
        });
        updateOrderSummary(); updateLabels(); setTimeout(() => updateDimensions(), 50); saveState();
    } catch (e) { alert("Nuoroda sugadinta."); }
} else { loadModel(modelSelect.value); const saved = localStorage.getItem('sofaState'); if(saved) restoreState(JSON.parse(saved)); }
