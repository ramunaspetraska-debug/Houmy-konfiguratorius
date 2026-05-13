// Nustatome versijos pavadinimą ir pakeičiame jo dizainą per JS
const watermarkEl = document.getElementById('version-watermark');
watermarkEl.innerText = "V1.27";
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
    
    let group = parseInt(document.getElementById('fabric-group-select').value) || 1;
    let pKey = collectionKey + '_' + moduleId;
    let specificGroupKey = group === 1 ? pKey : pKey + '_gr' + group;
    
    if (appSettings.customPrices[specificGroupKey] !== undefined) {
        return appSettings.customPrices[specificGroupKey];
    }
    
    let basePrice = appSettings.customPrices[pKey] !== undefined ? appSettings.customPrices[pKey] : (modBase.price || getPrice(modBase.w, modBase.h));
    let surcharge = modBase.prices && group > 1 ? (modBase.prices['gr' + group] || 0) : 0;
    
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

function centerWorkspaceToModules() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    if (modules.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    modules.forEach(m => {
        let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
        let w = parseFloat(m.style.width), h = parseFloat(m.style.height);
        let cx = parseFloat(m.style.left) + w/2, cy = parseFloat(m.style.top) + h/2;
        let dx = w/2, dy = h/2;
        
        [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
            let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle);
            let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
            minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
        });
    });

    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    let sofaCX = (minX + maxX) / 2;
    let sofaCY = (minY + maxY) / 2;
    
    currentPanX = (wsRect.width / 2) - sofaCX;
    currentPanY = (wsRect.height / 2) - sofaCY;

    document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
}

