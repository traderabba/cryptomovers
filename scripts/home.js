// scripts/home.js
// Integrated Logic: Spot (CoinGecko) + DEX (GeckoTerminal)
// Features: Toggle, Snapshots, Proxies, 100x Formatting, Stale Indicators

let currentMode = 'spot'; // 'spot' | 'dex'
let currentNetwork = 'solana';
let currentLimit = 20;

// Data Cache (To prevent reloading when toggling)
let marketData = { spot: null, dex: null };

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    // Default to Spot Mode on load
    switchMode('spot');
});

// === 1. FREEZE GIF LOGIC (From dex-movers.js) ===
window.freezeGif = function(img) {
    if (img.dataset.frozen) return;
    
    // Check if it's a GIF
    const originalUrl = decodeURIComponent(img.src).split('url=')[1] || img.src;
    if (!originalUrl.match(/\.gif($|\?)/i)) return; 

    try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 40; 
        c.height = img.naturalHeight || 40;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        img.src = c.toDataURL('image/png');
        img.dataset.frozen = "true";
    } catch (e) {
        console.warn("Could not freeze GIF:", e);
    }
};

// === 2. SWITCH MODE LOGIC (The Toggle) ===
window.switchMode = function(mode) {
    currentMode = mode;

    // UI Updates
    document.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');

    // Show/Hide Network Selector
    const dexControls = document.getElementById('dex-controls');
    if (dexControls) {
        dexControls.style.display = mode === 'dex' ? 'block' : 'none';
    }

    // Reset List UI with Spinner
    const loaderHTML = '<div class="spinner" style="margin:50px auto; width:30px; height:30px; border-width:3px;"></div>';
    document.getElementById('gainers-list').innerHTML = loaderHTML;
    document.getElementById('losers-list').innerHTML = loaderHTML;

    // Fetch Data
    if (mode === 'spot') {
        fetchSpotData();
    } else {
        // Get current selected network
        const select = document.getElementById('network-select');
        if (select) currentNetwork = select.value;
        fetchDexData(currentNetwork);
    }
}

// === 3. SPOT FETCHER (From home.js) ===
async function fetchSpotData() {
    updateStatus("Scanning Spot Market...");

    // Use cache if fresh (< 2 mins)
    if (marketData.spot && (Date.now() - marketData.spot.timestamp < 120000)) {
        renderDisplay(marketData.spot, 'spot');
        updateTimestamp(marketData.spot.timestamp, 'Spot Market');
        return;
    }

    try {
        const response = await fetch('/api/stats?t=' + Date.now());
        if (!response.ok) throw new Error(`Server Error (${response.status})`);

        const data = await response.json();
        if (data.error) throw new Error(data.message);

        marketData.spot = data;
        renderDisplay(data, 'spot');
        updateTimestamp(data.timestamp, 'Spot Market');

    } catch (e) {
        handleError(e, () => fetchSpotData());
    }
}

// === 4. DEX FETCHER (From dex-movers.js) ===
window.fetchDexData = async function(network) {
    currentNetwork = network;
    updateStatus(`Scanning ${network.toUpperCase()} Chain...`);

    try {
        const response = await fetch(`/api/stats?network=${network}&t=${Date.now()}`);
        if (!response.ok) throw new Error(`Server Error (${response.status})`);

        const data = await response.json();
        if (data.error) throw new Error(data.message);

        marketData.dex = data;
        renderDisplay(data, 'dex');
        updateTimestamp(data.timestamp, `${network.toUpperCase()} Chain`);

    } catch (e) {
        handleError(e, () => fetchDexData(network));
    }
}

