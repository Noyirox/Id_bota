// Safe fallback if db.js failed to load
if (typeof GoBotanyDB === 'undefined') {
    window.GoBotanyDB = { taxa: {}, dkey: {} };
    // legacy support
    if (typeof all_taxa !== 'undefined') window.GoBotanyDB.taxa = all_taxa;
    if (typeof dkey_data !== 'undefined') window.GoBotanyDB.dkey = dkey_data;
}

const all_taxa = GoBotanyDB.taxa;
const dkey_data = GoBotanyDB.dkey;

let dkeyHistory = [];

// --- VARIABLES POUR LA CARTE LEAFLET ---
let carte = null;
let calqueEspece = null;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    renderPileGroups();
    
    // Tab Navigation
    document.getElementById('btn-full-key').addEventListener('click', () => switchTab('full-key'));
    document.getElementById('btn-d-key').addEventListener('click', () => switchTab('d-key'));
    document.getElementById('btn-search').addEventListener('click', () => switchTab('search'));

    // SPM Toggle
    document.getElementById('spm-toggle').addEventListener('change', () => {
        // Find which tab is active and re-render
        if (document.getElementById('btn-full-key').classList.contains('active')) {
            const activeBtn = document.querySelector('#pile-groups button.active');
            if (activeBtn) activeBtn.click();
        } else if (document.getElementById('btn-search').classList.contains('active')) {
            triggerSearch();
        }
    });

    // Search Input
    document.getElementById('search-input').addEventListener('input', triggerSearch);
}

function switchTab(tabId) {
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('view-full-key').style.display = 'none';
    document.getElementById('view-d-key').style.display = 'none';
    document.getElementById('view-search').style.display = 'none';

    if(tabId === 'full-key') {
        document.getElementById('btn-full-key').classList.add('active');
        document.getElementById('view-full-key').style.display = 'block';
    } else if(tabId === 'd-key') {
        document.getElementById('btn-d-key').classList.add('active');
        document.getElementById('view-d-key').style.display = 'block';
        if (dkeyHistory.length === 0) {
            renderDKey('/dkey/', 'root');
        }
    } else if(tabId === 'search') {
        document.getElementById('btn-search').classList.add('active');
        document.getElementById('view-search').style.display = 'block';
        triggerSearch();
    }
}

function renderPileGroups() {
    const container = document.getElementById('pile-groups');
    container.innerHTML = '';
    
    // We can extract unique piles from all_taxa
    const piles = new Set();
    Object.values(all_taxa).forEach(t => {
        if (t.pile_slugs) {
            t.pile_slugs.forEach(p => piles.add(p));
        }
    });

    const pilesArr = Array.from(piles).sort();
    
    if (pilesArr.length === 0) {
        container.innerHTML = '<p>No data loaded.</p>';
        return;
    }
    
    pilesArr.forEach(pile => {
        const btn = document.createElement('button');
        // Beautify the slug slightly
        btn.textContent = pile.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        btn.onclick = () => selectPile(pile, btn);
        container.appendChild(btn);
    });
}

function selectPile(slug, btnElement) {
    document.querySelectorAll('#pile-groups button').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    
    const matchingTaxa = Object.values(all_taxa).filter(t => t.pile_slugs && t.pile_slugs.includes(slug));
    renderSpeciesGrid(matchingTaxa, document.getElementById('species-grid'));
}

function triggerSearch() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const isSpmOnly = document.getElementById('spm-toggle').checked;
    
    let results = Object.values(all_taxa);
    
    if (isSpmOnly) {
        results = results.filter(t => t.is_spm);
    }
    
    if (query.length > 1) {
        results = results.filter(t => {
            return t.scientific_name.toLowerCase().includes(query) || 
                   (t.common_name && t.common_name.toLowerCase().includes(query)) ||
                   (t.nom_vern && t.nom_vern.toLowerCase().includes(query));
        });
    } else if (query.length === 0) {
        // show none or all? let's show empty
        results = [];
    }
    
    renderSpeciesGrid(results, document.getElementById('search-results'));
}