function validateWorkspace() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    if (modules.length <= 1) return true;

    let hasOverlap = false;
    const tol = 2;
    
    for (let i = 0; i < modules.length; i++) {
        for (let j = i + 1; j < modules.length; j++) {
            const r1 = modules[i].getBoundingClientRect();
            const r2 = modules[j].getBoundingClientRect();
            
            if (!(r1.right - tol <= r2.left + tol || 
                  r1.left + tol >= r2.right - tol || 
                  r1.bottom - tol <= r2.top + tol || 
                  r1.top + tol >= r2.bottom - tol)) {
                hasOverlap = true;
                break;
            }
        }
        if (hasOverlap) break;
    }

    if (hasOverlap) {
        if (!confirm("Dėmesio: Jūsų darbo lauke kai kurie moduliai persidengia (yra užlipę vienas ant kito). Ar tikrai norite tęsti?")) {
            return false;
        }
    }

    let groups = [];
    let unvisited = new Set(modules);
    while(unvisited.size > 0) {
        let startMod = unvisited.values().next().value;
        let group = new Set([startMod]);
        let added = true;
        while(added) {
            added = false;
            for(let other of unvisited) {
                if(!group.has(other)) { 
                    for(let m of group) { 
                        let r1 = m.getBoundingClientRect();
                        let r2 = other.getBoundingClientRect();
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

    if (groups.length > 1) {
        if (!confirm("Dėmesio: Darbo lauke yra atsiskyrusių modulių (galbūt netyčia paliktų nematomoje vietoje). Ar tikrai norite tęsti?")) {
            return false;
        }
    }

    return true; 
}

let saveStateTimeout = null;
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
    
    if(saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        localStorage.setItem('sofaState', stateStr); 
    }, 500);
    
    updateOrderSummary(); updateLabels();
}

function undo() { if(historyStack.length>1){ historyStack.pop(); restoreState(JSON.parse(historyStack[historyStack.length-1]), false); } }

function restoreState(data, centerView = false) { 
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
    setTimeout(() => { 
        updateDimensions(); 
        if (centerView) centerWorkspaceToModules(); 
    }, 50);
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
            let offset = 28;
            let topY = minY - offset, bottomY = maxY + offset;
            let leftX = minX - offset, rightX = maxX + offset;

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
            svgContent += `<text x="${cx}" y="${textY}" fill="#333" font-size="10" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalW} cm</text>`;
            
            svgContent += `<path d="M ${lineX} ${minY} L ${lineX} ${maxY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
            svgContent += `<text x="${textX}" y="${cy + 4}" transform="rotate(-90 ${textX} ${cy + 4})" fill="#333" font-size="10" font-weight="500" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="3">${totalH} cm</text>`;
        }
    });

    if (dimState === 2 && groups.length > 1) {
        let offset = 65; 
        let totalW = Math.round((GMaxX - GMinX) / scale), totalH = Math.round((GMaxY - GMinY) / scale);
        
        let extStyle = "stroke='#007bff' stroke-width='0.5' stroke-dasharray='4,4' fill='none' opacity='0.5'";
        svgContent += `<line x1="${GMinX}" y1="${GMinY}" x2="${GMinX}" y2="${GMinY - offset}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX}" y2="${GMinY - offset}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMinY}" x2="${GMaxX + offset}" y2="${GMinY}" ${extStyle} />`;
        svgContent += `<line x1="${GMaxX}" y1="${GMaxY}" x2="${GMaxX + offset}" y2="${GMaxY}" ${extStyle} />`;

        svgContent += `<path d="M ${GMinX} ${GMinY - offset} L ${GMaxX} ${GMinY - offset}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
        svgContent += `<text x="${GCX}" y="${GMinY - offset - 6}" fill="#007bff" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalW} cm (Viso)</text>`;
        
        svgContent += `<path d="M ${GMaxX + offset} ${GMinY} L ${GMaxX + offset} ${GMaxY}" stroke="#007bff" stroke-width="1.2" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
        svgContent += `<text x="${GMaxX + offset + 18}" y="${GCY + 5}" transform="rotate(-90 ${GMaxX + offset + 18} ${GCY + 5})" fill="#007bff" font-size="11" font-weight="bold" text-anchor="middle" font-family="sans-serif" paint-order="stroke" stroke="#ffffff" stroke-width="4">${totalH} cm (Viso)</text>`;
        
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
            left: (parseFloat(m.style.left) || 0) / scale,
            top: (parseFloat(m.style.top) || 0) / scale
        }));
        return;
    }

    if(e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (!clipboardData || clipboardData.length === 0) return;
        let newlyPasted = []; selectModule(null);
        
        clipboardData.forEach(d => {
            let pLeft = (d.left * scale) + 40;
            let pTop = (d.top * scale) + 40;
            let modBase = furnitureModels[d.collection]?.find(x => x.id === d.id);
            if (!modBase) return;

            const el = document.createElement('div'); el.className = 'canvas-module';
            Object.assign(el.dataset, {
                id: d.id, name: d.name, price: d.price, collection: d.collection,
                w: d.w, h: d.h, angle: d.angle, isExpanded: d.isExpanded
            });
            
            if (d.isChaise) el.dataset.isChaise = d.isChaise;
            if (d.sleepw) { el.dataset.sleepw = d.sleepw; el.dataset.sleeph = d.sleeph; }
            
            el.style.cssText = `width:${d.w*scale}px; height:${d.h*scale}px; left:${pLeft}px; top:${pTop}px; z-index:${zIndexCounter++}; transform:rotate(${d.angle}deg)`;
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

// --- ADMIN PANELIO LOGIKA SU GRUPĖMIS IR IŠSKLEIDŽIAMU SĄRAŠU ---
let tempAdminPrices = {};

function exportPrices() {
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appSettings.customPrices));
    let dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "houmy_kainos.json");
    dlAnchorElem.click();
}

function exportToExcel() {
    let html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="utf-8"></head>
    <body>
        <table border="1" style="font-family: Arial, sans-serif; border-collapse: collapse;">
            <tr>
                <th style="background-color: #f8f9fa; padding: 10px;">Kolekcija</th>
                <th style="background-color: #f8f9fa; padding: 10px;">Modulis</th>
                <th style="background-color: #f8f9fa; padding: 10px;">Matmenys (cm)</th>
                <th style="background-color: #fff9e6; padding: 10px; font-weight: bold; border: 2px solid #333;">I Grupė (Bazinė)</th>
                <th style="background-color: #f8f9fa; padding: 10px;">II Grupė</th>
                <th style="background-color: #f8f9fa; padding: 10px;">III Grupė</th>
                <th style="background-color: #f8f9fa; padding: 10px;">IV Grupė</th>
            </tr>`;
    
    for(let key in rawModels) {
        rawModels[key].forEach(mod => {
            let pKey = key + '_' + mod.id;
            
            let basePriceDefault = mod.price || getPrice(mod.w, mod.h);
            let basePrice = appSettings.customPrices[pKey] !== undefined ? appSettings.customPrices[pKey] : basePriceDefault;
            
            let gr2 = appSettings.customPrices[pKey+'_gr2'] !== undefined ? appSettings.customPrices[pKey+'_gr2'] : (basePrice + (mod.prices?.gr2 || 0));
            let gr3 = appSettings.customPrices[pKey+'_gr3'] !== undefined ? appSettings.customPrices[pKey+'_gr3'] : (basePrice + (mod.prices?.gr3 || 0));
            let gr4 = appSettings.customPrices[pKey+'_gr4'] !== undefined ? appSettings.customPrices[pKey+'_gr4'] : (basePrice + (mod.prices?.gr4 || 0));
            
            html += `<tr>
                <td style="padding: 5px;">${key.toUpperCase()}</td>
                <td style="padding: 5px;">${mod.name}</td>
                <td style="padding: 5px; text-align: center;">${mod.w}x${mod.h}</td>
                <td style="padding: 5px; font-weight: bold; border-left: 2px solid #333; border-right: 2px solid #333; text-align: center;">${basePrice} €</td>
                <td style="padding: 5px; text-align: center;">${gr2 > basePrice ? gr2 + ' €' : '-'}</td>
                <td style="padding: 5px; text-align: center;">${gr3 > basePrice ? gr3 + ' €' : '-'}</td>
                <td style="padding: 5px; text-align: center;">${gr4 > basePrice ? gr4 + ' €' : '-'}</td>
            </tr>`;
        });
    }
    
    html += `</table></body></html>`;
    
    let blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    let url = URL.createObjectURL(blob);
    let link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Houmy_Kainorastis.xls");
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importPrices(event) {
    let file = event.target.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let imported = JSON.parse(e.target.result);
            if (confirm("Ar tikrai norite perrašyti visas dabartines kainas iš failo?")) {
                appSettings.customPrices = imported;
                localStorage.setItem('houmySettings', JSON.stringify(appSettings));
                alert("Kainos sėkmingai importuotos!");
                location.reload();
            }
        } catch(err) {
            alert("Klaida skaitant failą.");
        }
    };
    reader.readAsText(file);
}

function showPriceHistory() {
    let history = JSON.parse(localStorage.getItem('houmyPriceHistory') || '[]');
    let histHtml = '';

    if (history.length === 0) {
        histHtml = '<p style="color:#888; text-align:center;">Istorija tuščia</p>';
    } else {
        let grouped = {};
        history.forEach(h => {
            let parts = h.date.split(' ');
            let day = parts[0]; 
            let time = parts[1] || '';
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push({ ...h, time: time });
        });

        for (let day in grouped) {
            histHtml += `<div style="margin-bottom: 12px;">
                <div style="background: #eef5ff; color: #007bff; padding: 6px 10px; border-radius: 4px; font-weight: bold; font-size: 13px; border: 1px solid #b8daff;">🗓️ ${day}</div>
                <div style="padding: 6px 10px; border-left: 2px solid #b8daff; margin-left: 10px; background: #fafafa;">`;
            
            grouped[day].forEach(change => {
                let cleanName = change.item.replace(/_/g, ' '); 
                histHtml += `<div style="font-size: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed #eee;">
                    <span style="color:#888; font-size:11px;">[${change.time}]</span> 
                    <strong style="color:#333;">${cleanName}</strong><br>
                    Kaina: <span style="color:#dc3545; text-decoration:line-through;">${change.old}€</span> ➔ <span style="color:#28a745; font-weight:bold;">${change.new}€</span>
                </div>`;
            });
            
            histHtml += `</div></div>`;
        }
    }

    let overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:flex; justify-content:center; align-items:center;';
    overlay.innerHTML = `<div style="background:white; padding:20px; border-radius:8px; width:450px; max-height:85vh; overflow-y:auto; box-shadow:0 5px 15px rgba(0,0,0,0.3); font-family:sans-serif;">
        <h3 style="margin-top:0; border-bottom:2px solid #eee; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            Kainų keitimo istorija
            <button onclick="if(confirm('Ar tikrai norite išvalyti istoriją?')) { localStorage.removeItem('houmyPriceHistory'); this.parentNode.parentNode.parentNode.remove(); showPriceHistory(); }" style="font-size:11px; padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">Išvalyti</button>
        </h3>
        <div style="margin-bottom:15px; max-height: 60vh; overflow-y: auto; padding-right: 5px;">${histHtml}</div>
        <button onclick="this.parentNode.parentNode.remove()" style="padding:10px 12px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">Uždaryti</button>
    </div>`;
    document.body.appendChild(overlay);
}

function syncAdminGrid() {
    document.querySelectorAll('.admin-price-input').forEach(input => {
        let val = parseInt(input.value);
        if (val > 0) tempAdminPrices[input.dataset.pkey] = val;
        else delete tempAdminPrices[input.dataset.pkey];
    });
}

function switchAdminCol(key) {
    syncAdminGrid(); 
    renderAdminGrid(key);
}

function renderAdminGrid(key) {
    let container = document.getElementById('admin-grid-container');
    if(!container) return;
    
    let grid = `<h4 style="text-transform:uppercase; margin-top:0; margin-bottom:10px; color:#333;">${key} Kolekcijos kainos</h4>`;
    grid += `<div style="display:flex; flex-direction:column; gap:8px;">`; 
    
    grid += `<div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap:10px; font-weight:bold; font-size:12px; text-align:center; padding-bottom:5px; border-bottom:2px solid #ddd; min-width: 600px;">
        <div style="text-align:left;">Modulis</div>
        <div>I Gr (Bazinė)</div>
        <div>II Gr</div>
        <div>III Gr</div>
        <div>IV Gr</div>
    </div>`;

    rawModels[key].forEach(mod => { 
        let pKey = key + '_' + mod.id; 
        
        let basePriceDefault = mod.price || getPrice(mod.w, mod.h);
        
        let p1 = tempAdminPrices[pKey] !== undefined ? tempAdminPrices[pKey] : basePriceDefault;
        let p2 = tempAdminPrices[pKey+'_gr2'] !== undefined ? tempAdminPrices[pKey+'_gr2'] : (p1 + (mod.prices?.gr2 || 0));
        let p3 = tempAdminPrices[pKey+'_gr3'] !== undefined ? tempAdminPrices[pKey+'_gr3'] : (p1 + (mod.prices?.gr3 || 0));
        let p4 = tempAdminPrices[pKey+'_gr4'] !== undefined ? tempAdminPrices[pKey+'_gr4'] : (p1 + (mod.prices?.gr4 || 0));
        
        grid += `<div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap:10px; align-items:center; background:#f9f9f9; padding:8px; border-radius:4px; border:1px solid #eee; min-width: 600px;">
            <div style="font-size:13px; font-weight:500;">${mod.name} <small style="color:#888; display:block;">${mod.w}x${mod.h} cm</small></div>
            <input type="number" data-pkey="${pKey}" class="admin-price-input" value="${p1}" style="width:100%; padding:6px; text-align:center; border:1px solid #ccc; border-radius:3px;">
            <input type="number" data-pkey="${pKey}_gr2" class="admin-price-input" value="${p2}" style="width:100%; padding:6px; text-align:center; border:1px solid #ccc; border-radius:3px;">
            <input type="number" data-pkey="${pKey}_gr3" class="admin-price-input" value="${p3}" style="width:100%; padding:6px; text-align:center; border:1px solid #ccc; border-radius:3px;">
            <input type="number" data-pkey="${pKey}_gr4" class="admin-price-input" value="${p4}" style="width:100%; padding:6px; text-align:center; border:1px solid #ccc; border-radius:3px;">
        </div>`; 
    }); 
    grid += `</div>`; 
    container.innerHTML = grid;
}

// override seną funkciją (paliekame, kad neišmestų klaidos sename HTML, jei toks yra)
function applyBulkPrice() {} 

// NAUJA DINAMINĖ MASINIO KEITIMO FUNKCIJA
function applyDynamicBulk(multiplier) { 
    let percent = parseFloat(document.getElementById('dyn-bulk-percent').value); 
    if(isNaN(percent) || percent <= 0) return alert("Įveskite galiojantį procentą (pvz. 10)"); 
    
    let targetGroup = document.getElementById('dyn-bulk-group').value;
    let factor = 1 + (multiplier * (percent / 100)); 
    
    let count = 0;
    document.querySelectorAll('.admin-price-input').forEach(input => { 
        let pkey = input.dataset.pkey;
        let isGr2 = pkey.endsWith('_gr2');
        let isGr3 = pkey.endsWith('_gr3');
        let isGr4 = pkey.endsWith('_gr4');
        let isGr1 = !isGr2 && !isGr3 && !isGr4;

        let shouldUpdate = false;
        if (targetGroup === 'all') shouldUpdate = true;
        else if (targetGroup === 'gr1' && isGr1) shouldUpdate = true;
        else if (targetGroup === 'gr2' && isGr2) shouldUpdate = true;
        else if (targetGroup === 'gr3' && isGr3) shouldUpdate = true;
        else if (targetGroup === 'gr4' && isGr4) shouldUpdate = true;

        if (shouldUpdate) {
            input.value = Math.round(parseFloat(input.value) * factor); 
            count++;
        }
    }); 
    syncAdminGrid();
    alert(`Pakeista kainų: ${count}. (Nepamirškite išsaugoti nustatymų!)`); 
}

function openAdmin() { 
    tempAdminPrices = JSON.parse(JSON.stringify(appSettings.customPrices));

    document.getElementById('admin-modal').style.display = 'flex'; 
    let container = document.getElementById('admin-prices-container'); 
    container.innerHTML = ''; 

    // Viršutinis įrankių baras
    let toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; background: #eef5ff; padding: 12px; border-radius: 8px; border: 1px solid #b8daff;";
    toolbar.innerHTML = `
        <button onclick="exportPrices()" style="flex:1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; min-width:80px;">📥 JSON (Kopija)</button>
        <button onclick="exportToExcel()" style="flex:1; padding: 8px; background: #20c997; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; min-width:80px;">📊 Excel (Peržiūrai)</button>
        <label style="flex:1; padding: 8px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 0; font-size: 11px; text-align: center; min-width:80px;">
            📤 Importuoti <input type="file" accept=".json" style="display:none" onchange="importPrices(event)">
        </label>
        <button onclick="showPriceHistory()" style="flex:1; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px; min-width:80px;">🕰 Istorija</button>
    `;
    container.appendChild(toolbar);

    // Kolekcijų pasirinkimas
    let selectWrap = document.createElement('div');
    selectWrap.style.marginBottom = '15px';
    let selectHtml = `<select id="admin-col-select" onchange="switchAdminCol(this.value)" style="width:100%; padding:10px; font-size:14px; border-radius:4px; border:1px solid #ccc; font-weight:bold; cursor:pointer;">`;
    for(let key in rawModels) {
        selectHtml += `<option value="${key}">${key.toUpperCase()} KOLEKCIJA</option>`;
    }
    selectHtml += `</select>`;
    selectWrap.innerHTML = selectHtml;
    container.appendChild(selectWrap);

    // Masinio keitimo įrankis (išmanusis)
    let bulkWrap = document.createElement('div');
    bulkWrap.style.cssText = "background: #fff3cd; padding: 12px; border-radius: 8px; border: 1px solid #ffeeba; margin-bottom: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;";
    bulkWrap.innerHTML = `
        <strong style="font-size: 13px; color: #856404;">Masinis keitimas:</strong>
        <input type="number" id="dyn-bulk-percent" placeholder="%" style="width: 60px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;">
        <select id="dyn-bulk-group" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; flex: 1; min-width: 130px; cursor:pointer;">
            <option value="all">Visoms grupėms</option>
            <option value="gr1">Tik I Grupei (Bazinei)</option>
            <option value="gr2">Tik II Grupei</option>
            <option value="gr3">Tik III Grupei</option>
            <option value="gr4">Tik IV Grupei</option>
        </select>
        <button onclick="applyDynamicBulk(1)" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight:bold; font-size: 12px;">+ Pakelti</button>
        <button onclick="applyDynamicBulk(-1)" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight:bold; font-size: 12px;">- Sumažinti</button>
    `;
    container.appendChild(bulkWrap);

    // Lentelės konteineris
    let gridContainer = document.createElement('div');
    gridContainer.id = 'admin-grid-container';
    gridContainer.style.overflowX = 'auto'; 
    container.appendChild(gridContainer);

    renderAdminGrid(Object.keys(rawModels)[0]);
}

function closeAdmin() { document.getElementById('admin-modal').style.display = 'none'; }

function saveAdminSettings() { 
    syncAdminGrid(); 
    
    let history = JSON.parse(localStorage.getItem('houmyPriceHistory') || '[]');
    let d = new Date();
    let dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    let timeStr = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    let now = dateStr + ' ' + timeStr;
    
    let changes = [];
    let allKeys = new Set([...Object.keys(tempAdminPrices), ...Object.keys(appSettings.customPrices)]);
            
    allKeys.forEach(k => {
        let oldV = appSettings.customPrices[k];
        let newV = tempAdminPrices[k];
        if (oldV !== newV) {
            let oText = oldV === undefined ? "Standartinė" : oldV;
            let nText = newV === undefined ? "Standartinė" : newV;
            changes.push({ date: now, item: k, old: oText, new: nText });
        }
    });

    if (changes.length > 0) {
        history = [...changes, ...history].slice(0, 100);
        localStorage.setItem('houmyPriceHistory', JSON.stringify(history));
    }

    appSettings.customPrices = tempAdminPrices;
    localStorage.setItem('houmySettings', JSON.stringify(appSettings)); 
    alert("Nustatymai sėkmingai išsaugoti!"); 
    location.reload(); 
}

// ----------------------------------------------

function openArchive() { document.getElementById('archive-modal').style.display = 'flex'; renderArchiveList(); }
function renderArchiveList() { let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); let html = ''; for(let name in archive) { html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border:1px solid #ddd; border-radius:4px; background:#f9f9f9;"><strong style="font-size:13px; color:#333;">${name}</strong><div style="display:flex; gap:5px;"><button onclick="loadFromArchive('${name}')" style="padding:4px 8px; background:#007bff; color:white; border:none; border-radius:3px; cursor:pointer;">Užkrauti</button><button onclick="deleteFromArchive('${name}')" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">Ištrinti</button></div></div>`; } document.getElementById('archive-list').innerHTML = html || '<div style="color:#888; font-size:13px; text-align:center; padding:10px 0;">Archyvas tuščias</div>'; }

function saveToArchive() { 
    let name = document.getElementById('archive-name').value.trim(); 
    if(!name) return alert('Prašome įvesti projekto pavadinimą!'); 
    
    let state = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({
        id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, 
        l: (parseFloat(m.style.left) || 0) / scale,
        t: (parseFloat(m.style.top) || 0) / scale,
        a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded
    })); 
    
    if(state.length === 0) return alert('Nėra ką išsaugoti, sofa tuščia!'); 
    
    let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); 
    
    if (archive[name]) {
        if (!confirm(`Projektas pavadinimu "${name}" jau egzistuoja. Ar norite jį perrašyti?`)) {
            return;
        }
    }
    
    archive[name] = state; 
    localStorage.setItem('houmyArchive', JSON.stringify(archive)); 
    document.getElementById('archive-name').value = ''; 
    renderArchiveList(); 
}

