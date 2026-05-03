// Nustatome versijos pavadinimą
const watermarkEl = document.getElementById('version-watermark');
watermarkEl.innerText = "V1.20";
watermarkEl.style.cssText = "position: absolute; bottom: 8px; right: 10px; font-size: 11px; color: #888; z-index: 100; pointer-events: none; opacity: 0.7;";

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
    if (dimState === 0) { btn.style.background = 'transparent'; btn.style.borderColor = 'transparent'; ind.innerText = ''; }
    else if (dimState === 1) { btn.style.background = '#eef5ff'; btn.style.borderColor = '#b8daff'; ind.innerText = '1'; }
    else if (dimState === 2) { btn.style.background = '#cce5ff'; btn.style.borderColor = '#007bff'; ind.innerText = '2'; }
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
let isPanning = false, panStartX = 0, panStartY = 0, currentPanX = 0, currentPanY = 0, initialPanX = 0, initialPanY = 0;

function getDisplayName(modData, isMixed) { return isMixed ? `${modData.collection.toUpperCase()} ${modData.name}` : modData.name; }

function generateModuleChainText(modules, isMixed) {
    if (!modules || modules.length === 0) return "";
    let sorted = [...modules].sort((a,b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    if (!isMixed) return sorted.map(m => m.dataset.name).join(' + ');
    return sorted.map(m => `${m.dataset.collection.toUpperCase()} ${m.dataset.name}`).join(' + ');
}

function updateLabels() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1;
    modules.forEach(m => {
        const label = m.querySelector('.label'); if(!label) return;
        const modBase = rawModels[m.dataset.collection]?.find(x => x.id === m.dataset.id);
        let expIcon = modBase && modBase.expandable ? ' <b style="color:#007bff; font-size:14px;">⇕</b>' : '';
        label.innerHTML = `${getDisplayName({collection: m.dataset.collection, name: m.dataset.name}, isMixed)}${expIcon}<br><span class="dim-text">${m.dataset.w}x${m.dataset.h}</span>`;
    });
}

function getModulePrice(collectionKey, moduleId) {
    let modBase = rawModels[collectionKey]?.find(m => m.id === moduleId); if (!modBase) return 0;
    let basePrice = appSettings.customPrices[collectionKey + '_' + moduleId] !== undefined ? appSettings.customPrices[collectionKey + '_' + moduleId] : (modBase.price || getPrice(modBase.w, modBase.h));
    let group = parseInt(document.getElementById('fabric-group-select').value) || 1;
    return basePrice + (modBase.prices && group > 1 ? modBase.prices['gr' + group] || 0 : 0);
}

function updateZoomText() { document.getElementById('zoom-level').innerText = Math.round((scale / 1.5) * 100) + '%'; }

function changeZoom(f, e = null) { 
    let oldScale = scale; scale = Math.max(0.4, Math.min(2.5, scale + f)); let ratio = scale / oldScale;
    let rect = document.getElementById('workspace').getBoundingClientRect();
    let mouseX = e ? (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left : rect.width / 2;
    let mouseY = e ? (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top : rect.height / 2;
    let relX = mouseX - currentPanX, relY = mouseY - currentPanY;
    currentPanX = mouseX - relX * ratio; currentPanY = mouseY - relY * ratio;
    document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
    document.querySelectorAll('.canvas-module').forEach(m => {
        m.style.width = (parseFloat(m.style.width) / oldScale * scale) + 'px';
        m.style.height = (parseFloat(m.style.height) / oldScale * scale) + 'px';
        m.style.left = (parseFloat(m.style.left) * ratio) + 'px';
        m.style.top = (parseFloat(m.style.top) * ratio) + 'px';
    });
    updateZoomText(); setTimeout(() => { updateDimensions(); }, 50); 
}

function saveState() { 
    const s = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({
        id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, 
        l: (parseFloat(m.style.left) || 0) / scale, t: (parseFloat(m.style.top) || 0) / scale,
        a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded
    })); 
    const stateStr = JSON.stringify(s); historyStack.push(stateStr); if(historyStack.length > 20) historyStack.shift(); 
    localStorage.setItem('sofaState', stateStr); updateOrderSummary(); updateLabels();
}

function restoreState(data) { 
    canvasArea.innerHTML=''; 
    data.forEach(d=>{ 
        let modBase = furnitureModels[d.c]?.find(x=>x.id===d.id); if (!modBase) return;
        const el=document.createElement('div'); el.className='canvas-module'; 
        Object.assign(el.dataset,{id:d.id, name:d.n, price:d.p, collection:d.c, w:d.w, h:d.h, angle:d.a, isExpanded: d.exp || 'false'}); 
        let leftVal = (typeof d.l === 'number') ? d.l * scale : parseFloat(d.l);
        let topVal = (typeof d.t === 'number') ? d.t * scale : parseFloat(d.t);
        el.style.cssText=`width:${d.w*scale}px; height:${d.h*scale}px; left:${leftVal}px; top:${topVal}px; z-index:${d.z}; transform:rotate(${d.a}deg)`; 
        el.innerHTML= (d.exp === 'true' && modBase.expandable ? modBase.svgExpanded : modBase.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; 
        attachEvents(el); canvasArea.appendChild(el); 
    }); 
    updateOrderSummary(); updateLabels(); setTimeout(() => { updateDimensions(); }, 50);
}

function clearWorkspace() { 
    if(confirm("Išvalyti viską?")) { 
        canvasArea.innerHTML = ''; currentPanX = 0; currentPanY = 0;
        document.getElementById('canvas-wrapper').style.transform = `translate(0px, 0px)`;
        document.getElementById('workspace').style.backgroundPosition = `0px 0px`;
        saveState(); updateDimensions(); 
    } 
}

function updateOrderSummary() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1;
    let counts = {}, total = 0;
    modules.forEach(m => {
        let dName = getDisplayName({collection: m.dataset.collection, name: m.dataset.name}, isMixed);
        let price = getModulePrice(m.dataset.collection, m.dataset.id);
        if(!counts[dName]) counts[dName] = { qty: 0, price: price };
        counts[dName].qty++; total += price;
    });
    orderList.innerHTML = Object.keys(counts).length ? Object.keys(counts).map(n => `<div class="order-item"><span><b>${counts[n].qty}x</b> ${n}</span><span>${counts[n].price * counts[n].qty} €</span></div>`).join('') : '<div style="color:#888; text-align:center; padding: 20px 0;">Sofa tuščia</div>'; 
    document.getElementById('module-chain-display').innerText = "Specifikacija: " + generateModuleChainText(modules, isMixed);
    totalPriceEl.innerText = total;
}

function updateDimensions() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    const svgAr = document.getElementById('svg-arrows');
    svgAr.style.overflow = 'visible';
    if (modules.length === 0) { document.getElementById('dimension-display').innerHTML = 'Išmatavimai: <b>0 x 0 cm</b>'; svgAr.style.display = 'none'; return; }
    
    let groups = [], unvisited = new Set(modules);
    while(unvisited.size > 0) {
        let startMod = unvisited.values().next().value, group = new Set([startMod]), added = true;
        while(added) { added = false; for(let other of unvisited) { if(!group.has(other)) { for(let m of group) { let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect(); if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; } } } } }
        groups.push(Array.from(group)); group.forEach(m => unvisited.delete(m));
    }
    groups.sort((a, b) => { let aX = Math.min(...a.map(m => parseFloat(m.style.left))), aY = Math.min(...a.map(m => parseFloat(m.style.top))); let bX = Math.min(...b.map(m => parseFloat(m.style.left))), bY = Math.min(...b.map(m => parseFloat(m.style.top))); return (aY + aX) - (bY + bX); });

    let GMinX = Infinity, GMinY = Infinity, GMaxX = -Infinity, GMaxY = -Infinity;
    groups.forEach(g => { g.forEach(m => {
        let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180, dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2, cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
        [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
            let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle), ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
            GMinX = Math.min(GMinX, rx); GMaxX = Math.max(GMaxX, rx); GMinY = Math.min(GMinY, ry); GMaxY = Math.max(GMaxY, ry);
        });
    }); });
    let GCX = (GMinX + GMaxX) / 2, GCY = (GMinY + GMaxY) / 2;
    let svgContent = `<defs><marker id="tick" markerWidth="1.5" markerHeight="10" refX="0.75" refY="5" orient="auto"><rect x="0" y="0" width="1.5" height="10" fill="#555" /></marker></defs>`;
    svgAr.style.display = (dimState > 0) ? 'block' : 'none';
    let displayTexts = [];
    groups.forEach((g, index) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.forEach(m => {
            let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180, dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2, cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
            [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
                let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle), ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
            });
        });
        const totalW = Math.round((maxX - minX) / scale), totalH = Math.round((maxY - minY) / scale);
        displayTexts.push(`${groups.length > 1 ? 'Baldo '+(index+1)+' išmatavimai:' : 'Išmatavimai:'} <b style="color:#007bff">${totalW} x ${totalH} cm</b>`);
        if (dimState > 0) {
            let offset = 35, cx = (minX + maxX)/2, cy = (minY + maxY)/2;
            let lineY = (Math.round(cy) <= Math.round(GCY)) ? minY - offset : maxY + offset;
            let lineX = (Math.round(cx) >= Math.round(GCX) || groups.length === 1) ? maxX + offset : minX - offset;
            let extStyle = "stroke='#aaa' stroke-width='0.5' stroke-dasharray='4,4' fill='none'";
            svgContent += `<line x1="${minX}" y1="${Math.round(cy)<=Math.round(GCY)?minY:maxY}" x2="${minX}" y2="${lineY}" ${extStyle} /><line x1="${maxX}" y1="${Math.round(cy)<=Math.round(GCY)?minY:maxY}" x2="${maxX}" y2="${lineY}" ${extStyle} />`;
            svgContent += `<line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1?maxX:minX}" y1="${minY}" x2="${lineX}" y2="${minY}" ${extStyle} /><line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1?maxX:minX}" y1="${maxY}" x2="${lineX}" y2="${maxY}" ${extStyle} />`;
            svgContent += `<path d="M ${minX} ${lineY} L ${maxX} ${lineY}" stroke="#555" stroke-width="0.8" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${cx}" y="${Math.round(cy)<=Math.round(GCY)?lineY-6:lineY+16}" fill="#333" font-size="12" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalW} cm</text>`;
            svgContent += `<path d="M ${lineX} ${minY} L ${lineX} ${maxY}" stroke="#555" stroke-width="0.8" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${Math.round(cx)>=Math.round(GCX)||groups.length===1?lineX+16:lineX-6}" y="${cy+4}" transform="rotate(-90 ${Math.round(cx)>=Math.round(GCX)||groups.length===1?lineX+16:lineX-6} ${cy+4})" fill="#333" font-size="12" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalH} cm</text>`;
        }
    });
    if (dimState === 2 && groups.length > 1) {
        let offset = 85, totalW = Math.round((GMaxX - GMinX) / scale), totalH = Math.round((GMaxY - GMinY) / scale);
        let extStyle = "stroke='#007bff' stroke-width='0.5' stroke-dasharray='4,4' fill='none' opacity='0.5'";
        svgContent += `<line x1="${GMinX}" y1="${GMinY}" x2="${GMinX}" y2="${GMinY-offset}" ${extStyle} /><line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX}" y2="${GMinY-offset}" ${extStyle} /><line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX+offset}" y2="${GMinY}" ${extStyle} /><line x1="${GMaxX}" y1="${GMaxY}" x2="${GMaxX+offset}" y2="${GMaxY}" ${extStyle} />`;
        svgContent += `<path d="M ${GMinX} ${GMinY-offset} L ${GMaxX} ${GMinY-offset}" stroke="#007bff" stroke-width="1.2" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${GCX}" y="${GMinY-offset-6}" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalW} cm (Viso)</text>`;
        svgContent += `<path d="M ${GMaxX+offset} ${GMinY} L ${GMaxX+offset} ${GMaxY}" stroke="#007bff" stroke-width="1.2" marker-start="url(#tick)" marker-end="url(#tick)" /><text x="${GMaxX+offset+18}" y="${GCY+5}" transform="rotate(-90 ${GMaxX+offset+18} ${GCY+5})" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalH} cm (Viso)</text>`;
        displayTexts.unshift(`<b>Bendri išmatavimai:</b> <b style="color:#007bff">${totalW} x ${totalH} cm</b>`); 
    }
    svgAr.innerHTML = svgContent; document.getElementById('dimension-display').innerHTML = displayTexts.join('<br>');
}

