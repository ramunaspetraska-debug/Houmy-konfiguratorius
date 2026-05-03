// Nustatome versijos pavadinimą ir pakeičiame jo dizainą per JS
const watermarkEl = document.getElementById('version-watermark');
watermarkEl.innerText = APP_VERSION;
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

let saveStateTimeout = null;
function saveState() { 
    const s = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, l:m.style.left, t:m.style.top, a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded})); 
    const stateStr = JSON.stringify(s);
    
    historyStack.push(stateStr); 
    if(historyStack.length > 20) historyStack.shift(); 
    
    if(saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        localStorage.setItem('sofaState', stateStr); 
    }, 500);
    
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
        el.style.cssText=`width:${d.w*scale}px; height:${d.h*scale}px; left:${d.l}; top:${d.t}; z-index:${d.z}; transform:rotate(${d.a}deg)`; 
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
    
    // Ypatingai svarbus pakeitimas: apsaugo linijas nuo nukirpimo (clipping) kai jos išeina už SVG ribų
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
                        if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { 
                            group.add(other); added = true; break; 
                        } 
                    } 
                }
            }
        }
        groups.push(Array.from(group)); 
        group.forEach(m => unvisited.delete(m));
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
        let sleepContributors = [];
        
        g.forEach(m => {
            let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
            let dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2;
            let cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
            [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
                let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle);
                let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
            });
            if (m.dataset.isExpanded === 'true' || m.dataset.isChaise === 'true') sleepContributors.push(m);
        });
        
        let cx = (minX + maxX)/2, cy = (minY + maxY)/2;
        const totalW = Math.round((maxX - minX) / scale), totalH = Math.round((maxY - minY) / scale);
        
        let groupName = groups.length > 1 ? `Baldo ${index + 1} išmatavimai:` : `Išmatavimai:`;
        let textPart = `${groupName} <b style="color:#007bff">${totalW} x ${totalH} cm</b>`; 

        if (sleepContributors.length > 0) {
            let sGroups = [], sUnvisited = new Set(sleepContributors);
            while(sUnvisited.size > 0) {
                let sStart = sUnvisited.values().next().value, sg = new Set([sStart]), sAdded = true;
                while(sAdded) {
                    sAdded = false;
                    for(let other of sUnvisited) {
                        if(!sg.has(other)) {
                            for(let sm of sg) {
                                let r1 = sm.getBoundingClientRect(), r2 = other.getBoundingClientRect();
                                if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { sg.add(other); sAdded = true; break; }
                            }
                        }
                    }
                }
                sGroups.push(Array.from(sg)); sg.forEach(m => sUnvisited.delete(m));
            }
            let validSleepGroups = sGroups.filter(sg => sg.some(m => m.dataset.isExpanded === 'true'));
            if (validSleepGroups.length > 0) {
                let sleepTexts = validSleepGroups.map(sg => {
                    let sW = 0, maxH = 0;
                    sg.forEach(m => { sW += parseInt(m.dataset.sleepw)||0; maxH = Math.max(maxH, parseInt(m.dataset.sleeph)||0); });
                    return `<b style="color:#28a745">${sW} x ${maxH} cm</b>`;
                });
                textPart += ` | Lova: ${sleepTexts.join(' / ')}`;
            }
        }
        displayTexts.push(textPart);

        if (dimState > 0) {
            let offset = 35;
            // Pakeitimas nr. 1: Pilki matmenys dedami pagal lokalias sofos grupės ribas, o ne globalias
            let topY = minY - offset, bottomY = maxY + offset;
            let leftX = minX - offset, rightX = maxX + offset;

            // Pakeitimas nr. 2: Math.round apvalinimas apsaugo nuo paklaidų peršokant matmenims
            let lineY = (Math.round(cy) <= Math.round(GCY)) ? topY : bottomY;
            let textY = (Math.round(cy) <= Math.round(GCY)) ? (lineY - 6) : (lineY + 16);
            let lineX = (Math.round(cx) >= Math.round(GCX) || groups.length === 1) ? rightX : leftX;
            let textX = (Math.round(cx) >= Math.round(GCX) || groups.length === 1) ? (lineX + 16) : (lineX - 6);

            let extStyle = "stroke='#aaa' stroke-width='0.5' stroke-dasharray='4,4' fill='none'";
            svgContent += `<line x1="${minX}" y1="${Math.round(cy)<=Math.round(GCY) ? minY : maxY}" x2="${minX}" y2="${lineY}" ${extStyle} />`;
            svgContent += `<line x1="${maxX}" y1="${Math.round(cy)<=Math.round(GCY) ? minY : maxY}" x2="${maxX}" y2="${lineY}" ${extStyle} />`;
            svgContent += `<line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1 ? maxX : minX}" y1="${minY}" x2="${lineX}" y2="${minY}" ${extStyle} />`;
            svgContent += `<line x1="${Math.round(cx)>=Math.round(GCX)||groups.length===1 ? maxX : minX}" y1="${maxY}" x2="${lineX}" y2="${maxY}" ${extStyle} />`;

            svgContent += `<path d="M ${minX} ${lineY} L ${maxX} ${lineY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
            svgContent += `<text x="${cx}" y="${textY}" fill="#333" font-size="12" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalW} cm</text>`;
            
            svgContent += `<path d="M ${lineX} ${minY} L ${lineX} ${maxY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
            svgContent += `<text x="${textX}" y="${cy + 4}" transform="rotate(-90 ${textX} ${cy + 4})" fill="#333" font-size="12" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalH} cm</text>`;
        }
    });

    if (dimState === 2 && groups.length > 1) {
        let offset = 85; 
        let totalW = Math.round((GMaxX - GMinX) / scale), totalH = Math.round((GMaxY - GMinY) / scale);
        
        let extStyle = "stroke='#007bff' stroke-width='0.5' stroke-dasharray='4,4' fill='none' opacity='0.5'";
        svgContent += `<line x1="${GMinX}" y1="${GMinY}" x2="${GMinX}" y2="${GMinY - offset}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX}" y2="${GMinY - offset}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX + offset}" y2="${GMinY}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMaxY}" x2="${GMaxX + offset}" y2="${GMaxY}" ${extStyle} />`;

        svgContent += `<path d="M ${GMinX} ${GMinY - offset} L ${GMaxX} ${GMinY - offset}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
        svgContent += `<text x="${GCX}" y="${GMinY - offset - 6}" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalW} cm (Viso)</text>`;
        
        svgContent += `<path d="M ${GMaxX + offset} ${GMinY} L ${GMaxX + offset} ${GMaxY}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
        svgContent += `<text x="${GMaxX + offset + 18}" y="${GCY + 5}" transform="rotate(-90 ${GMaxX + offset + 18} ${GCY + 5})" fill="#007bff" font-size="14" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalH} cm (Viso)</text>`;
        
        displayTexts.unshift(`<b>Bendri išmatavimai:</b> <b style="color:#007bff">${totalW} x ${totalH} cm</b>`); 
    }

    svgAr.innerHTML = svgContent;
    document.getElementById('dimension-display').innerHTML = displayTexts.join('<br>');
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