function loadFromArchive(name) { 
    let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); 
    if(archive[name] && archive[name].length > 0) { 
        document.getElementById('model-select').value = archive[name][0].c; 
        loadModel(archive[name][0].c); 
        restoreState(archive[name], true); 
        document.getElementById('archive-modal').style.display = 'none'; 
    } 
}

function deleteFromArchive(name) { if(confirm(`Ar tikrai norite ištrinti projektą "${name}" iš archyvo?`)) { let archive = JSON.parse(localStorage.getItem('houmyArchive') || '{}'); delete archive[name]; localStorage.setItem('houmyArchive', JSON.stringify(archive)); renderArchiveList(); } }

function openClientModal() { 
    const modules = Array.from(document.querySelectorAll('.canvas-module')); 
    if(modules.length === 0) return alert("Nėra modulių pasiūlymui!"); 
    
    if (!validateWorkspace()) return;
    
    document.getElementById('client-modal').style.display = 'flex'; 
    document.getElementById('client-term').value = appSettings.prodTerm; 
    document.getElementById('client-delivery').value = appSettings.deliveryNote; 
    document.getElementById('client-additional').value = appSettings.additionalInfo; 
}

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
        manualPriceVal = parseInt(document.getElementById('client-manual-price').value) || 0,
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
    
    let padding = 30;
    if (dimState === 1) padding = 60;
    if (dimState === 2) padding = 100;
    
    let shiftX = padding - minX;
    let shiftY = padding - minY;

    let originalPositions = new Map();
    modules.forEach(m => {
        originalPositions.set(m, { left: m.style.left, top: m.style.top });
        m.style.left = (parseFloat(m.style.left) + shiftX) + 'px';
        m.style.top = (parseFloat(m.style.top) + shiftY) + 'px';
    });
    updateDimensions(); 
    
    const tmpWrapper = document.getElementById('canvas-wrapper'); 
    let originalTransform = tmpWrapper.style.transform;
    let originalWidth = tmpWrapper.style.width;
    let originalHeight = tmpWrapper.style.height;
    
    tmpWrapper.style.transform = 'translate(0px, 0px)';
    document.getElementById('workspace').style.backgroundPosition = '0px 0px';
    tmpWrapper.style.width = ((maxX - minX) + padding * 2) + 'px'; 
    tmpWrapper.style.height = ((maxY - minY) + padding * 2) + 'px'; 
    
    await new Promise(r => setTimeout(r, 250));
    
    const canvas = await html2canvas(tmpWrapper, { 
        scale: 2, 
        backgroundColor: "#ffffff", 
        useCORS: true
    });
    
    tmpWrapper.style.transform = originalTransform;
    tmpWrapper.style.width = originalWidth;
    tmpWrapper.style.height = originalHeight;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
    
    modules.forEach(m => {
        let orig = originalPositions.get(m);
        m.style.left = orig.left;
        m.style.top = orig.top;
    });
    updateDimensions();
    
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
    
    if (!validateWorkspace()) return;
    
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
    
    let padding = 30;
    if (dimState === 1) padding = 60;
    if (dimState === 2) padding = 100;
    
    let shiftX = padding - minX;
    let shiftY = padding - minY;

    let originalPositions = new Map();
    modules.forEach(m => {
        originalPositions.set(m, { left: m.style.left, top: m.style.top });
        m.style.left = (parseFloat(m.style.left) + shiftX) + 'px';
        m.style.top = (parseFloat(m.style.top) + shiftY) + 'px';
    });
    updateDimensions(); 

    const tmpWrapper = document.getElementById('canvas-wrapper'); 
    let originalTransform = tmpWrapper.style.transform;
    let originalWidth = tmpWrapper.style.width;
    let originalHeight = tmpWrapper.style.height;
    
    tmpWrapper.style.transform = 'translate(0px, 0px)';
    document.getElementById('workspace').style.backgroundPosition = '0px 0px';
    tmpWrapper.style.width = ((maxX - minX) + padding * 2) + 'px'; 
    tmpWrapper.style.height = ((maxY - minY) + padding * 2) + 'px'; 
    
    await new Promise(r => setTimeout(r, 250)); 
    
    const canvas = await html2canvas(tmpWrapper, { 
        scale: 2, 
        backgroundColor: "#ffffff", 
        useCORS: true
    }); 
    
    tmpWrapper.style.transform = originalTransform;
    tmpWrapper.style.width = originalWidth;
    tmpWrapper.style.height = originalHeight;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
    
    modules.forEach(m => {
        let orig = originalPositions.get(m);
        m.style.left = orig.left;
        m.style.top = orig.top;
    });
    updateDimensions();

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

