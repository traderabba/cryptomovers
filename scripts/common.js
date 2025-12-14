// scripts/common.js
// Universal UI Logic (Smart Title + Original Common.js Styling)

document.addEventListener('DOMContentLoaded', () => {
    setupMenu();
    setupModalClosers();
});

// === 1. MENU LOGIC ===
function setupMenu() {
    const hamburger = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (hamburger && navMenu) {
        const newHamburger = hamburger.cloneNode(true);
        hamburger.parentNode.replaceChild(newHamburger, hamburger);

        newHamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            newHamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (navMenu.classList.contains('active') && 
                !navMenu.contains(e.target) && 
                !newHamburger.contains(e.target)) {
                newHamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });

        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                newHamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }
}

// === 2. MODAL LOGIC ===
function setupModalClosers() {
    const modal = document.getElementById('coin-modal');
    const closeBtn = document.querySelector('.close-modal'); 

    if (closeBtn) {
        closeBtn.onclick = function() { closeModal(); };
    }

    if (modal) {
        window.onclick = function(event) {
            if (event.target === modal) closeModal();
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    }
}

function closeModal() {
    const modal = document.getElementById('coin-modal');
    if(modal) modal.classList.remove('active');
}

// === 3. SNAPSHOT LOGIC (Smart Title + Common.js Styling) ===
async function captureSection(type) {
    if (typeof html2canvas === 'undefined') {
        alert("Error: html2canvas library missing. Please reload.");
        return;
    }

    const btn = document.getElementById(type === 'gainers' ? 'btn-gain' : 'btn-lose');
    if (!btn) return;

    const originalText = btn.innerHTML;
    const sourceListId = type === 'gainers' ? 'gainers-list' : 'losers-list';
    const listElement = document.getElementById(sourceListId);
    
    if (!listElement || listElement.children.length === 0) {
        alert("No data to snapshot!");
        return;
    }

    const count = listElement.children.length;

    // --- SMART TITLE DETECTION ---
    let pageLabel = 'Crypto'; 
    const dexBtn = document.getElementById('btn-dex');
    
    // Check Active Toggle
    if (dexBtn && dexBtn.classList.contains('active')) {
        const netSelect = document.getElementById('network-select');
        if (netSelect) {
            const val = netSelect.value;
            pageLabel = val.charAt(0).toUpperCase() + val.slice(1); // e.g. "Solana"
        } else {
            pageLabel = 'DEX';
        }
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating HD...';
    btn.disabled = true;

    try {
        const reportCard = document.createElement('div');
        
        // STYLE: Matches common.js exactly
        Object.assign(reportCard.style, {
            position: 'absolute', left: '-9999px', top: '0',
            width: '1200px', padding: '60px', borderRadius: '30px',
            fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: type === 'gainers' ? '#f0fdf4' : '#fef2f2'
        });

        const titleIcon = type === 'gainers' ? '🔥' : '💀';
        const titleText = `${pageLabel} Top ${count} ${type === 'gainers' ? 'Gainers' : 'Losers'} (24H)`;
        const titleColor = type === 'gainers' ? '#15803d' : '#b91c1c';

        // HEADER: Font Size 48px (Restored from common.js)
        reportCard.innerHTML = `
            <div style="text-align: center; margin-bottom: 50px;">
                <h1 style="font-size: 48px; color: #0f172a; margin: 0; font-weight: 800; letter-spacing: -1px;">
                    ${titleIcon} ${titleText}
                </h1>
                <div style="width: 100px; height: 6px; background: ${titleColor}; margin: 20px auto 0; border-radius: 10px;"></div>
            </div>
        `;

        const gridContainer = document.createElement('div');
        Object.assign(gridContainer.style, {
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '35px', width: '100%', marginBottom: '40px'
        });

        const bubbles = listElement.querySelectorAll('.bubble');

        bubbles.forEach(b => {
            const clone = b.cloneNode(true);
            clone.removeAttribute('onclick'); 

            // BUBBLE: Restored common.js styling
            Object.assign(clone.style, { 
                width: '100%', height: '180px', margin: '0', 
                boxShadow: '0 15px 30px rgba(0,0,0,0.08)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                // Note: common.js didn't force borders/bg here, it let the class 'force-gainer' handle it below
            });

            if (type === 'gainers') {
                clone.classList.add('force-gainer'); 
                // Explicitly set for snapshot safety
                clone.style.backgroundColor = '#ecfdf5'; 
                clone.style.borderColor = '#6ee7b7';
                clone.style.borderWidth = '3px';
                clone.style.borderStyle = 'solid';
            } else {
                clone.classList.add('force-loser');
                clone.style.backgroundColor = '#fef2f2';
                clone.style.borderColor = '#fca5a5';
                clone.style.borderWidth = '3px';
                clone.style.borderStyle = 'solid';
            }
            
            // IMAGE: 64px (Restored from common.js)
            const img = clone.querySelector('img');
            if (img) {
                if(img.src.startsWith('http')) img.crossOrigin = "anonymous";
                Object.assign(img.style, { width: '64px', height: '64px', marginBottom: '12px' });
            }
            
            // TEXT: 22px & 20px (Restored from common.js)
            const symbol = clone.querySelector('.symbol');
            if(symbol) symbol.style.fontSize = '22px';
            
            const percent = clone.querySelector('.percent');
            if(percent) percent.style.fontSize = '20px';
            
            gridContainer.appendChild(clone);
        });

        reportCard.appendChild(gridContainer);
        
        // FOOTER: Restored Credit
        reportCard.insertAdjacentHTML('beforeend', `
            <div style="font-size: 18px; color: #64748b; font-weight: 600; margin-top: 30px; display:flex; align-items:center; gap:10px;">
                <img src="/images/bullish.png" style="width:30px;">
                Generated on https://cryptomovers.pages.dev | by @TraderAbba
            </div>
        `);

        document.body.appendChild(reportCard);
        
        await new Promise(r => setTimeout(r, 100));

        // SCALE: 3 (Restored from common.js)
        const canvas = await html2canvas(reportCard, { scale: 3, useCORS: true, backgroundColor: null });
        const link = document.createElement('a');
        link.download = `CTDGL_${pageLabel}_Top${count}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        document.body.removeChild(reportCard);

    } catch (err) {
        console.error("Snapshot failed:", err);
        alert("Snapshot Error. Please try again.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}