function selectModule(modEl) {
    if (selectedModule) selectedModule.classList.remove('selected');
    selectedModule = modEl;
    if (selectedModule) selectedModule.classList.add('selected');
}

function startPan(e) {
    if (e.target.id === 'workspace' || e.target.id === 'canvas-wrapper' || e.target.id === 'canvas-area') {
        selectModule(null);
        isPanning = true;
        panStartX = getEventX(e);
        panStartY = getEventY(e);
        initialPanX = currentPanX;
        initialPanY = currentPanY;
        document.getElementById('workspace').style.cursor = 'grabbing';
    }
}

const workspaceArea = document.getElementById('workspace');
workspaceArea.addEventListener('mousedown', startPan);
workspaceArea.addEventListener('touchstart', startPan, {passive: false});

workspaceArea.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) {
        changeZoom(0.05, e);
    } else if (e.deltaY > 0) {
        changeZoom(-0.05, e);
    }
    e.preventDefault(); 
}, { passive: false });

function getEventX(e) { return e.type.includes('touch') ? e.touches[0].clientX : e.clientX; }
function getEventY(e) { return e.type.includes('touch') ? e.touches[0].clientY : e.clientY; }

function getConnectedGroup(startModule) {
    let group = new Set([startModule]); let added = true;
    while(added) { added = false; document.querySelectorAll('.canvas-module').forEach(other => { if(!group.has(other)) { for(let m of group) { 
        let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect();
        if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; }
    } } }); }
    return Array.from(group);
}

function toggleExpand(modEl) {
    let coll = modEl.dataset.collection; let id = modEl.dataset.id;
    let modData = furnitureModels[coll]?.find(m => m.id === id);
    if (!modData || !modData.expandable) return;
    let isExp = modEl.dataset.isExpanded === 'true';
    let currentW = !isExp ? modData.w : modData.expW, currentH = !isExp ? modData.h : modData.expH;
    let targetW = !isExp ? modData.expW : modData.w, targetH = !isExp ? modData.expH : modData.h;
    let currentAngle = parseInt(modEl.dataset.angle) || 0; let rad = currentAngle * Math.PI / 180;
    let dw = (targetW - currentW) * scale, dh = (targetH - currentH) * scale;
    let rx = (dw/2) * Math.cos(rad) - (dh/2) * Math.sin(rad), ry = (dw/2) * Math.sin(rad) + (dh/2) * Math.cos(rad);
    modEl.style.left = (parseFloat(modEl.style.left) - dw/2 + rx) + 'px'; modEl.style.top = (parseFloat(modEl.style.top) - dh/2 + ry) + 'px';
    modEl.dataset.isExpanded = !isExp;
    modEl.style.width = (targetW * scale) + 'px'; modEl.style.height = (targetH * scale) + 'px';
    modEl.innerHTML = (!isExp ? modData.svgExpanded : modData.svg) + `<span class="label" style="transform:rotate(${-currentAngle}deg)"></span>`;
    updateLabels(); updateDimensions(); saveState();
}

function addModuleToWorkspace(modData, collectionKey) {
    const el = document.createElement('div'); el.className = 'canvas-module';
    Object.assign(el.dataset, { id:modData.id, name:modData.name, price:modData.price, collection:collectionKey, w:modData.w, h:modData.h, angle:0, isExpanded:'false' });
    if(modData.expandable) { el.dataset.sleepw = modData.sleepW; el.dataset.sleeph = modData.sleepH; }
    if(modData.isChaise) { el.dataset.isChaise = 'true'; el.dataset.sleepw = modData.sleepW; el.dataset.sleeph = modData.sleepH; }
    
    let baseSpawnX = (window.innerWidth < 768 ? 50 : 350) - currentPanX;
    let baseSpawnY = (window.innerWidth < 768 ? 50 : 150) - currentPanY;

    let finalSpawnX = baseSpawnX;
    let finalSpawnY = baseSpawnY;

    const existingModules = Array.from(document.querySelectorAll('.canvas-module'));
    
    if (existingModules.length > 0) {
        let maxRightX = -Infinity;
        let referenceY = baseSpawnY;

        existingModules.forEach(m => {
            let mLeft = parseFloat(m.style.left) || 0;
            let mWidth = parseFloat(m.style.width) || 0;
            let mRight = mLeft + mWidth; 
            
            if (mRight > maxRightX) {
                maxRightX = mRight;
                referenceY = parseFloat(m.style.top) || baseSpawnY; 
            }
        });

        finalSpawnX = maxRightX + 15;
        finalSpawnY = referenceY; 
    }

    el.style.cssText = `width:${modData.w*scale}px; height:${modData.h*scale}px; top:${finalSpawnY}px; left:${finalSpawnX}px; z-index:${zIndexCounter++};`;
    el.innerHTML = modData.svg + `<span class="label"></span>`;
    attachEvents(el); canvasArea.appendChild(el); selectModule(el); 
    
    saveState(); 
    setTimeout(() => { updateDimensions(); }, 50);
}