function shareConfiguration() {
    const modules = Array.from(document.querySelectorAll('.canvas-module'));
    if (modules.length === 0) {
        alert("Sofa tuščia, nėra kuo dalintis!");
        return;
    }

    if (!validateWorkspace()) return;

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

    /* --- MOBILIOSIOS VERSIJOS STILIAI --- */
    #mobile-color-fab {
        display: none; 
        position: fixed;
        bottom: 90px; 
        right: 20px;
        width: 50px;
        height: 50px;
        background: #007bff;
        color: white;
        border-radius: 50%;
        text-align: center;
        line-height: 50px;
        font-size: 24px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        cursor: pointer;
        z-index: 1000;
        transition: transform 0.2s;
    }
    #mobile-color-fab:active { transform: scale(0.9); }
    
    #mobile-color-modal {
        position: fixed;
        bottom: -100%; 
        left: 0;
        width: 100%;
        background: white;
        border-top-left-radius: 20px;
        border-top-right-radius: 20px;
        box-shadow: 0 -5px 15px rgba(0,0,0,0.2);
        transition: bottom 0.3s ease-in-out;
        z-index: 1001;
        padding: 20px;
        box-sizing: border-box;
    }
    #mobile-color-modal.active { bottom: 0; }

    #mobile-color-overlay {
        display: none;
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.4);
        z-index: 1000;
        backdrop-filter: blur(2px);
    }
    #mobile-color-overlay.active { display: block; }

    @media (max-width: 768px) {
        .desktop-color-picker { display: none !important; }
        #mobile-color-fab { display: block; }
    }
