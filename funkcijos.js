// Nustatome versijos pavadinimą ir dizainą
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
        btn.style.background = 'transparent'; btn.style.borderColor = 'transparent'; btn.style.filter = 'none'; ind.innerText = '';
    } else if (dimState === 1) {
        btn.style.background = '#eef5ff'; btn.style.borderColor = '#b8daff'; btn.style.filter = 'drop-shadow(0px 0px 2px rgba(0,123,255,0.5))'; ind.innerText = '1';
    } else if (dimState === 2) {
        btn.style.background = '#cce5ff'; btn.style.borderColor = '#007bff'; btn.style.filter = 'drop-shadow(0px 0px 3px rgba(0,123,255,0.8))'; ind.innerText = '2';
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

function getDisplayName(modData, isMixed) { return isMixed ? `${modData.collection.toUpperCase()} ${modData.name}` : modData.name; }

function generateModuleChainText(modules, isMixed) {
    if (!modules || modules.length === 0) return "";
    let sorted = [...modules].sort((a,b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    return sorted.map(m => isMixed ? `${m.dataset.collection.toUpperCase()} ${m.dataset.name}` : m.dataset.name).join(' + ');
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
    let group = parseInt(document.getElementById('fabric-group-select').value) || 1;
    let pKey = collectionKey + '_' + moduleId;
    let specificGroupKey = group === 1 ? pKey : pKey + '_gr' + group;
    if (appSettings.customPrices[specificGroupKey] !== undefined) return appSettings.customPrices[specificGroupKey];
    let basePrice = appSettings.customPrices[pKey] !== undefined ? appSettings.customPrices[pKey] : (modBase.price || getPrice(modBase.w, modBase.h));
    let surcharge = modBase.prices && group > 1 ? (modBase.prices['gr' + group] || 0) : 0;
    return basePrice + surcharge;
}

function updateZoomText() { document.getElementById('zoom-level').innerText = Math.round((scale / 1.5) * 100) + '%'; }

function changeZoom(f, e = null) { 
    let oldScale = scale; scale = Math.max(0.4, Math.min(2.5, scale + f)); let ratio = scale / oldScale;
    let rect = document.getElementById('workspace').getBoundingClientRect();
    let mouseX = e ? (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left : rect.width / 2;
    let mouseY = e ? (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top : rect.height / 2;
    let relX = mouseX - currentPanX; let relY = mouseY - currentPanY;
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

function centerWorkspaceToModules() {
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if (modules.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    modules.forEach(m => {
        let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
        let w = parseFloat(m.style.width), h = parseFloat(m.style.height);
        let cx = parseFloat(m.style.left) + w/2, cy = parseFloat(m.style.top) + h/2;
        let dx = w/2, dy = h/2;
        [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
            let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle);
            let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
            minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
        });
    });
    const wsRect = document.getElementById('workspace').getBoundingClientRect();
    currentPanX = (wsRect.width / 2) - (minX + maxX) / 2;
    currentPanY = (wsRect.height / 2) - (minY + maxY) / 2;
    document.getElementById('canvas-wrapper').style.transform = `translate(${currentPanX}px, ${currentPanY}px)`;
    document.getElementById('workspace').style.backgroundPosition = `${currentPanX}px ${currentPanY}px`;
}

function validateWorkspace() {
    const modules = Array.from(document.querySelectorAll('.canvas-module')); if (modules.length <= 1) return true;
    let hasOverlap = false; const tol = 2;
    for (let i = 0; i < modules.length; i++) {
        for (let j = i + 1; j < modules.length; j++) {
            const r1 = modules[i].getBoundingClientRect(); const r2 = modules[j].getBoundingClientRect();
            if (!(r1.right - tol <= r2.left + tol || r1.left + tol >= r2.right - tol || r1.bottom - tol <= r2.top + tol || r1.top + tol >= r2.bottom - tol)) {
                hasOverlap = true; break;
            }
        }
        if (hasOverlap) break;
    }
    if (hasOverlap && !confirm("Dėmesio: Kai kurie moduliai persidengia. Ar tikrai norite tęsti?")) return false;
    return true; 
}

function saveState() { 
    const s = Array.from(document.querySelectorAll('.canvas-module')).map(m=>({
        id:m.dataset.id, n:m.dataset.name, p:m.dataset.price, c:m.dataset.collection, w:m.dataset.w, h:m.dataset.h, 
        l: (parseFloat(m.style.left) || 0) / scale, t: (parseFloat(m.style.top) || 0) / scale, a:m.dataset.angle, z:m.style.zIndex, exp: m.dataset.isExpanded
    })); 
    const stateStr = JSON.stringify(s); historyStack.push(stateStr); if(historyStack.length > 20) historyStack.shift(); 
    localStorage.setItem('sofaState', stateStr); updateOrderSummary(); updateLabels();
}

function undo() { if(historyStack.length>1){ historyStack.pop(); restoreState(JSON.parse(historyStack[historyStack.length-1]), false); } }

function restoreState(data, centerView = false) { 
    canvasArea.innerHTML=''; 
    data.forEach(d=>{ 
        let modBase = furnitureModels[d.c]?.find(x=>x.id===d.id); if (!modBase) return;
        const el=document.createElement('div'); el.className='canvas-module'; 
        Object.assign(el.dataset,{id:d.id, name:d.n, price:d.p, collection:d.c, w:d.w, h:d.h, angle:d.a, isExpanded: d.exp || 'false'}); 
        el.style.cssText=`width:${d.w*scale}px; height:${d.h*scale}px; left:${d.l*scale}px; top:${d.t*scale}px; z-index:${d.z}; transform:rotate(${d.a}deg)`; 
        el.innerHTML= (d.exp === 'true' && modBase.expandable ? modBase.svgExpanded : modBase.svg) + `<span class="label" style="transform:rotate(${-d.a}deg)"></span>`; 
        attachEvents(el); canvasArea.appendChild(el); 
    }); 
    updateOrderSummary(); updateLabels(); setTimeout(() => { updateDimensions(); if (centerView) centerWorkspaceToModules(); }, 50);
}

function clearWorkspace() { if(confirm("Išvalyti viską?")) { canvasArea.innerHTML = ''; currentPanX = 0; currentPanY = 0; document.getElementById('canvas-wrapper').style.transform = `translate(0px, 0px)`; document.getElementById('workspace').style.backgroundPosition = `0px 0px`; saveState(); updateDimensions(); } }

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
    const modules = Array.from(document.querySelectorAll('.canvas-module')); const svgAr = document.getElementById('svg-arrows');
    svgAr.style.overflow = 'visible'; if (modules.length === 0) { document.getElementById('dimension-display').innerHTML = 'Išmatavimai: <b>0 x 0 cm</b>'; svgAr.style.display = 'none'; return; }
    let groups = [], unvisited = new Set(modules);
    while(unvisited.size > 0) {
        let startMod = unvisited.values().next().value, group = new Set([startMod]), added = true;
        while(added) {
            added = false;
            for(let other of unvisited) {
                if(!group.has(other)) { for(let m of group) { 
                    let r1 = m.getBoundingClientRect(), r2 = other.getBoundingClientRect();
                    if(!(r1.right < r2.left-2 || r1.left > r2.right+2 || r1.bottom < r2.top-2 || r1.top > r2.bottom+2)) { group.add(other); added = true; break; } 
                } }
            }
        }
        groups.push(Array.from(group)); group.forEach(m => unvisited.delete(m));
    }
    let displayTexts = []; let svgContent = `<defs><marker id="tick" markerWidth="1.5" markerHeight="10" refX="0.75" refY="5" orient="auto"><rect x="0" y="0" width="1.5" height="10" fill="#555" /></marker></defs>`;
    groups.forEach((g, index) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        g.forEach(m => {
            let angle = (parseInt(m.dataset.angle) || 0) * Math.PI / 180;
            let dx = parseFloat(m.dataset.w)*scale/2, dy = parseFloat(m.dataset.h)*scale/2;
            let cx = parseFloat(m.style.left) + parseFloat(m.style.width)/2, cy = parseFloat(m.style.top) + parseFloat(m.style.height)/2;
            [ {x:-dx,y:-dy}, {x:dx,y:-dy}, {x:dx,y:dy}, {x:-dx,y:dy} ].forEach(c => {
                let rx = cx + c.x * Math.cos(angle) - c.y * Math.sin(angle); let ry = cy + c.x * Math.sin(angle) + c.y * Math.cos(angle);
                minX = Math.min(minX, rx); maxX = Math.max(maxX, rx); minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
            });
        });
        const totalW = Math.round((maxX - minX) / scale), totalH = Math.round((maxY - minY) / scale);
        displayTexts.push(`${groups.length > 1 ? 'Baldo ' + (index+1) : 'Išmatavimai'}: <b style="color:#007bff">${totalW} x ${totalH} cm</b>`);
        if (dimState > 0) {
            let lineY = minY - 28, lineX = maxX + 28;
            svgContent += `<path d="M ${minX} ${lineY} L ${maxX} ${lineY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
            svgContent += `<text x="${(minX+maxX)/2}" y="${lineY-6}" fill="#333" font-size="10" text-anchor="middle" font-family="sans-serif">${totalW} cm</text>`;
            svgContent += `<path d="M ${lineX} ${minY} L ${lineX} ${maxY}" stroke="#555" stroke-width="0.8" fill="none" marker-start="url(#tick)" marker-end="url(#tick)" />`;
            svgContent += `<text x="${lineX+16}" y="${(minY+maxY)/2}" transform="rotate(-90 ${lineX+16} ${(minY+maxY)/2})" fill="#333" font-size="10" text-anchor="middle" font-family="sans-serif">${totalH} cm</text>`;
        }
    });
    svgAr.innerHTML = svgContent; svgAr.style.display = (dimState > 0) ? 'block' : 'none';
    document.getElementById('dimension-display').innerHTML = displayTexts.join('<br>');
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

// --- ADMIN LANGAS SU PIN KODU ---
function openAdmin() { 
    let pin = prompt("Įveskite administratoriaus PIN kodą:");
    if (pin !== "7030") { alert("Neteisingas PIN kodas!"); return; }
    
    tempAdminPrices = JSON.parse(JSON.stringify(appSettings.customPrices));
    document.getElementById('admin-modal').style.display = 'flex'; 
    let container = document.getElementById('admin-prices-container'); 
    container.innerHTML = ''; 

    // Viršutinis įrankių baras
    let toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; background: #eef5ff; padding: 12px; border-radius: 8px; border: 1px solid #b8daff;";
    toolbar.innerHTML = `
        <button onclick="exportPrices()" style="flex:1; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">📥 JSON</button>
        <button onclick="exportToExcel()" style="flex:1; padding: 8px; background: #20c997; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">📊 Excel</button>
        <button onclick="showPriceHistory()" style="flex:1; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;">🕰 Istorija</button>
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

    // Lentelės konteineris
    let gridContainer = document.createElement('div');
    gridContainer.id = 'admin-grid-container';
    container.appendChild(gridContainer);

    renderAdminGrid(Object.keys(rawModels)[0]);
}

function closeAdmin() { document.getElementById('admin-modal').style.display = 'none'; }

function openClientModal() { 
    if(document.querySelectorAll('.canvas-module').length === 0) return alert("Nėra modulių!"); 
    if (!validateWorkspace()) return;
    document.getElementById('client-modal').style.display = 'flex'; 
    document.getElementById('client-term').value = appSettings.prodTerm; 
    document.getElementById('client-delivery').value = appSettings.deliveryNote; 
}

// --- PDF GENERAVIMAS SU RANKINE KAINA ---
async function generatePDFWithDetails() { 
    appSettings.prodTerm = document.getElementById('client-term').value.trim(); 
    appSettings.deliveryNote = document.getElementById('client-delivery').value.trim(); 
    appSettings.additionalInfo = document.getElementById('client-additional').value.trim(); 
    localStorage.setItem('houmySettings', JSON.stringify(appSettings)); 
    document.getElementById('client-modal').style.display = 'none'; 
    selectModule(null); 
    
    const modules = Array.from(document.querySelectorAll('.canvas-module')); 
    let discountVal = parseInt(document.getElementById('client-discount').value) || 0; 
    let manualPrice = parseFloat(document.getElementById('client-manual-price').value);
    
    let total = 0;
    modules.forEach(m => total += getModulePrice(m.dataset.collection, m.dataset.id));
    
    let finalTotal = total;
    if (!isNaN(manualPrice) && manualPrice > 0) {
        // PRIORITETAS: Rankinis įvedimas
        finalTotal = manualPrice;
        document.getElementById('pdf-discount-text').style.display = 'block'; 
        document.getElementById('pdf-discount-text').innerText = `Pradinė kaina: ${total} €`; 
    } else if (discountVal > 0) { 
        // Nuolaida %
        finalTotal = total - Math.round(total * (discountVal / 100)); 
        document.getElementById('pdf-discount-text').style.display = 'block'; 
        document.getElementById('pdf-discount-text').innerText = `Bazinė kaina: ${total} €`; 
    } else { 
        document.getElementById('pdf-discount-text').style.display = 'none'; 
    }

    let bePVM = (finalTotal / 1.21).toFixed(2);
    let pvmSuma = (finalTotal - parseFloat(bePVM)).toFixed(2);
    
    document.getElementById('pdf-price-breakdown').innerHTML = `
        <div style="font-size:10px; color:#555; margin-bottom:2px;">Suma be PVM: <b>${bePVM.replace('.', ',')} €</b></div>
        <div style="font-size:10px; color:#555; margin-bottom:4px;">PVM (21%): <b>${pvmSuma.replace('.', ',')} €</b></div>
        <div style="font-size:16px; font-weight:bold; color:#111; border-top: 2px solid #333; padding-top: 4px;">Viso su PVM: ${finalTotal} €</div>
    `;

    // (Čia toliau eina html2canvas ir jspdf logika iš tavo projekto)
    const pdfTemplate = document.getElementById('pdf-template');
    pdfTemplate.style.display = 'flex';
    // ... jspdf generavimas ...
}

// --- PAGALBINĖS DRAG/ZOOM/ATTACH FUNKCIJOS (TURI BŪTI IŠ SENO FAILO) ---
function attachEvents(modEl) {
    function startDrag(e) {
        isGlobalDragging = true; draggedModule = modEl; selectModule(modEl);
        dragGroup = document.getElementById('group-toggle').checked ? getConnectedGroup(modEl) : [modEl];
        dragStartX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        dragStartY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        dragInitials = dragGroup.map(m => ({ left: parseFloat(m.style.left)||0, top: parseFloat(m.style.top)||0 }));
    }
    modEl.addEventListener('mousedown', startDrag);
    modEl.addEventListener('touchstart', startDrag, {passive: false});
    modEl.addEventListener('dblclick', () => toggleExpand(modEl));
}

function addModuleToWorkspace(modData, collectionKey) {
    const el = document.createElement('div'); el.className = 'canvas-module';
    Object.assign(el.dataset, { id:modData.id, name:modData.name, collection:collectionKey, w:modData.w, h:modData.h, angle:0, isExpanded:'false' });
    el.style.cssText = `width:${modData.w*scale}px; height:${modData.h*scale}px; top:150px; left:350px; z-index:${zIndexCounter++};`;
    el.innerHTML = modData.svg + `<span class="label"></span>`;
    attachEvents(el); canvasArea.appendChild(el); selectModule(el); saveState(); setTimeout(updateDimensions, 50);
}

// Užkrauname pradinį modelį
loadModel(modelSelect.value);