function renderSpeciesGrid(taxaList, gridElement) {
    gridElement.innerHTML = '';
    
    const isSpmOnly = document.getElementById('spm-toggle').checked;
    let filtered = taxaList;
    if (isSpmOnly) {
        filtered = taxaList.filter(t => t.is_spm);
    }
    
    const countLabel = document.getElementById('results-count');
    if (countLabel && gridElement.id === 'species-grid') {
        countLabel.textContent = `Matching Species (${filtered.length})`;
    }

    filtered.forEach(taxon => {
        const card = document.createElement('div');
        card.className = 'species-card';
        
        let imgHtml = '<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="No image">';
        if (taxon.images && taxon.images.length > 0) {
            const firstImg = taxon.images[0];
            const imgSrc = firstImg.local_path ? `../${firstImg.local_path}` : `../data/images/${firstImg.url.split('/').pop()}`;
            imgHtml = `<img src="${imgSrc}" alt="${taxon.scientific_name}">`;
        }

        card.innerHTML = `
            ${imgHtml}
            <div class="species-info">
                <p class="sci-name">${taxon.is_spm ? '<span class="star" title="Saint-Pierre-et-Miquelon">★</span> ' : ''}${taxon.scientific_name}</p>
                <p class="com-name">${taxon.nom_vern ? taxon.nom_vern : (taxon.common_name || '')}</p>
            </div>
        `;
        card.onclick = () => openModal(taxon);
        gridElement.appendChild(card);
    });
}

