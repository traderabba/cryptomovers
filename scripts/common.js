// common.js
// Handles: Mobile Menu, Snapshots, and shared UI logic

document.addEventListener('DOMContentLoaded', setupMenu);

function setupMenu() {
    const hamburger = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if(hamburger && navMenu) {
        // Remove old listeners if any to prevent duplicates
        const newHamburger = hamburger.cloneNode(true);
        hamburger.parentNode.replaceChild(newHamburger, hamburger);
        
        newHamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            newHamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if(navMenu.classList.contains('active') && !navMenu.contains(e.target) && !newHamburger.contains(e.target)) {
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

// Global Modal Closer (Close when clicking outside)
window.onclick = function(event) {
    const modal = document.getElementById('coin-modal');
    if (event.target === modal) {
        modal.classList.remove('active');
    }
};

function closeModal() {
    document.getElementById('coin-modal').classList.remove('active');
}

async function captureSection(type) {
    const btn = document.getElementById(type === 'gainers' ? 'btn-gain' : 'btn-lose');
    const originalText = btn.innerHTML;
    const sourceListId = type === 'gainers' ? 'gainers-list' : 'losers-list';
    
    // Safety check: ensure list exists
    const listElement = document.getElementById(sourceListId);
    if (!listElement) return;

    const count = listElement.children.length;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating HD...';
    btn.disabled = true;

    try {
        const reportCard = document.createElement('div');
        Object.assign(reportCard.style, {
            position: 'absolute', left: '-9999px', top: '0',
            width: '1200px', padding: '60px', borderRadius: '30px',
            fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: type === 'gainers' ? '#f0fdf4' : '#fef2f2'
        });

        const titleIcon = type === 'gainers' ? '🔥' : '💀';
        const titleText = type === 'gainers' ? `Top ${count} Gainers (24H)` : `Top ${count} Losers (24H)`;
        const titleColor = type === 'gainers' ? '#15803d' : '#b91c1c';

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
            if (type === 'gainers') clone.classList.add('force-gainer');
            else clone.classList.add('force-loser');
            Object.assign(clone.style, { width: '100%', height: '180px', margin: '0', boxShadow: '0 15px 30px rgba(0,0,0,0.08)' });
            const img = clone.querySelector('img');
            Object.assign(img.style, { width: '64px', height: '64px', marginBottom: '12px' });
            const symbol = clone.querySelector('.symbol');
            symbol.style.fontSize = '22px';
            const percent = clone.querySelector('.percent');
            percent.style.fontSize = '20px';
            gridContainer.appendChild(clone);
        });

        reportCard.appendChild(gridContainer);
        reportCard.insertAdjacentHTML('beforeend', `
            <div style="font-size: 18px; color: #64748b; font-weight: 600; margin-top: 30px; display:flex; align-items:center; gap:10px;">
                <img src="/images/bullish.png" style="width:30px;">
         Generated on https://cryptomovers.pages.dev | by @TraderAbba
            </div>
        `);

        document.body.appendChild(reportCard);
        // Using scale
        const canvas = await html2canvas(reportCard, { scale: 3, useCORS: true, backgroundColor: null });
        const link = document.createElement('a');
        link.download = `CTDGL_${type}_Top${count}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        document.body.removeChild(reportCard);
    } catch (err) {
        console.error("Snapshot failed:", err);
        alert("Failed to create report.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