function globalDragOrPan(e) {
    if (isGlobalDragging) {
        const dx = getEventX(e) - dragStartX, dy = getEventY(e) - dragStartY;
        dragGroup.forEach((m, i) => { m.style.left = (dragInitials[i].left + dx) + 'px'; m.style.top = (dragInitials[i].top + dy) + 'px'; });

        const snapThreshold = 15; let snapDx = 0, snapDy = 0, snappedX = false, snappedY = false; 
        
        let dRect = {
            left: initialDraggedRect.left + dx, right: initialDraggedRect.right + dx,
            top: initialDraggedRect.top + dy, bottom: initialDraggedRect.bottom + dy
        };
        
        cachedOtherRects.forEach(oRect => {
            if (!snappedX) {
                if (Math.abs(dRect.right - oRect.left) < snapThreshold) { snapDx = oRect.left - dRect.right; snappedX = true; }
                else if (Math.abs(dRect.left - oRect.right) < snapThreshold) { snapDx = oRect.right - dRect.left; snappedX = true; }
                else if (Math.abs(dRect.left - oRect.left) < snapThreshold) { snapDx = oRect.left - dRect.left; snappedX = true; }
                else if (Math.abs(dRect.right - oRect.right) < snapThreshold) { snapDx = oRect.right - dRect.right; snappedX = true; }
            }
            if (!snappedY) {
                if (Math.abs(dRect.bottom - oRect.top) < snapThreshold) { snapDy = oRect.top - dRect.bottom; snappedY = true; }
                else if (Math.abs(dRect.top - oRect.bottom) < snapThreshold) { snapDy = oRect.bottom - dRect.top; snappedY = true; }
                else if (Math.abs(dRect.top - oRect.top) < snapThreshold) { snapDy = oRect.top - dRect.top; snappedY = true; }
                else if (Math.abs(dRect.bottom - oRect.bottom) < snapThreshold) { snapDy = oRect.bottom - dRect.bottom; snappedY = true; }
            }
        });
        
        if (snappedX || snappedY) { dragGroup.forEach((m, i) => { m.style.left = (dragInitials[i].left + dx + snapDx) + 'px'; m.style.top = (dragInitials[i].top + dy + snapDy) + 'px'; }); }
        updateDimensions();
        if(e.cancelable) e.preventDefault();
    } else if (isPanning) {
        currentPanX = initialPanX + (getEventX(e) - panStartX);
        currentPanY = initialPanY + (getEventY(e) - panStartY);
        document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
        document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
        if(e.cancelable) e.preventDefault();
    }
}

function globalStopDragOrPan() { 
    if (isGlobalDragging) {
        isGlobalDragging = false; 
        dragGroup.forEach(m => m.classList.remove('dragging')); 
        draggedModule = null; 
        cachedOtherRects = [];
        saveState(); 
    }
    if (isPanning) {
        isPanning = false;
        document.getElementById('workspace').style.cursor = 'crosshair';
        setTimeout(() => { updateDimensions(); }, 50); 
    }
}

document.addEventListener('mousemove', globalDragOrPan); 
document.addEventListener('touchmove', globalDragOrPan, {passive: false});
document.addEventListener('mouseup', globalStopDragOrPan); 
document.addEventListener('touchend', globalStopDragOrPan);

function attachEvents(modEl) {
    function startDrag(e) {
        isGlobalDragging = true; 
        draggedModule = modEl; 
        selectModule(modEl); 
        dragGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(modEl) : [modEl];
        let topZ = zIndexCounter++; 
        dragGroup.forEach(m => { m.style.zIndex = topZ; m.classList.add('dragging'); });
        dragStartX = getEventX(e); dragStartY = getEventY(e);
        dragInitials = dragGroup.map(m => ({ left: parseFloat(m.style.left)||0, top: parseFloat(m.style.top)||0 }));
        
        initialDraggedRect = modEl.getBoundingClientRect();
        cachedOtherRects = [];
        document.querySelectorAll('.canvas-module').forEach(other => {
            if (!dragGroup.includes(other)) {
                cachedOtherRects.push(other.getBoundingClientRect());
            }
        });

        if(e.cancelable && !e.type.includes('touch')) e.preventDefault(); 
    }
    modEl.addEventListener('mousedown', startDrag); 
    modEl.addEventListener('touchstart', startDrag, {passive: false});

    modEl.addEventListener('dblclick', () => toggleExpand(modEl));
    let lastTap = 0;
    modEl.addEventListener('touchend', (e) => {
        let currentTime = new Date().getTime(), tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) { toggleExpand(modEl); e.preventDefault(); }
        lastTap = currentTime;
    });
}

function rotateSelected(degrees) {
    if (!selectedModule) return;
    let targetGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(selectedModule) : [selectedModule];
    if (targetGroup.length === 1) {
        let m = targetGroup[0]; let currentAngle = parseInt(m.dataset.angle) || 0;
        m.dataset.angle = currentAngle + degrees; m.style.transform = `rotate(${m.dataset.angle}deg)`;
        m.querySelector('.label').style.transform = `rotate(${-m.dataset.angle}deg)`;
    } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        targetGroup.forEach(m => {
            let w = parseFloat(m.style.width), h = parseFloat(m.style.height), cx = parseFloat(m.style.left) + w/2, cy = parseFloat(m.style.top) + h/2;
            let isRotated = ((parseInt(m.dataset.angle) || 0) % 180 !== 0), visualW = isRotated ? h : w, visualH = isRotated ? w : h;
            minX = Math.min(minX, cx - visualW/2); minY = Math.min(minY, cy - visualH/2); maxX = Math.max(maxX, cx + visualW/2); maxY = Math.max(maxY, cy + visualH/2);
        });
        let groupCX = (minX + maxX) / 2, groupCY = (minY + maxY) / 2;
        targetGroup.forEach(m => {
            let w = parseFloat(m.style.width), h = parseFloat(m.style.height), cx = parseFloat(m.style.left) + w/2, cy = parseFloat(m.style.top) + h/2, nx, ny;
            if (degrees === 90 || degrees === -270) { nx = groupCX - (cy - groupCY); ny = groupCY + (cx - groupCX); } 
            else if (degrees === -90 || degrees === 270) { nx = groupCX + (cy - groupCY); ny = groupCY - (cx - groupCX); } 
            else if (degrees === 180 || degrees === -180) { nx = groupCX - (cx - groupCX); ny = groupCY - (cy - groupCY); }
            m.style.left = (nx - w/2) + 'px'; m.style.top = (ny - h/2) + 'px';
            let newAngle = (parseInt(m.dataset.angle) || 0) + degrees;
            m.dataset.angle = newAngle; m.style.transform = `rotate(${newAngle}deg)`;
            m.querySelector('.label').style.transform = `rotate(${-newAngle}deg)`;
        });
    }
    setTimeout(() => { updateDimensions(); saveState(); }, 50); 
}