// === 5. UNIFIED RENDERER ===
function renderDisplay(data, type) {
    document.getElementById('status-msg').style.display = 'none';

    // Slice based on current limit
    const gainers = data.gainers.slice(0, currentLimit);
    const losers = data.losers.slice(0, currentLimit);

    const gContainer = document.getElementById('gainers-list');
    const lContainer = document.getElementById('losers-list');

    // Helper: 100x Formatting (Restored from dex-movers.js)
    const formatPercent = (val) => {
        if (type === 'dex' && Math.abs(val) > 100) return (val / 100).toFixed(1) + 'x';
        return val.toFixed(2) + '%';
    };

    const renderList = (items, isGainer) => {
        if (!items || items.length === 0) {
            return `<div style="width:100%; text-align:center; color:#94a3b8; padding:30px;">No Data Found</div>`;
        }

        return items.map((item, index) => {
            // DATA MAPPING
            const symbol = item.symbol.toUpperCase();
            const change = type === 'spot' ? item.price_change_percentage_24h : item.change_24h;
            
            // IMAGE HANDLING
            let image = item.image || '/images/bullish.png';
            let imgAttrs = '';

            // If DEX, apply Proxy + FreezeGif
            if (type === 'dex' && image.startsWith('http')) {
                image = `/api/image-proxy?url=${encodeURIComponent(item.image)}`;
                imgAttrs = 'onload="window.freezeGif(this)"';
            }

            const loadType = index < 12 ? "eager" : "lazy";
            const safeItem = JSON.stringify(item).replace(/"/g, '&quot;');

            return `
            <div class="bubble" onclick="openDetails(${safeItem}, '${type}')">
                <img src="${image}" 
                     width="40" height="40" 
                     loading="${loadType}"
                     crossorigin="anonymous"
                     alt="${symbol}"
                     onerror="this.src='/images/bullish.png'"
                     ${imgAttrs}>
                <div class="symbol">${symbol}</div>
                <div class="percent ${isGainer ? 'gainer-percent' : 'loser-percent'}">
                    ${change > 0 ? '+' : ''}${formatPercent(change)}
                </div>
            </div>`;
        }).join('');
    };

    gContainer.innerHTML = renderList(gainers, true);
    lContainer.innerHTML = renderList(losers, false);
}

// === 6. UNIFIED MODAL LOGIC ===
window.openDetails = function(item, type) {
    const modal = document.getElementById('coin-modal');
    if (!modal) return;

    // Basic Info
    setText('m-name', item.name);
    setText('m-symbol', item.symbol.toUpperCase());

    // Modal Image
    const imgEl = document.getElementById('m-img');
    let imgUrl = item.image || '/images/bullish.png';
    if (type === 'dex' && imgUrl.startsWith('http')) {
        imgUrl = `/api/image-proxy?url=${encodeURIComponent(item.image)}`;
        imgEl.onload = function() { window.freezeGif(this); };
    } else {
        imgEl.onload = null;
    }
    imgEl.src = imgUrl;

    // Price
    const price = type === 'spot' ? item.current_price : item.price;
    setText('m-price', formatPrice(price));

    // Stats (Cap/Vol)
    const cap = type === 'spot' ? item.market_cap : item.fdv;
    setText('m-cap', formatCurrency(cap));
    
    const vol = type === 'spot' ? item.total_volume : item.volume_24h;
    setText('m-vol', formatCurrency(vol));

    // Timeframes & Links
    if (type === 'spot') {
        // Show Spot Rows, Hide DEX
        setDisplay(['row-7d', 'row-30d', 'row-1y'], 'flex');
        setDisplay(['row-30m', 'row-1h', 'row-6h'], 'none');
        
        setPercent('m-24h', item.price_change_percentage_24h);
        setPercent('m-7d', item.price_change_percentage_7d);
        setPercent('m-30d', item.price_change_percentage_30d);
        setPercent('m-1y', item.price_change_percentage_1y);

        setDisplay(['m-link-cg', 'm-link-tv'], 'flex');
        setDisplay(['m-link-pool'], 'none');
        
        document.getElementById('m-link-cg').href = `https://www.coingecko.com/en/coins/${item.id}`;
        document.getElementById('m-link-tv').href = `https://www.tradingview.com/chart/?symbol=${item.symbol.toUpperCase()}USD`;
    } else {
        // Show DEX Rows, Hide Spot
        setDisplay(['row-30m', 'row-1h', 'row-6h'], 'flex');
        setDisplay(['row-7d', 'row-30d', 'row-1y'], 'none');

        setPercent('m-30m', item.change_30m);
        setPercent('m-1h', item.change_1h);
        setPercent('m-6h', item.change_6h);
        setPercent('m-24h', item.change_24h);

        setDisplay(['m-link-cg', 'm-link-tv'], 'none');
        setDisplay(['m-link-pool'], 'flex');

        const netSlug = currentNetwork === 'ethereum' ? 'eth' : 
                        currentNetwork === 'bnb' ? 'bsc' : currentNetwork;
        document.getElementById('m-link-pool').href = `https://www.geckoterminal.com/${netSlug}/pools/${item.address}`;
    }

    modal.classList.add('active');
}

// === HELPERS ===

window.handleSortChange = function(limit) {
    currentLimit = parseInt(limit);
    if (currentMode === 'spot' && marketData.spot) renderDisplay(marketData.spot, 'spot');
    else if (currentMode === 'dex' && marketData.dex) renderDisplay(marketData.dex, 'dex');
}

function updateStatus(msg) {
    const el = document.getElementById('status-msg');
    if (el) { el.innerText = msg; el.style.display = 'block'; }
}

function updateTimestamp(ts, source) {
    const el = document.getElementById('timestamp');
    if (el) {
        // Restored "Live" vs "Cached" Indicator logic
        const date = new Date(ts);
        const age = Date.now() - ts;
        // 5 minutes threshold for stale data
        const isStale = age > 5 * 60 * 1000; 
        const statusColor = isStale ? '#f59e0b' : '#10b981'; // Orange vs Green
        const statusText = isStale ? 'Cached' : 'Live';

        el.innerHTML = `
            <span style="color:${statusColor}">● ${statusText}</span> &nbsp;|&nbsp; 
            Source: <strong>${source}</strong> &nbsp;|&nbsp; 
            Updated: ${date.toLocaleTimeString()}
        `;
    }
}

// Restored Error UI with Retry Button
function handleError(e, retryCallback) {
    console.error(e);
    
    // Assign callback to window so button can call it
    window.lastRetryAction = retryCallback;

    const errHTML = `
        <div style="text-align:center; padding:30px;">
            <i class="fas fa-exclamation-triangle" style="font-size:40px; color:#ef4444; margin-bottom:15px;"></i>
            <h3 style="margin-bottom:15px; font-size:18px;">Data Source Issue</h3>
            <p style="color:#64748b; margin-bottom:20px;">${e.message}</p>
            <button onclick="window.lastRetryAction()" class="btn" style="background:var(--dark); color:white; border:none; padding:10px 20px; border-radius:12px; cursor:pointer;">
                Try Again
            </button>
        </div>`;

    document.getElementById('gainers-list').innerHTML = errHTML;
    document.getElementById('losers-list').innerHTML = errHTML;
}

function formatPrice(num) {
    if (!num) return '$0.00';
    if (num < 0.01) return '$' + num.toFixed(8);
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(num) {
    if (!num) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toLocaleString();
}

function setPercent(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    if (val === undefined || val === null) {
        el.innerText = '-';
        el.className = 'percent-tag gray';
    } else {
        el.innerText = (val > 0 ? '+' : '') + val.toFixed(2) + '%';
        // Remove old classes
        el.classList.remove('green', 'red', 'gray');
        el.classList.add(val >= 0 ? 'green' : 'red');
    }
}

function setText(id, txt) {
    const el = document.getElementById(id);
    if(el) el.innerText = txt || '-';
}

function setDisplay(ids, value) {
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = value;
    });
}