function switchMainImage(src) {
    document.getElementById('modal-main-image').src = src;
    document.querySelectorAll('.thumb-img').forEach(img => img.classList.remove('active'));
    event.target.classList.add('active');
}
function openModal(taxon) {
    const modal = document.getElementById('species-modal');
    const body = document.getElementById('modal-body');
    
    // --- 1. NETTOYAGE DE LA CARTE AVANT TOUTE CHOSE ---
    if (carte !== null) {
        carte.remove();
        carte = null;
    }

    let galleryHtml = '';
    let thumbsHtml = '';
    if (taxon.images && taxon.images.length > 0) {
        const firstImgSrc = taxon.images[0].local_path ? `../${taxon.images[0].local_path}` : `../data/images/${taxon.images[0].url.split('/').pop()}`;
        galleryHtml = `<img id="modal-main-image" class="main-image" src="${firstImgSrc}">`;
        
        taxon.images.forEach((img, idx) => {
            const src = img.local_path ? `../${img.local_path}` : `../data/images/${img.url.split('/').pop()}`;
            const activeClass = idx === 0 ? 'active' : '';
            thumbsHtml += `<img class="thumb-img ${activeClass}" src="${src}" onclick="switchMainImage('${src}')" title="${img.type || ''}">`;
        });
    }

    let spmHtml = '';
    if (taxon.is_spm) {
        spmHtml = `<div class="spm-badge">★ Flore de Saint-Pierre-et-Miquelon (Statut: ${taxon.spm_status})</div>`;
    }

    let charTable = '';
    const chars = taxon.details?.characteristics;
    if (chars && Object.keys(chars).length > 0) {
        charTable = '<table class="characteristics-table"><tbody>';
        for (const [key, val] of Object.entries(chars)) {
            charTable += `<tr><th>${key}</th><td>${val}</td></tr>`;
        }
        charTable += '</tbody></table>';
    }

    const facts = taxon.details?.facts ? `<p>${taxon.details.facts}</p>` : '';
    const syns = (taxon.details?.synonyms && taxon.details.synonyms.length > 0) ? 
        `<p><strong>Synonyms:</strong> ${taxon.details.synonyms.join(', ')}</p>` : '';

    const frName = taxon.nom_vern ? `<h3>${taxon.nom_vern}</h3>` : '';
    const enName = taxon.common_name ? `<p style="color:#888;">${taxon.common_name}</p>` : '';

    // --- 2. INJECTION DU HTML ---
    body.innerHTML = `
        <div class="species-header">
            <div class="species-title-area">
                <h2>${taxon.scientific_name}</h2>
                ${frName}
                ${enName}
                <p><strong>Famille :</strong> ${taxon.family || 'N/A'}</p>
                ${spmHtml}
            </div>
        </div>
        <div class="species-content-layout">
            <div class="gallery">
                ${galleryHtml}
                <div class="thumbnails">
                    ${thumbsHtml}
                </div>
            </div>
            <div class="species-details">
                ${facts}
                ${syns}
                ${charTable ? '<h4>Caractéristiques physiques</h4>' + charTable : ''}
                
                <h4 style="margin-top: 20px;">Carte de répartition</h4>
                <div id="mini-carte" style="height: 250px; width: 100%; border-radius: 8px; background-color: #e0e0e0; z-index: 1;"></div>
            </div>
        </div>
    `;
    
    // --- 3. AFFICHAGE ET INITIALISATION ---
    modal.style.display = 'block';
    
    carte = L.map('mini-carte').setView([46.85, -56.3], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(carte);

    // On laisse 150ms à la tablette pour afficher la fenêtre avant de manipuler la carte (plus sûr)
    setTimeout(function() {
        carte.invalidateSize();
        chargerCarte(taxon.scientific_name);
    }, 150);

    modal.querySelector('.close-btn').onclick = () => {
        modal.style.display = 'none';
    }
}


// --- FONCTION POUR CHARGER LES DONNÉES GEOJSON (ULTRA-ROBUSTE) ---
function chargerCarte(especeActuelle) {
    const containerCarte = document.getElementById('mini-carte');

    if (typeof observationsData === 'undefined') {
        containerCarte.insertAdjacentHTML('afterend', '<p style="color:red; text-align:center;">❌ Erreur: observations.js introuvable.</p>');
        return;
    }

    const nomSimplifie = especeActuelle.split(' ').slice(0, 2).join(' ').trim();
    const coordonnees = observationsData[especeActuelle] || observationsData[nomSimplifie];
    
    if (!coordonnees || coordonnees.length === 0) {
        containerCarte.insertAdjacentHTML('afterend', `<p style="color:#d35400; text-align:center;">⚠️ Aucune coordonnée pour ${nomSimplifie}.</p>`);
        return;
    }

    const groupePoints = L.featureGroup().addTo(carte);
    let validPoints = 0;

    coordonnees.forEach(pt => {
        if (typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            L.circleMarker([pt[0], pt[1]], {
                radius: 7,
                fillColor: "#ff0000", // ROUGE VIF pour bien les voir
                color: "#900000",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).addTo(groupePoints);
            validPoints++;
        }
    });

    if (validPoints > 0) {
        // Validation visuelle !
        containerCarte.insertAdjacentHTML('afterend', `<p style="color:green; text-align:center; margin-top:5px;">✅ <b>${validPoints}</b> observations affichées.</p>`);
        // Recadrage automatique sur les points
        carte.fitBounds(groupePoints.getBounds(), { padding: [20, 20], maxZoom: 14 });
    }
}

// Dichotomous Key Logic
function renderDKey(pageId, coupletId, isBack = false) {
    const page = dkey_data[pageId];
    const container = document.getElementById('dkey-content');
    
    if (!page) {
        container.innerHTML = '<p class="error">Data for this page is not available offline.</p>';
        return;
    }
    
    let cId = coupletId;
    if (!cId && page.couplets) {
        cId = Object.keys(page.couplets)[0];
    }
    
    const couplet = page.couplets[cId];
    if (!couplet) {
        container.innerHTML = '<p class="error">Couplet not found.</p>';
        return;
    }

    if (!isBack) {
        dkeyHistory.push({pageId, coupletId: cId});
    }

    document.getElementById('dkey-title').textContent = page.title;
    
    const backBtn = document.getElementById('btn-dkey-back');
    if (dkeyHistory.length > 1) {
        backBtn.style.display = 'inline-block';
        backBtn.onclick = () => {
            dkeyHistory.pop(); // remove current
            const prev = dkeyHistory[dkeyHistory.length - 1];
            renderDKey(prev.pageId, prev.coupletId, true);
        };
    } else {
        backBtn.style.display = 'none';
    }

    let html = '<div class="couplet-list">';
    couplet.forEach(lead => {
        let btnHtml = '';
        let spmStar = '';
        
        if (lead.dest_type === 'species') {
            const sciName = lead.dest;
            const taxonInfo = all_taxa[sciName];
            if (taxonInfo && taxonInfo.is_spm) {
                spmStar = '<span class="star" title="SPM">★</span> ';
            }
            btnHtml = `<button class="btn-primary" onclick="lookupAndOpenModal('${lead.dest}')">${lead.dest_label}</button>`;
        } else if (lead.dest_type === 'page') {
            btnHtml = `<button class="btn-primary" onclick="renderDKey('${lead.dest}', null)">${lead.dest_label}</button>`;
        } else if (lead.dest_type === 'couplet') {
            btnHtml = `<button class="btn-primary" onclick="renderDKey('${pageId}', '${lead.dest}')">${lead.dest_label || 'Choose'}</button>`;
        } else {
            btnHtml = `<span class="dead-end">End</span>`;
        }

        html += `
            <div class="lead-card">
                <div class="lead-text">
                    <strong>${lead.letter}</strong> ${spmStar}${lead.text}
                </div>
                <div class="lead-action">
                    ${btnHtml}
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

function lookupAndOpenModal(scientificName) {
    const taxon = all_taxa[scientificName];
    if (taxon) {
        openModal(taxon);
    } else {
        alert("Species details not available offline: " + scientificName);
    }
}