function deleteSelected() { if (!selectedModule) return; let targetGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(selectedModule) : [selectedModule]; targetGroup.forEach(m => m.remove()); selectModule(null); saveState(); updateDimensions(); }

let clipboardData = null;

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if(e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { undo(); return; }
    
    if(e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (!selectedModule) return;
        let targetGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(selectedModule) : [selectedModule];
        
        clipboardData = targetGroup.map(m => ({
            id: m.dataset.id, name: m.dataset.name, price: m.dataset.price, collection: m.dataset.collection,
            w: m.dataset.w, h: m.dataset.h, angle: m.dataset.angle || 0, isExpanded: m.dataset.isExpanded,
            isChaise: m.dataset.isChaise, sleepw: m.dataset.sleepw, sleeph: m.dataset.sleeph,
            left: parseFloat(m.style.left) || 0, top: parseFloat(m.style.top) || 0
        }));
        return;
    }

    if(e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (!clipboardData || clipboardData.length === 0) return;
        let newlyPasted = []; selectModule(null);
        
        clipboardData.forEach(d => {
            d.left += 40; d.top += 40;
            let modBase = furnitureModels[d.collection]?.find(x => x.id === d.id);
            if (!modBase) return;

            const el = document.createElement('div'); el.className = 'canvas-module';
            Object.assign(el.dataset, {
                id: d.id, name: d.name, price: d.price, collection: d.collection,
                w: d.w, h: d.h, angle: d.angle, isExpanded: d.isExpanded
            });
            
            if (d.isChaise) el.dataset.isChaise = d.isChaise;
            if (d.sleepw) { el.dataset.sleepw = d.sleepw; el.dataset.sleeph = d.sleeph; }
            
            el.style.cssText = `width:${d.w*scale}px; height:${d.h*scale}px; left:${d.left}px; top:${d.top}px; z-index:${zIndexCounter++}; transform:rotate(${d.angle}deg)`;
            el.innerHTML = (d.isExpanded === 'true' && modBase.expandable ? modBase.svgExpanded : modBase.svg) + `<span class="label" style="transform:rotate(${-d.angle}deg)"></span>`;
            
            attachEvents(el); canvasArea.appendChild(el); newlyPasted.push(el);
        });

        if (newlyPasted.length > 0) {
            selectModule(newlyPasted[0]); updateLabels(); updateDimensions(); saveState();
        }
        return;
    }

    if (!selectedModule) return;
    if (e.key === 'q' || e.key === 'Q') rotateSelected(-90);
    else if (e.key === 'e' || e.key === 'E') rotateSelected(90);
    else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

function openAdmin() { document.getElementById('admin-modal').style.display = 'flex'; let container = document.getElementById('admin-prices-container'); container.innerHTML = ''; for(let key in rawModels) { container.innerHTML += `<h4 style="text-transform:uppercase; margin-top:15px; margin-bottom:5px; border-bottom:1px solid #eee;">${key} Kolekcija</h4>`; let grid = `<div class="admin-price-grid">`; rawModels[key].forEach(mod => { let pKey = key + '_' + mod.id; let currentPrice = appSettings.customPrices[pKey] !== undefined ? appSettings.customPrices[pKey] : (mod.price || getPrice(mod.w, mod.h)); grid += `<div class="admin-price-card"><div>${mod.name}</div><input type="number" data-pkey="${pKey}" class="admin-price-input" value="${currentPrice}"></div>`; }); grid += `</div>`; container.innerHTML += grid; } }
function applyBulkPrice(multiplier) { let percent = parseFloat(document.getElementById('bulk-percent').value); if(isNaN(percent) || percent <= 0) return alert("Įveskite galiojantį procentą (pvz. 10)"); let checkedCols = Array.from(document.querySelectorAll('.bulk-col:checked')).map(cb => cb.value); if(checkedCols.length === 0) return alert("Pažymėkite bent vieną kolekciją!"); let factor = 1 + (multiplier * (percent / 100)); document.querySelectorAll('.admin-price-input').forEach(input => { let col = input.dataset.pkey.split('_')[0]; if (checkedCols.includes(col)) { input.value = Math.round(parseFloat(input.value) * factor); } }); alert(`Kainos ${multiplier > 0 ? 'padidintos' : 'sumažintos'} ${percent}% pažymėtoms kolekcijoms.`); }
function closeAdmin() { document.getElementById('admin-modal').style.display = 'none'; }
function saveAdminSettings() { document.querySelectorAll('.admin-price-input').forEach(input => { let val = parseInt(input.value); if (val > 0) appSettings.customPrices[input.dataset.pkey] = val; else delete appSettings.customPrices[input.dataset.pkey]; }); localStorage.setItem('houmySettings', JSON.stringify(appSettings)); alert("Nustatymai sėkmingai išsaugoti!"); location.reload(); }

function openArchive() { document.getElementById('archive-modal').style.display = 'flex'; renderArchiveList(); }
function renderArchiveList() { let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); let html = ''; for(let name in archive) { html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border:1px solid #ddd; border-radius:4px; background:#f9f9f9;"><strong style="font-size:13px; color:#333;">${name}</strong><div style="display:flex; gap:5px;"><button onclick="loadFromArchive('${name}')" style="padding:4px 8px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">Užkrauti</button><button onclick="deleteFromArchive('${name}')" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">Ištrinti</button></div></div>`; } document.getElementById('archive-list').innerHTML = html || '<div style="color:#888; font-size:13px; text-align:center; padding:10px 0;">Archyvas tuščias</div>'; }
function saveToArchive() { let name = document.getElementById('archive-name').value.trim(); if(!name) return alert('Prašome įvesti projekto pavadinimą!'); let state = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, l:m.style.left, t:m.style.top, a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded})); if(state.length === 0) return alert('Nėra ką išsaugoti, sofa tuščia!'); let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); archive[name] = state; localStorage.setItem('houmyArchive', JSON.stringify(archive)); document.getElementById('archive-name').value = ''; renderArchiveList(); }
function loadFromArchive(name) { let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); if(archive[name] && archive[name].length > 0) { document.getElementById('model-select').value = archive[name][0].c; loadModel(archive[name][0].c); restoreState(archive[name]); document.getElementById('archive-modal').style.display = 'none'; } }
function deleteFromArchive(name) { if(confirm(`Ar tikrai norite ištrinti projektą "${name}" iš archyvo?`)) { let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); delete archive[name]; localStorage.setItem('houmyArchive', JSON.stringify(archive)); renderArchiveList(); } }