function loadModel(modelKey) {
    const list = document.getElementById('module-list'); list.innerHTML = ''; if(!furnitureModels[modelKey]) return;
    furnitureModels[modelKey].forEach(mod => {
        const btn = document.createElement('div'); btn.className = 'menu-item';
        btn.innerHTML = `<span>${mod.name}${mod.expandable ? ' ⇕' : ''}<br><small>${mod.w}x${mod.h} cm</small></span> <span class="menu-price">${getModulePrice(modelKey, mod.id)}€</span>`;
        btn.onclick = () => addModuleToWorkspace(mod, modelKey); list.appendChild(btn);
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

function getConnectedGroup(startModule) {
    let group = new Set([startModule]), added = true;
    while(added) { added = false; document.querySelectorAll('.canvas-module').forEach(other => { if(!group.has(other)) { for(let m of group) { let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect(); if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; } } } }); }
    return Array.from(group);
}

function rotateSelected(degrees) {
    if (!selectedModule) return;
    let targetGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(selectedModule) : [selectedModule];
    if (targetGroup.length === 1) {
        let m = targetGroup[0]; let curA = parseInt(m.dataset.angle) || 0;
        m.dataset.angle = curA + degrees; m.style.transform = `rotate(${m.dataset.angle}deg)`;
        m.querySelector('.label').style.transform = `rotate(${-m.dataset.angle}deg)`;
    } else {
        let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
        targetGroup.forEach(m => { let w=parseFloat(m.style.width), h=parseFloat(m.style.height), cx=parseFloat(m.style.left)+w/2, cy=parseFloat(m.style.top)+h/2; minX=Math.min(minX,cx-w/2); minY=Math.min(minY,cy-h/2); maxX=Math.max(maxX,cx+w/2); maxY=Math.max(maxY,cy+h/2); });
        let gCX = (minX+maxX)/2, gCY = (minY+maxY)/2;
        targetGroup.forEach(m => {
            let w=parseFloat(m.style.width), h=parseFloat(m.style.height), cx=parseFloat(m.style.left)+w/2, cy=parseFloat(m.style.top)+h/2, nx, ny;
            if(degrees===90) { nx = gCX-(cy-gCY); ny = gCY+(cx-gCX); } else if(degrees===-90) { nx = gCX+(cy-gCY); ny = gCY-(cx-gCX); } else { nx = gCX-(cx-gCX); ny = gCY-(cy-gCY); }
            m.style.left = (nx-w/2)+'px'; m.style.top = (ny-h/2)+'px';
            m.dataset.angle = (parseInt(m.dataset.angle)||0)+degrees; m.style.transform = `rotate(${m.dataset.angle}deg)`;
            m.querySelector('.label').style.transform = `rotate(${-m.dataset.angle}deg)`;
        });
    }
    setTimeout(() => { updateDimensions(); saveState(); }, 50);
}

function deleteSelected() { if (!selectedModule) return; let tg = document.getElementById('group-toggle').checked ? getConnectedGroup(selectedModule) : [selectedModule]; tg.forEach(m => m.remove()); selectModule(null); saveState(); updateDimensions(); }

function addModuleToWorkspace(modData, collectionKey) {
    const el = document.createElement('div'); el.className = 'canvas-module'; Object.assign(el.dataset, { id:modData.id, name:modData.name, price:modData.price, collection:collectionKey, w:modData.w, h:modData.h, angle:0, isExpanded:'false' });
    let baseSpawnX = (window.innerWidth < 768 ? 50 : 350) - currentPanX, baseSpawnY = (window.innerWidth < 768 ? 50 : 150) - currentPanY, finalX = baseSpawnX, finalY = baseSpawnY;
    const existing = Array.from(document.querySelectorAll('.canvas-module'));
    if (existing.length > 0) { let maxR = -Infinity, refY = baseSpawnY; existing.forEach(m => { let r = (parseFloat(m.style.left)||0) + (parseFloat(m.style.width)||0); if (r > maxR) { maxR = r; refY = parseFloat(m.style.top) || baseSpawnY; } }); finalX = maxR + 15; finalY = refY; }
    el.style.cssText = `width:${modData.w*scale}px; height:${modData.h*scale}px; top:${finalY}px; left:${finalX}px; z-index:${zIndexCounter++};`;
    el.innerHTML = modData.svg + `<span class="label"></span>`; attachEvents(el); canvasArea.appendChild(el); selectModule(el); saveState(); setTimeout(() => updateDimensions(), 50);
}

function globalDragOrPan(e) {
    if (isGlobalDragging) {
        const dx = getEventX(e) - dragStartX, dy = getEventY(e) - dragStartY;
        dragGroup.forEach((m, i) => { m.style.left = (dragInitials[i].left + dx) + 'px'; m.style.top = (dragInitials[i].top + dy) + 'px'; });
        const snap = 15; let snapDx = 0, snapDy = 0, sx = false, sy = false; 
        let dRect = { left: initialDraggedRect.left + dx, right: initialDraggedRect.right + dx, top: initialDraggedRect.top + dy, bottom: initialDraggedRect.bottom + dy };
        cachedOtherRects.forEach(o => {
            if (!sx) {
                if (Math.abs(dRect.right - o.left) < snap) { snapDx = o.left - dRect.right; sx = true; }
                else if (Math.abs(dRect.left - o.right) < snap) { snapDx = o.right - dRect.left; sx = true; }
                else if (Math.abs(dRect.left - o.left) < snap) { snapDx = o.left - dRect.left; sx = true; }
                else if (Math.abs(dRect.right - o.right) < snap) { snapDx = o.right - dRect.right; sx = true; }
            }
            if (!sy) {
                if (Math.abs(dRect.bottom - o.top) < snap) { snapDy = o.top - dRect.bottom; sy = true; }
                else if (Math.abs(dRect.top - o.bottom) < snap) { snapDy = o.bottom - dRect.top; sy = true; }
                else if (Math.abs(dRect.top - o.top) < snap) { snapDy = o.top - dRect.top; sy = true; }
                else if (Math.abs(dRect.bottom - o.bottom) < snap) { snapDy = o.bottom - dRect.bottom; sy = true; }
            }
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

function globalStopDragOrPan() { if (isGlobalDragging) { isGlobalDragging = false; dragGroup.forEach(m => m.classList.remove('dragging')); saveState(); } if (isPanning) { isPanning = false; document.getElementById('workspace').style.cursor = 'crosshair'; setTimeout(() => updateDimensions(), 50); } }
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
}

// --- VEIKSMŲ MYGTUKAI ---
function openAdmin() { document.getElementById('admin-modal').style.display = 'flex'; let cont = document.getElementById('admin-prices-container'); cont.innerHTML = ''; for(let k in rawModels) { cont.innerHTML += `<h4 style="text-transform:uppercase; margin-top:15px; border-bottom:1px solid #eee;">${k}</h4><div class="admin-price-grid">` + rawModels[k].map(m => { let pK = k+'_'+m.id; return `<div class="admin-price-card"><div>${m.name}</div><input type="number" data-pkey="${pK}" class="admin-price-input" value="${appSettings.customPrices[pK]||m.price||getPrice(m.w,m.h)}"></div>`; }).join('') + `</div>`; } }
function closeAdmin() { document.getElementById('admin-modal').style.display = 'none'; }
function saveAdminSettings() { document.querySelectorAll('.admin-price-input').forEach(i => { let v = parseInt(i.value); if(v>0) appSettings.customPrices[i.dataset.pkey]=v; else delete appSettings.customPrices[i.dataset.pkey]; }); localStorage.setItem('houmySettings', JSON.stringify(appSettings)); location.reload(); }
function openArchive() { document.getElementById('archive-modal').style.display = 'flex'; renderArchiveList(); }
function renderArchiveList() { let arc = JSON.parse(localStorage.getItem('houmyArchive')||'{}'), html = ''; for(let n in arc) { html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border:1px solid #ddd; margin-bottom:5px;"><strong>${n}</strong><div><button onclick="loadFromArchive('${n}')" style="margin-right:5px; background:#007bff; color:white; border:none; padding:4px 8px; cursor:pointer;">Užkrauti</button><button onclick="deleteFromArchive('${n}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; cursor:pointer;">Ištrinti</button></div></div>`; } document.getElementById('archive-list').innerHTML = html || 'Archyvas tuščias'; }
function saveToArchive() { let n = document.getElementById('archive-name').value.trim(); if(!n) return alert("Įveskite pavadinimą"); let s = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({ id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, l:parseFloat(m.style.left)/scale, t:parseFloat(m.style.top)/scale, a:m.dataset.angle, exp:m.dataset.isExpanded })); let arc = JSON.parse(localStorage.getItem('houmyArchive')||'{}'); arc[n]=s; localStorage.setItem('houmyArchive', JSON.stringify(arc)); document.getElementById('archive-name').value=''; renderArchiveList(); }
function loadFromArchive(n) { let arc = JSON.parse(localStorage.getItem('houmyArchive')||'{}'); if(arc[n]) { restoreState(arc[n]); document.getElementById('archive-modal').style.display='none'; } }
function deleteFromArchive(n) { if(confirm("Trinti?")) { let arc = JSON.parse(localStorage.getItem('houmyArchive')||'{}'); delete arc[n]; localStorage.setItem('houmyArchive', JSON.stringify(arc)); renderArchiveList(); } }

function shareConfiguration() {
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if (modules.length === 0) return alert("Sofa tuščia!");
    const cols = {}; modules.forEach(m => { const c = m.dataset.collection; if (!cols[c]) cols[c] = []; cols[c].push(`${m.dataset.id},${Math.round(parseFloat(m.style.left)/scale)},${Math.round(parseFloat(m.style.top)/scale)},${m.dataset.angle},${m.dataset.isExpanded==='true'?1:0}`); });
    const shareUrl = `${window.location.href.split('?')[0]}?s=${btoa(Object.keys(cols).map(c => `${c}:${cols[c].join('!')}`).join('~'))}`;
    navigator.clipboard.writeText(shareUrl).then(() => { const btn = document.getElementById('share-btn'); const old = btn.innerHTML; btn.innerHTML = '✅ Nuoroda nukopijuota!'; setTimeout(() => btn.innerHTML = old, 2000); });
}

// --- PDF IR BRĖŽINIAI ---
async function generatePDFWithDetails() { 
    appSettings.prodTerm = document.getElementById('client-term').value.trim(); appSettings.deliveryNote = document.getElementById('client-delivery').value.trim(); localStorage.setItem('houmySettings', JSON.stringify(appSettings)); 
    document.getElementById('client-modal').style.display = 'none'; selectModule(null); 
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if(modules.length===0) return;
    let pName = document.getElementById('project-name').value.trim(), discountVal = parseInt(document.getElementById('client-discount').value) || 0;
    document.getElementById('pdf-main-title').innerText = pName || "Komercinis Pasiūlymas"; 
    document.querySelectorAll('.dynamic-bb').forEach(e => e.style.display = 'none'); 
    document.getElementById('zoom-controls').style.display = 'none'; document.getElementById('dimension-display').style.display = 'none'; 
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity; 
    modules.forEach(m => { let a=(parseInt(m.dataset.angle)||0)*Math.PI/180, w=parseFloat(m.dataset.w)*scale, h=parseFloat(m.dataset.h)*scale, cx=parseFloat(m.style.left)+w/2, cy=parseFloat(m.style.top)+h/2, dx=w/2, dy=h/2; [{x:-dx,y:-dy},{x:dx,y:-dy},{x:dx,y:dy},{x:-dx,y:dy}].forEach(c => { let rx=cx+c.x*Math.cos(a)-c.y*Math.sin(a), ry=cy+c.x*Math.sin(a)+c.y*Math.cos(a); minX=Math.min(minX,rx); maxX=Math.max(maxX,rx); minY=Math.min(minY,ry); maxY=Math.max(maxY,ry); }); }); 
    let pad = dimState===2 ? 160 : 90, sX = pad-minX, sY = pad-minY, oP = new Map();
    modules.forEach(m => { oP.set(m, { l: m.style.left, t: m.style.top }); m.style.left = (parseFloat(m.style.left)+sX)+'px'; m.style.top = (parseFloat(m.style.top)+sY)+'px'; });
    updateDimensions(); const wrap = document.getElementById('canvas-wrapper'); let oTr = wrap.style.transform, oW = wrap.style.width, oH = wrap.style.height;
    wrap.style.transform = 'translate(0px, 0px)'; wrap.style.width = ((maxX-minX)+pad*2)+'px'; wrap.style.height = ((maxY-minY)+pad*2)+'px';
    await new Promise(r => setTimeout(r, 250)); const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    wrap.style.transform = oTr; wrap.style.width = oW; wrap.style.height = oH; modules.forEach(m => { let o = oP.get(m); m.style.left = o.l; m.style.top = o.t; });
    updateDimensions(); document.getElementById('zoom-controls').style.display = 'flex'; document.getElementById('dimension-display').style.display = 'block'; 
    document.getElementById('pdf-sofa-img').src = canvas.toDataURL('image/jpeg', 0.95); 
    const tb = document.getElementById('pdf-table-body'); tb.innerHTML = '';
    const isM = new Set(modules.map(m => m.dataset.collection)).size > 1; let counts = {}, total = 0;
    modules.forEach(m => { let dN = getDisplayName({collection:m.dataset.collection, name:m.dataset.name}, isM), p = getModulePrice(m.dataset.collection, m.dataset.id); if(!counts[dN]) counts[dN] = { q:0, p:p }; counts[dN].q++; total += p; });
    for(let n in counts) { tb.innerHTML += `<tr><td style="padding:6px 8px; border-bottom:1px solid #eee;">${n}</td><td style="text-align:center; border-bottom:1px solid #eee;">${counts[n].q} vnt.</td><td style="text-align:right; border-bottom:1px solid #eee;"><b>${counts[n].p * counts[n].q} €</b></td></tr>`; }
    let fT = discountVal > 0 ? total - Math.round(total * (discountVal/100)) : total;
    document.getElementById('pdf-price-breakdown').innerHTML = `<div style="font-size:16px; font-weight:bold; border-top: 2px solid #333; padding-top: 4px;">Viso su PVM: ${fT} €</div>`;
    const pdfT = document.getElementById('pdf-template'); pdfT.style.display = 'flex';
    await html2canvas(pdfT, { scale: 2, useCORS: true }).then(c => { const pdf = new jspdf.jsPDF('p', 'mm', 'a4'); pdf.addImage(c.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297); pdf.save(pName ? `Houmy_${pName}.pdf` : 'Houmy_Pasiulymas.pdf'); });
    pdfT.style.display = 'none';
}

function openBlueprintModal() { if(document.querySelectorAll('.canvas-module').length === 0) return alert("Sofa tuščia!"); document.getElementById('blueprint-modal').style.display = 'flex'; }

async function executeExportBlueprint() { 
    document.getElementById('blueprint-modal').style.display = 'none'; selectModule(null); 
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if(modules.length===0) return;
    document.querySelectorAll('.dynamic-bb').forEach(e => e.style.display = 'none'); 
    document.getElementById('zoom-controls').style.display = 'none'; document.getElementById('dimension-display').style.display = 'none'; 
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity; 
    modules.forEach(m => { let a=(parseInt(m.dataset.angle)||0)*Math.PI/180, w=parseFloat(m.dataset.w)*scale, h=parseFloat(m.dataset.h)*scale, cx=parseFloat(m.style.left)+w/2, cy=parseFloat(m.style.top)+h/2, dx=w/2, dy=h/2; [{x:-dx,y:-dy},{x:dx,y:-dy},{x:dx,y:dy},{x:-dx,y:dy}].forEach(c => { let rx=cx+c.x*Math.cos(a)-c.y*Math.sin(a), ry=cy+c.x*Math.sin(a)+c.y*Math.cos(a); minX=Math.min(minX,rx); maxX=Math.max(maxX,rx); minY=Math.min(minY,ry); maxY=Math.max(maxY,ry); }); }); 
    let pad = dimState===2 ? 160 : 90, sX = pad-minX, sY = pad-minY, oP = new Map();
    modules.forEach(m => { oP.set(m, { l: m.style.left, t: m.style.top }); m.style.left = (parseFloat(m.style.left)+sX)+'px'; m.style.top = (parseFloat(m.style.top)+sY)+'px'; });
    updateDimensions(); const wrap = document.getElementById('canvas-wrapper'); let oTr = wrap.style.transform, oW = wrap.style.width, oH = wrap.style.height;
    wrap.style.transform = 'translate(0px, 0px)'; wrap.style.width = ((maxX-minX)+pad*2)+'px'; wrap.style.height = ((maxY-minY)+pad*2)+'px';
    await new Promise(r => setTimeout(r, 250)); const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    wrap.style.transform = oTr; wrap.style.width = oW; wrap.style.height = oH; modules.forEach(m => { let o = oP.get(m); m.style.left = o.l; m.style.top = o.t; });
    updateDimensions(); document.getElementById('zoom-controls').style.display = 'flex'; document.getElementById('dimension-display').style.display = 'block'; 
    document.getElementById('bp-img-container').innerHTML = `<img src="${canvas.toDataURL('image/jpeg', 0.95)}" style="max-width:100%">`;
    const isM = new Set(modules.map(m => m.dataset.collection)).size > 1;
    document.getElementById('bp-collection').innerText = Array.from(new Set(modules.map(m => m.dataset.collection.toUpperCase()))).join(' + ');
    document.getElementById('bp-chain').innerText = generateModuleChainText(modules, isM);
    const bpT = document.getElementById('blueprint-template'); bpT.style.display = 'flex';
    await html2canvas(bpT, { scale: 2, useCORS: true }).then(c => { let l = document.createElement('a'); l.download = 'Houmy_Brezinys.jpg'; l.href = c.toDataURL('image/jpeg', 0.9); l.click(); });
    bpT.style.display = 'none';
}

// --- SPALVŲ PASIRINKIMAS IR MOBILI VERSIJA ---
const colors = [{ name: 'Balta', hex: '#ffffff' }, { name: 'Kreminė', hex: '#fdf4e3' }, { name: 'Šv. Pilka', hex: '#e2e2e2' }, { name: 'Rusva', hex: '#c9bcae' }, { name: 'Smėlio', hex: '#d2b48c' }, { name: 'Garstyčių', hex: '#d4af37' }, { name: 'Ryža', hex: '#c86b3c' }, { name: 'Ruda', hex: '#6b4423' }, { name: 'Alyvuogių', hex: '#a3b18a' }, { name: 'Žalia', hex: '#5f7a61' }, { name: 'Pilka', hex: '#7a7a7a' }, { name: 'Mėlyna', hex: '#3b4d61' }];
if(!appSettings.fabricColor) appSettings.fabricColor = '#ffffff';
document.documentElement.style.setProperty('--sofa-color', appSettings.fabricColor);
const colorStyle = document.createElement('style');
colorStyle.innerHTML = `.canvas-module svg *:not([fill="none"]) { fill: var(--sofa-color) !important; transition: fill 0.3s; } .color-picker-wrapper { background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; } .color-picker-container { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; } .color-dot { width: 24px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid #ccc; transition: 0.2s; } .color-dot.active { border-color: #222; transform: scale(1.1); } @media (max-width: 768px) { .color-picker-wrapper { position: fixed; bottom: -300px; left: 0; right: 0; margin-bottom: 0; z-index: 1001; box-shadow: 0 -5px 20px rgba(0,0,0,0.2); transition: bottom 0.3s; border-radius: 15px 15px 0 0; padding: 20px; } .color-picker-wrapper.open { bottom: 0; } .mobile-color-btn { position: fixed; bottom: 20px; right: 20px; width: 50px; height: 50px; border-radius: 50%; background: #007bff; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: none; } }`;
document.head.appendChild(colorStyle);
function changeSofaColor(hex, dotEl) { appSettings.fabricColor = hex; localStorage.setItem('houmySettings', JSON.stringify(appSettings)); document.documentElement.style.setProperty('--sofa-color', hex); document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); if(dotEl) dotEl.classList.add('active'); if(window.innerWidth <= 768) document.querySelector('.color-picker-wrapper').classList.remove('open'); }
const sideR = document.getElementById('sidebar-right');
if (sideR) {
    const wrap = document.createElement('div'); wrap.className = 'color-picker-wrapper';
    const cont = document.createElement('div'); cont.className = 'color-picker-container';
    colors.forEach(c => { const dot = document.createElement('div'); dot.className = 'color-dot' + (appSettings.fabricColor === c.hex ? ' active' : ''); dot.style.background = c.hex; dot.onclick = () => changeSofaColor(c.hex, dot); cont.appendChild(dot); });
    wrap.innerHTML = `<div style="text-align:center; font-weight:bold; font-size:11px; margin-bottom:8px; color:#555;">Audinio Spalva</div>`; wrap.appendChild(cont); sideR.insertBefore(wrap, sideR.firstChild);
    if (!document.getElementById('share-btn')) { let sB = document.createElement('button'); sB.id = 'share-btn'; sB.className = 'action-btn'; sB.style.cssText = "background:#6c757d; margin-bottom: 6px;"; sB.innerHTML = "🔗 Dalintis nuoroda"; sB.onclick = shareConfiguration; let pB = sideR.querySelector('button[onclick="openClientModal()"]'); if (pB) sideR.insertBefore(sB, pB); else sideR.appendChild(sB); }
    if(window.innerWidth <= 768) { let mB = document.createElement('button'); mB.className = 'mobile-color-btn'; mB.innerHTML = '🎨'; mB.onclick = (e) => { e.stopPropagation(); wrap.classList.toggle('open'); }; document.body.appendChild(mB); document.addEventListener('click', () => wrap.classList.remove('open')); wrap.onclick = (e) => e.stopPropagation(); }
}

// --- KLAVIATŪRA IR PRADINIS UŽKROVIMAS ---
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if(e.ctrlKey && e.key === 'z') undo();
    if(selectedModule) { if(e.key === 'q') rotateSelected(-90); if(e.key === 'e') rotateSelected(90); if(e.key === 'Delete' || e.key === 'Backspace') deleteSelected(); }
});

updateZoomText();
const sN = new URLSearchParams(window.location.search).get('s');
if (sN) {
    try {
        let p = []; atob(sN).split('~').forEach(g => { const x = g.split(':'); if (x[1]) x[1].split('!').forEach(m => { const [i,lx,ty,a,e] = m.split(','); p.push({c:x[0], i, x:parseInt(lx), y:parseInt(ty), a:parseInt(a), e:parseInt(e)}); }); });
        loadModel(p[0].c); canvasArea.innerHTML = '';
        p.forEach(d => { let b = furnitureModels[d.c]?.find(x => x.id === d.i); if (!b) return; const el = document.createElement('div'); el.className = 'canvas-module'; Object.assign(el.dataset, { id: d.i, name: b.name, price: b.price, collection: d.c, w: b.w, h: b.h, angle: d.a, isExpanded: d.e === 1 ? 'true' : 'false' }); el.style.cssText = `width:${b.w*scale}px; height:${b.h*scale}px; left:${d.x*scale}px; top:${d.y*scale}px; z-index:${zIndexCounter++}; transform:rotate(${d.a}deg)`; el.innerHTML = (d.e === 1 && b.expandable ? b.svgExpanded : b.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; attachEvents(el); canvasArea.appendChild(el); });
        updateOrderSummary(); updateLabels(); setTimeout(() => updateDimensions(), 50); saveState();
    } catch (e) { console.log("URL error"); }
} else { loadModel(modelSelect.value); const saved = localStorage.getItem('sofaState'); if(saved) restoreState(JSON.parse(saved)); }
