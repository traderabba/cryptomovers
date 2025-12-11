// dex.js
// Logic for Dex Movers Page (Powered by Cloudflare Worker + CoinMarketCap)

// !!! REPLACE WITH YOUR WORKER URL !!!
const WORKER_URL = "https://your-worker-name.your-subdomain.workers.dev/dex-movers"; 

document.addEventListener('DOMContentLoaded', initDex);

async function initDex() {
    const container = document.getElementById('gainers-list');
    const loader = document.getElementById('loader');
    const statusMsg = document.getElementById('status-msg');

    if(!container) return; // Not on dex page

    try {
        const response = await fetch(WORKER_URL);
        
        if (!response.ok) {
            throw new Error(`Worker Error (${response.status})`);
        }

        const data = await response.json();
        
        if (data.error) throw new Error(data.error);

        // Render Bubbles
        // We map the CMC data to match your CSS classes (.bubble, .symbol, .percent)
        // so that the captureSection function in common.js still works perfectly.
        container.innerHTML = data.map(token => {
            // Encode data for the modal
            const safeToken = JSON.stringify(token).replace(/"/g, '&quot;');
            
            return `
            <div class="bubble" onclick="openDexModal(${safeToken})">
                <img src="${token.icon}" crossorigin="anonymous" onerror="this.src='/images/bullish.png'">
                <div class="symbol">${token.symbol}</div>
                <div class="percent gainer-percent">${token.change_24h.includes('+') ? token.change_24h : '+' + token.change_24h}</div>
            </div>`;
        }).join('');

        // UI Updates
        if(loader) loader.style.display = 'none';
        if(statusMsg) statusMsg.innerText = `🟢 Showing Top ${data.length} Gainers`;
        
        const timeEl = document.getElementById('timestamp');
        if(timeEl) timeEl.innerText = "Last Updated: " + new Date().toLocaleTimeString();

    } catch (e) {
        console.error("Dex Init Error:", e);
        if (loader) {
            loader.innerHTML = `
                <div style="text-align:center; padding:20px;">
                    <h3 style="color:#ef4444">⚠️ Connection Failed</h3>
                    <p style="color:#64748b; margin:10px 0;">${e.message}</p>
                    <button onclick="location.reload()" style="padding:10px 20px; background:#3b82f6; color:white; border:none; border-radius:8px;">Retry</button>
                </div>`;
        }
    }
}

// Custom Modal for DEX/CMC Data
function openDexModal(token) {
    const modal = document.getElementById('coin-modal');
    if(!modal) return;

    // Populate standard fields
    const img = document.getElementById('m-img');
    if(img) img.src = token.icon;

    document.getElementById('m-name').innerText = token.name;
    document.getElementById('m-symbol').innerText = token.symbol;
    document.getElementById('m-price').innerText = "$" + token.price;

    // Setup Link Button
    const linkBtn = document.getElementById('m-link-cmc');
    if(linkBtn) {
        linkBtn.href = token.cmc_link;
        linkBtn.style.display = 'flex';
    }

    modal.classList.add('active');
          }