function openClientModal() { const modules = Array.from(document.querySelectorAll('.canvas-module')); if(modules.length === 0) return alert("Nėra modulių pasiūlymui!"); document.getElementById('client-modal').style.display = 'flex'; document.getElementById('client-term').value = appSettings.prodTerm; document.getElementById('client-delivery').value = appSettings.deliveryNote; document.getElementById('client-additional').value = appSettings.additionalInfo; }

async function generatePDFWithDetails() { 
    appSettings.prodTerm = document.getElementById('client-term').value.trim(); 
    appSettings.deliveryNote = document.getElementById('client-delivery').value.trim(); 
    appSettings.additionalInfo = document.getElementById('client-additional').value.trim(); 
    localStorage.setItem('houmySettings', JSON.stringify(appSettings)); 
    document.getElementById('client-modal').style.display = 'none'; 
    selectModule(null); 
    
    const modules = Array.from(document.querySelectorAll('.canvas-module')); 
    let cName = document.getElementById('client-name').value.trim(), 
        cAddr = document.getElementById('client-address').value.trim(), 
        pName = document.getElementById('project-name').value.trim(), 
        cFabric = document.getElementById('client-fabric').value.trim(), 
        cDesigner = document.getElementById('client-designer').value.trim(), 
        discountVal = parseInt(document.getElementById('client-discount').value) || 0, 
        groupText = document.getElementById('fabric-group-select').options[document.getElementById('fabric-group-select').selectedIndex].text; 
    
    let cInfoHtml = ""; 
    if(cName || cAddr || cFabric || cDesigner || groupText !== "I Grupė (Bazinė)") { 
        if(cName) cInfoHtml += `<b>Klientas:</b> ${cName}<br>`; 
        if(cAddr) cInfoHtml += `<b>Adresas:</b> ${cAddr}<br>`; 
        if(cDesigner) cInfoHtml += `<b>Dizaineris:</b> ${cDesigner}<br>`; 
        if(cFabric) cInfoHtml += `<b>Audinys:</b> ${cFabric}<br>`; 
        if(groupText !== "I Grupė (Bazinė)") cInfoHtml += `<b>Audinio grupė:</b> ${groupText}<br>`; 
    } 
    document.getElementById('pdf-client-info').innerHTML = cInfoHtml; 
    document.getElementById('pdf-main-title').innerText = pName ? pName : "Komercinis Pasiūlymas"; 
    
    document.querySelectorAll('.dynamic-bb').forEach(e => e.style.display = 'none'); 
    document.getElementById('zoom-controls').style.display = 'none'; 
    document.getElementById('dimension-display').style.display = 'none'; 
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; 
    modules.forEach(m => { 
        let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180, 
            baseW = parseFloat(m.dataset.w) * scale, baseH = parseFloat(m.dataset.h) * scale, 
            curW = parseFloat(m.style.width), curH = parseFloat(m.style.height), 
            cx = parseFloat(m.style.left) + curW / 2, cy = parseFloat(m.style.top) + curH / 2, 
            dx = baseW / 2, dy = baseH / 2; 
        [ {x: -dx, y: -dy}, {x: dx, y: -dy}, {x: dx, y: dy}, {x: -dx, y: dy} ].forEach(c => { 
            let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle), 
                ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle); 
            if (rx < minX) minX = rx; if (rx > maxX) maxX = rx; 
            if (ry < minY) minY = ry; if (ry > maxY) maxY = ry; 
        }); 
    }); 
    
    let padding = 40;
    if (dimState === 1) padding = 90;
    if (dimState === 2) padding = 160;
    
    const tmpWrapper = document.getElementById('canvas-wrapper'); 
    let originalTransform = tmpWrapper.style.transform;
    let originalWidth = tmpWrapper.style.width;
    let originalHeight = tmpWrapper.style.height;
    
    tmpWrapper.style.transform = 'translate(0px, 0px)';
    document.getElementById('workspace').style.backgroundPosition = '0px 0px';
    tmpWrapper.style.width = (maxX + padding * 2) + 'px'; 
    tmpWrapper.style.height = (maxY + padding * 2) + 'px'; 
    
    await new Promise(r => setTimeout(r, 250));
    
    const canvas = await html2canvas(tmpWrapper, { 
        scale: 2, backgroundColor: "#ffffff", x: minX - padding, y: minY - padding, 
        width: (maxX - minX) + padding * 2, height: (maxY - minY) + padding * 2, 
        useCORS: true, scrollX: 0, scrollY: 0  
    });
    
    tmpWrapper.style.transform = originalTransform;
    tmpWrapper.style.width = originalWidth;
    tmpWrapper.style.height = originalHeight;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
    
    document.getElementById('zoom-controls').style.display = 'flex'; 
    document.getElementById('dimension-display').style.display = 'block'; 
    
    const imgData = canvas.toDataURL('image/jpeg', 0.95); 
    document.getElementById('pdf-sofa-img').src = imgData; 
    
    const tbody = document.getElementById('pdf-table-body'); 
    tbody.innerHTML = ''; 
    
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1; 
    let counts = {}; let total = 0; 
    modules.forEach(m => { 
        let dName = getDisplayName({collection: m.dataset.collection, name: m.dataset.name}, isMixed), 
            price = getModulePrice(m.dataset.collection, m.dataset.id); 
        if(!counts[dName]) counts[dName] = { qty: 0, price: price }; 
        counts[dName].qty++; total += price; 
    }); 
    
    for(let name in counts) { 
        let item = counts[name]; 
        tbody.innerHTML += `<tr><td style="padding:6px 8px; border-bottom:1px solid #eee;">${name}</td><td style="text-align:center; padding:6px 8px; border-bottom:1px solid #eee;">${item.qty} vnt.</td><td style="text-align:right; padding:6px 8px; border-bottom:1px solid #eee;"><b>${item.price * item.qty} €</b></td></tr>`; 
    } 
    
    if (dimState > 0) {
        document.getElementById('pdf-dimensions').innerHTML = document.getElementById('dimension-display').innerHTML.replace(/<br><span[^>]*id="ui-plotas"[^>]*>.*?<\/span>/g, ""); 
        document.getElementById('pdf-dimensions').style.display = 'block';
    } else {
        document.getElementById('pdf-dimensions').innerHTML = "";
        document.getElementById('pdf-dimensions').style.display = 'none';
    }
    
    let finalTotal = total; 
    if(discountVal > 0) { 
        finalTotal = total - Math.round(total * (discountVal / 100)); 
        document.getElementById('pdf-discount-text').style.display = 'block'; 
        document.getElementById('pdf-discount-text').innerText = `Bazinė kaina: ${total} €`; 
    } else { 
        document.getElementById('pdf-discount-text').style.display = 'none'; 
    } 
    
    let bePVM = (finalTotal / 1.21).toFixed(2);
    let pvmSuma = (finalTotal - bePVM).toFixed(2);
    
    document.getElementById('pdf-price-breakdown').innerHTML = `
        <div style="font-size:10px; color:#555; margin-bottom:2px;">Suma be PVM: <b>${bePVM.replace('.', ',')} €</b></div>
        <div style="font-size:10px; color:#555; margin-bottom:4px;">PVM (21%): <b>${pvmSuma.replace('.', ',')} €</b></div>
        <div style="font-size:16px; font-weight:bold; color:#111; border-top: 2px solid #333; padding-top: 4px;">Viso su PVM: ${finalTotal} €</div>
    `;
    
    let addInfoHtml = appSettings.additionalInfo ? `• ${appSettings.additionalInfo}<br>` : ''; 
    document.getElementById('pdf-terms').innerHTML = `<b style="color:#111;">Pasiūlymo sąlygos:</b><br>• Preliminarus gamybos terminas: <b>${appSettings.prodTerm}</b><br>• Pristatymas: <b>${appSettings.deliveryNote}</b><br>${addInfoHtml}${discountVal > 0 ? `• <b style="color:#d9534f;">Pritaikyta ${discountVal}% nuolaida</b>` : ''}`; 
    
    const today = new Date(); 
    document.getElementById('pdf-date').innerText = `Data: ${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; 
    
    const uniqueCollections = Array.from(new Set(modules.map(m => m.dataset.collection.toUpperCase())));
    const colText = uniqueCollections.join(' + ');
    const chainText = generateModuleChainText(modules, isMixed); 
    
    document.getElementById('pdf-module-chain').innerText = "Kolekcija: " + colText + " | Specifikacija: " + chainText; 
    
    const pdfTemplate = document.getElementById('pdf-template'); 
    pdfTemplate.style.display = 'flex'; 
    
    await html2canvas(pdfTemplate, { scale: 2, useCORS: true }).then(finalCanvas => { 
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4'); 
        pdf.addImage(finalCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297); 
        pdf.save(pName ? `Houmy_Pasiulymas_${pName.replace(/\s+/g, '_')}.pdf` : 'Houmy_Pasiulymas.pdf'); 
    }); 
    pdfTemplate.style.display = 'none'; 
}

function openBlueprintModal() {
    const modules = Array.from(document.querySelectorAll('.canvas-module')); 
    if(modules.length === 0) return alert("Nėra modulių brėžiniui!");
    document.getElementById('blueprint-modal').style.display = 'flex';
}

async function executeExportBlueprint() { 
    document.getElementById('blueprint-modal').style.display = 'none';
    selectModule(null); 
    const modules = Array.from(document.querySelectorAll('.canvas-module')); 
    if(modules.length === 0) return alert("Nėra modulių brėžiniui!"); 
    
    document.querySelectorAll('.dynamic-bb').forEach(e => e.style.display = 'none'); 
    document.getElementById('zoom-controls').style.display = 'none'; 
    document.getElementById('dimension-display').style.display = 'none'; 
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; 
    modules.forEach(m => { 
        let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180, 
            baseW = parseFloat(m.dataset.w) * scale, baseH = parseFloat(m.dataset.h) * scale, 
            curW = parseFloat(m.style.width), curH = parseFloat(m.style.height), 
            cx = parseFloat(m.style.left) + curW / 2, cy = parseFloat(m.style.top) + curH / 2, 
            dx = baseW / 2, dy = baseH / 2; 
        [ {x: -dx, y: -dy}, {x: dx, y: -dy}, {x: dx, y: dy}, {x: -dx, y: dy} ].forEach(c => { 
            let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle), 
                ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle); 
            if (rx < minX) minX = rx; if (rx > maxX) maxX = rx; 
            if (ry < minY) minY = ry; if (ry > maxY) maxY = ry; 
        }); 
    }); 
    
    let padding = 40;
    if (dimState === 1) padding = 90;
    if (dimState === 2) padding = 160;
    
    const tmpWrapper = document.getElementById('canvas-wrapper'); 
    let originalTransform = tmpWrapper.style.transform;
    let originalWidth = tmpWrapper.style.width;
    let originalHeight = tmpWrapper.style.height;
    
    tmpWrapper.style.transform = 'translate(0px, 0px)';
    document.getElementById('workspace').style.backgroundPosition = '0px 0px';
    tmpWrapper.style.width = (maxX + padding * 2) + 'px'; 
    tmpWrapper.style.height = (maxY + padding * 2) + 'px'; 
    
    await new Promise(r => setTimeout(r, 250)); 
    
    const canvas = await html2canvas(tmpWrapper, { 
        scale: 2, backgroundColor: "#ffffff", x: minX - padding, y: minY - padding, 
        width: (maxX - minX) + padding * 2, height: (maxY - minY) + padding * 2, 
        useCORS: true, scrollX: 0, scrollY: 0  
    }); 
    
    tmpWrapper.style.transform = originalTransform;
    tmpWrapper.style.width = originalWidth;
    tmpWrapper.style.height = originalHeight;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
    
    document.getElementById('zoom-controls').style.display = 'flex'; 
    document.getElementById('dimension-display').style.display = 'block'; 
    
    const imgData = canvas.toDataURL('image/jpeg', 0.95); 
    document.getElementById('bp-img-container').innerHTML = `<img src="${imgData}" style="max-width:100%">`; 
    
    const isMixed = new Set(modules.map(m => m.dataset.collection)).size > 1; 
    const uniqueCollections = Array.from(new Set(modules.map(m => m.dataset.collection.toUpperCase())));
    document.getElementById('bp-collection').innerText = uniqueCollections.join(' + '); 
    
    let bFabric = document.getElementById('blueprint-fabric').value.trim();
    if(bFabric) {
        document.getElementById('bp-fabric').innerText = bFabric;
        document.getElementById('bp-fabric-container').style.display = 'block';
    } else {
        document.getElementById('bp-fabric-container').style.display = 'none';
    }

    if (dimState > 0) {
        document.getElementById('bp-dims').innerHTML = document.getElementById('dimension-display').innerHTML; 
        document.getElementById('bp-dims-container').style.display = 'block';
    } else {
        document.getElementById('bp-dims-container').style.display = 'none';
    }
    
    document.getElementById('bp-chain').innerText = generateModuleChainText(modules, isMixed); 
    
    let bNotes = document.getElementById('blueprint-notes').value.trim();
    document.getElementById('bp-notes').innerText = bNotes ? "Notes: " + bNotes : ""; 

    const bpTemplate = document.getElementById('blueprint-template'); 
    bpTemplate.style.display = 'flex'; 
    
    await html2canvas(bpTemplate, { scale: 2, useCORS: true }).then(finalCanvas => { 
        let link = document.createElement('a'); 
        link.download = 'Houmy_Production_Blueprint.jpg'; 
        link.href = finalCanvas.toDataURL('image/jpeg', 0.9); 
        link.click(); 
    }); 
    bpTemplate.style.display = 'none'; 
}

// --- NAUJA FUNKCIJA: DALIJIMASIS NUORODA (SUSPAUSTAS FORMATAS) ---
function shareConfiguration() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    if (modules.length === 0) {
        alert("Sofa tuščia, nėra kuo dalintis!");
        return;
    }

    const cols = {};
    modules.forEach(m => {
        const c = m.dataset.collection;
        if (!cols[c]) cols[c] = [];
        const i = m.dataset.id;
        const x = Math.round((parseFloat(m.style.left) || 0) / scale);
        const y = Math.round((parseFloat(m.style.top) || 0) / scale);
        const a = parseInt(m.dataset.angle) || 0;
        const e = m.dataset.isExpanded === 'true' ? 1 : 0;
        cols[c].push(`${i},${x},${y},${a},${e}`);
    });

    const compressedString = Object.keys(cols).map(c => `${c}:${cols[c].join('!')}`).join('~');
    
    const encodedState = btoa(compressedString); 
    const baseUrl = window.location.href.split('?')[0]; 
    const shareUrl = `${baseUrl}?s=${encodedState}`; 

    navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.getElementById('share-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Nuoroda nukopijuota!';
        btn.style.background = '#17a2b8'; 
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '#6c757d'; 
        }, 2000);
    }).catch(err => {
        alert("Nepavyko automatiškai nukopijuoti nuorodos. Štai jūsų nuoroda:\n" + shareUrl);
    });
}

// --- NAUJA FUNKCIJA: SPALVŲ PASIRINKIMAS (COLOR PICKER) ---
const colors = [
    { name: 'Balta (Standartinė)', hex: '#ffffff' },
    { name: 'Šviesiai Kreminė', hex: '#fdf4e3' },
    { name: 'Šviesiai Pilka', hex: '#e2e2e2' },
    { name: 'Šviesiai Rusva', hex: '#c9bcae' },
    { name: 'Smėlio / Kapučino', hex: '#d2b48c' },
    { name: 'Garstyčių', hex: '#d4af37' },
    { name: 'Ryža (Terakota)', hex: '#c86b3c' },
    { name: 'Šokolado Ruda', hex: '#6b4423' },
    { name: 'Pastelinė Alyvuogių', hex: '#a3b18a' },
    { name: 'Samanų Žalia', hex: '#5f7a61' },
    { name: 'Grafito Pilka', hex: '#7a7a7a' },
    { name: 'Karališka Mėlyna', hex: '#3b4d61' }
];

if(!appSettings.fabricColor) appSettings.fabricColor = '#ffffff';
document.documentElement.style.setProperty('--sofa-color', appSettings.fabricColor);

const colorStyle = document.createElement('style');
colorStyle.innerHTML = `
    .canvas-module svg rect:not([fill="none"]),
    .canvas-module svg path:not([fill="none"]),
    .canvas-module svg polygon:not([fill="none"]),
    .canvas-module svg circle:not([fill="none"]) {
        fill: var(--sofa-color) !important;
        transition: fill 0.3s ease;
    }
    .color-picker-wrapper { background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #eee; }
    .color-picker-title { font-weight: bold; margin-bottom: 10px; font-size: 12px; text-transform: uppercase; color: #555; text-align: center;}
    .color-picker-container { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .color-dot { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid #ccc; transition: all 0.2s; }
    .color-dot:hover { transform: scale(1.15); }
    .color-dot.active { border-color: #222; transform: scale(1.15); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
`;
document.head.appendChild(colorStyle);

function changeSofaColor(hex, dotEl) {
    appSettings.fabricColor = hex;
    localStorage.setItem('houmySettings', JSON.stringify(appSettings));
    document.documentElement.style.setProperty('--sofa-color', hex);
    
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    if(dotEl) dotEl.classList.add('active');
}

// Pridedame mygtukus ir valdymą į dešinį šoninį meniu
const rightSidebarMenu = document.getElementById('sidebar-right');
if (rightSidebarMenu) {
    // 1. Įterpiame Spalvų paletę (pačiame viršuje)
    const wrapper = document.createElement('div');
    wrapper.className = 'color-picker-wrapper';
    
    const title = document.createElement('div');
    title.className = 'color-picker-title';
    title.innerText = "Sofa / Audinio Spalva";
    
    const container = document.createElement('div');
    container.className = 'color-picker-container';
    
    colors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot' + (appSettings.fabricColor === c.hex ? ' active' : '');
        dot.style.background = c.hex;
        dot.title = c.name;
        dot.onclick = () => changeSofaColor(c.hex, dot);
        container.appendChild(dot);
    });

    wrapper.appendChild(title);
    wrapper.appendChild(container);
    rightSidebarMenu.insertBefore(wrapper, rightSidebarMenu.firstChild);

    // 2. Įterpiame Dalijimosi mygtuką (virš PDF mygtuko)
    if (!document.getElementById('share-btn')) {
        const shareBtn = document.createElement('button');
        shareBtn.id = 'share-btn';
        shareBtn.className = 'action-btn';
        shareBtn.style.cssText = "background:#6c757d; margin-bottom: 6px;";
        shareBtn.innerHTML = "🔗 Dalintis nuoroda";
        shareBtn.onclick = shareConfiguration;
        
        const pdfBtn = rightSidebarMenu.querySelector('button[onclick="openClientModal()"]');
        if (pdfBtn) rightSidebarMenu.insertBefore(shareBtn, pdfBtn);
        else rightSidebarMenu.appendChild(shareBtn);
    }
}

updateZoomText();

// -- URL Parametrų Logika --
const urlParams = new URLSearchParams(window.location.search);
const requestedModel = urlParams.get('kolekcija');
const sharedStateOld = urlParams.get('share'); 
const sharedStateNew = urlParams.get('s');

if (sharedStateNew || sharedStateOld) {
    try {
        let parsedState = [];
        
        if (sharedStateNew) {
            const decodedStr = atob(sharedStateNew);
            decodedStr.split('~').forEach(colGroup => {
                const parts = colGroup.split(':');
                const c = parts[0];
                if (parts[1]) {
                    parts[1].split('!').forEach(mod => {
                        const [i, x, y, a, e] = mod.split(',');
                        parsedState.push({ c: c, i: i, x: parseInt(x), y: parseInt(y), a: parseInt(a), e: parseInt(e) });
                    });
                }
            });
        } else {
            parsedState = JSON.parse(decodeURIComponent(atob(sharedStateOld)));
        }
        
        let uniqueCollections = [...new Set(parsedState.map(m => m.c))];
        if (uniqueCollections.length === 1 && rawModels[uniqueCollections[0]]) {
            modelSelect.value = uniqueCollections[0];
            modelSelect.style.display = 'none';
            const collectionLabel = document.createElement('div');
            collectionLabel.style.cssText = "font-weight: bold; padding: 8px; background: #eef5ff; border: 1px solid #b8daff; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase; text-align: center; color: #007bff; font-size: 13px;";
            collectionLabel.innerText = uniqueCollections[0] + " KOLEKCIJA";
            modelSelect.parentNode.insertBefore(collectionLabel, modelSelect);
        }

        loadModel(modelSelect.value);
        canvasArea.innerHTML = ''; 

        parsedState.forEach(d => {
            let modBase = furnitureModels[d.c]?.find(x => x.id === d.i);
            if (!modBase) return;
            
            const el = document.createElement('div'); el.className = 'canvas-module'; 
            Object.assign(el.dataset, {
                id: d.i, name: modBase.name, price: modBase.price, collection: d.c, 
                w: modBase.w, h: modBase.h, angle: d.a, isExpanded: d.e === 1 ? 'true' : 'false'
            }); 
            
            if(modBase.expandable) { el.dataset.sleepw = modBase.sleepW; el.dataset.sleeph = modBase.sleepH; }
            if(modBase.isChaise) { el.dataset.isChaise = 'true'; el.dataset.sleepw = modBase.sleepW; el.dataset.sleeph = modBase.sleepH; }

            el.style.cssText = `width:${modBase.w*scale}px; height:${modBase.h*scale}px; left:${d.x*scale}px; top:${d.y*scale}px; z-index:${zIndexCounter++}; transform:rotate(${d.a}deg)`; 
            el.innerHTML = (d.e === 1 && modBase.expandable ? modBase.svgExpanded : modBase.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; 
            
            attachEvents(el); 
            canvasArea.appendChild(el);
        });
        
        updateOrderSummary(); updateLabels(); 
        setTimeout(() => { updateDimensions(); }, 50);
        saveState();

    } catch (e) {
        console.error("Failed to load shared state", e);
        alert("Nepavyko užkrauti pasidalintos konfigūracijos (nuoroda gali būti sugadinta).");
    }
} else if (requestedModel && rawModels[requestedModel]) {
    modelSelect.value = requestedModel; 
    modelSelect.style.display = 'none'; 
    
    const collectionLabel = document.createElement('div');
    collectionLabel.style.cssText = "font-weight: bold; padding: 8px; background: #eef5ff; border: 1px solid #b8daff; border-radius: 4px; margin-bottom: 12px; text-transform: uppercase; text-align: center; color: #007bff; font-size: 13px;";
    collectionLabel.innerText = requestedModel + " KOLEKCIJA";
    modelSelect.parentNode.insertBefore(collectionLabel, modelSelect);
    
    loadModel(requestedModel);
    
    const saved = localStorage.getItem('sofaState');
    if(saved) restoreState(JSON.parse(saved));
    
} else {
    loadModel(modelSelect.value);
    const saved = localStorage.getItem('sofaState');
    if(saved) restoreState(JSON.parse(saved));
}
