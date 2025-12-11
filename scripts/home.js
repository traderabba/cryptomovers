// home.js
// Logic for Index.html (CEX Data)

let globalMarketData = null;

// Auto-start when page loads
document.addEventListener('DOMContentLoaded', initHome);

async function initHome() {
    // Only run if we are on the home page
    if (!document.getElementById('gainers-list')) return;

    const loader = document.getElementById('loader');
    
    try {
        const response = await fetch('/api/stats?t=' + Date.now());
        
        if (!response.ok) {
            let errorText = `Server Error (${response.status})`;
            try {
                const errJson = await response.json();
                if (errJson.message) errorText = errJson.message;
            } catch (e) {}
            throw new Error(errorText);
        }

        const text = await response.text();
        if (text.trim().startsWith('<')) throw new Error("Server Timeout. Please Reload.");
        
        const data = JSON.parse(text);
        if (data.error) throw new Error(data.message);

        globalMarketData = data;
        updateDisplay(20);

    } catch (e) {
        console.error("Init Error:", e);
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

function handleSortChange(limit) {
    updateDisplay(parseInt(limit));
}

function updateDisplay(limit) {
    if (!globalMarketData) return;

    const maxAvailable = globalMarketData.gainers.length;
    const safeLimit = Math.min(limit, maxAvailable);
    
    const gainersToShow = globalMarketData.gainers.slice(0, safeLimit);
    const losersToShow = globalMarketData.losers.slice(0, safeLimit);

    const createBubble = (c, colorClass) => `
        <div class="bubble">
            <img src="${c.image}" crossorigin="anonymous" alt="${c.symbol}" onerror="this.src='/images/error.png'">
            <div class="symbol">${c.symbol}</div>
            <div class="percent ${colorClass}">${c.price_change_percentage_24h.toFixed(2)}%</div>
        </div>`;

    document.getElementById('gainers-list').innerHTML = gainersToShow.map(c => createBubble(c, 'gainer-percent')).join('');
    document.getElementById('losers-list').innerHTML = losersToShow.map(c => createBubble(c, 'loser-percent')).join('');

    if (globalMarketData.timestamp) {
        const date = new Date(globalMarketData.timestamp);
        const timeEl = document.getElementById('timestamp');
        if (timeEl) timeEl.innerText = "Last Updated: " + date.toLocaleTimeString();
    }
    
    const statusMsg = document.getElementById('status-msg');
    if(statusMsg) {
        if (safeLimit < limit) statusMsg.innerText = `⚠️ Only found ${safeLimit} coins (Deep scan running...)`;
        else statusMsg.innerText = `🟢 Showing Top ${limit}`;
    }
    
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
      }