`;
document.head.appendChild(colorStyle);

function changeSofaColor(hex) {
    appSettings.fabricColor = hex;
    localStorage.setItem('houmySettings', JSON.stringify(appSettings));
    document.documentElement.style.setProperty('--sofa-color', hex);
    
    document.querySelectorAll('.color-dot').forEach(d => {
        if(d.dataset.hex === hex) {
            d.classList.add('active');
        } else {
            d.classList.remove('active');
        }
    });

    document.getElementById('mobile-color-modal').classList.remove('active');
    document.getElementById('mobile-color-overlay').classList.remove('active');
}

// 1. DESKTOP VERSIJOS PALETĖ (Šoniniame meniu)
const rightSidebarMenu = document.getElementById('sidebar-right');
if (rightSidebarMenu) {
    const desktopWrapper = document.createElement('div');
    desktopWrapper.className = 'color-picker-wrapper desktop-color-picker';
    
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
        dot.dataset.hex = c.hex;
        dot.onclick = () => changeSofaColor(c.hex);
        container.appendChild(dot);
    });

    const customWrapper = document.createElement('div');
    customWrapper.className = 'color-dot';
    customWrapper.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
    customWrapper.title = 'Pasirinkti bet kokią spalvą (sava spalva)';
    customWrapper.style.position = 'relative';
    customWrapper.style.overflow = 'hidden';

    const nativeInput = document.createElement('input');
    nativeInput.type = 'color';
    nativeInput.value = appSettings.fabricColor;
    nativeInput.style.cssText = 'position: absolute; opacity: 0; width: 200%; height: 200%; top: -50%; left: -50%; cursor: pointer;';
    
    nativeInput.addEventListener('input', (e) => {
        changeSofaColor(e.target.value);
    });

    customWrapper.appendChild(nativeInput);
    container.appendChild(customWrapper);

    desktopWrapper.appendChild(title);
    desktopWrapper.appendChild(container);
    rightSidebarMenu.insertBefore(desktopWrapper, rightSidebarMenu.firstChild);

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

// 2. MOBILIOSIOS VERSIJOS ELEMENTAI (Kuriami tiesiai Body elemente)
const mobileOverlay = document.createElement('div');
mobileOverlay.id = 'mobile-color-overlay';
mobileOverlay.onclick = () => { 
    document.getElementById('mobile-color-modal').classList.remove('active');
    mobileOverlay.classList.remove('active');
};
document.body.appendChild(mobileOverlay);

const mobileModal = document.createElement('div');
mobileModal.id = 'mobile-color-modal';

const mobileTitle = document.createElement('div');
mobileTitle.className = 'color-picker-title';
mobileTitle.style.fontSize = "14px";
mobileTitle.innerText = "Pasirinkite audinio spalvą";

const mobileContainer = document.createElement('div');
mobileContainer.className = 'color-picker-container';

colors.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (appSettings.fabricColor === c.hex ? ' active' : '');
    dot.style.background = c.hex;
    dot.title = c.name;
    dot.dataset.hex = c.hex;
    dot.style.width = "32px";
    dot.style.height = "32px";
    dot.onclick = () => changeSofaColor(c.hex);
    mobileContainer.appendChild(dot);
});

mobileModal.appendChild(mobileTitle);
mobileModal.appendChild(mobileContainer);
document.body.appendChild(mobileModal);

const mobileFab = document.createElement('div');
mobileFab.id = 'mobile-color-fab';
mobileFab.innerHTML = '🎨'; 
mobileFab.onclick = () => {
    mobileModal.classList.add('active');
    mobileOverlay.classList.add('active');
};
document.body.appendChild(mobileFab);

updateZoomText();

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
        setTimeout(() => { updateDimensions(); centerWorkspaceToModules(); }, 50);
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
    if(saved) {
        restoreState(JSON.parse(saved), true);
    }
    
} else {
    const saved = localStorage.getItem('sofaState');
    if(saved) {
        try {
            let parsedState = JSON.parse(saved);
            // Jei yra išsaugotų modulių, paimame pirmo modulio kolekciją
            if (parsedState && parsedState.length > 0) {
                let firstModCollection = parsedState[0].c;
                // Patikriname, ar tokia kolekcija egzistuoja
                if (rawModels[firstModCollection]) {
                    modelSelect.value = firstModCollection;
                }
            }
            // Užkrauname šoninį meniu pagal atnaujintą pasirinkimą
            loadModel(modelSelect.value);
            // Atkuriame darbo lauką
            restoreState(parsedState, true);
        } catch(e) {
            console.error("Klaida atkuriant sesiją:", e);
            loadModel(modelSelect.value);
        }
    } else {
        loadModel(modelSelect.value);
    }
}

// --- MOBILIOSIOS VERSIJOS UI OPTIMIZAVIMAS ---
function optimizeMobileLayout() {
    if (window.innerWidth > 768) return;

    const modelSelect = document.getElementById('model-select');
    const fabricSelect = document.getElementById('fabric-group-select');
    
    if (fabricSelect && fabricSelect.previousElementSibling) {
        fabricSelect.previousElementSibling.style.display = 'none';
    }
    if (modelSelect && modelSelect.previousElementSibling && modelSelect.previousElementSibling.id !== 'mobile-top-wrap') {
        modelSelect.previousElementSibling.style.display = 'none';
    }

    if (modelSelect && fabricSelect && !document.getElementById('mobile-top-wrap')) {
        const wrap = document.createElement('div');
        wrap.id = 'mobile-top-wrap';
        wrap.style.cssText = 'display: flex; gap: 8px; width: 100%; margin-bottom: 10px; align-items: stretch;';
        
        modelSelect.parentNode.insertBefore(wrap, modelSelect);
        
        const colLabel = Array.from(wrap.parentNode.children).find(el => el.tagName === 'DIV' && el.innerText.includes('KOLEKCIJA'));
        if (colLabel) colLabel.style.display = 'none';
        
        modelSelect.style.flex = '1';
        modelSelect.style.width = 'auto'; 
        wrap.appendChild(modelSelect);
        
        fabricSelect.style.flex = '1';
        fabricSelect.style.width = 'auto';
        wrap.appendChild(fabricSelect);
    }

    const btnPdf = document.querySelector('button[onclick="openClientModal()"]');
    const btnBp = document.querySelector('button[onclick="openBlueprintModal()"]');
    const btnShare = document.getElementById('share-btn');
    
    if (btnPdf && btnBp && btnShare && !document.getElementById('mobile-btn-wrap')) {
        const btnWrap = document.createElement('div');
        btnWrap.id = 'mobile-btn-wrap';
        btnWrap.style.cssText = 'display: flex; gap: 6px; width: 100%; justify-content: space-between; margin-top: 15px;';
        
        if(btnPdf.innerHTML.includes('Komercinis')) btnPdf.innerHTML = '📄 Pasiūlymas';
        if(btnBp.innerHTML.includes('Gamybos')) btnBp.innerHTML = '📐 Brėžinys';
        if(btnShare.innerHTML.includes('nuoroda')) btnShare.innerHTML = '🔗 Dalintis';

        [btnShare, btnPdf, btnBp].forEach(btn => {
            btn.style.flex = '1';
            btn.style.fontSize = '11px';
            btn.style.padding = '10px 4px';
            btn.style.margin = '0'; 
            btn.style.whiteSpace = 'normal';
            btn.style.lineHeight = '1.2';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.textAlign = 'center';
            btnWrap.appendChild(btn);
        });
        
        const sidebar = document.getElementById('sidebar-right');
        if (sidebar) {
            sidebar.appendChild(btnWrap);
        }
    }
}

setTimeout(optimizeMobileLayout, 300);
