let globalMarketData = null;
let globalDexData = null;
let currentNetwork = 'all';

async function init() {
    setupMenu();
    // DETECT PAGE
    const isDexPage = window.location.pathname.includes('dex-movers');
    
    if (isDexPage) {
        await initDex();
    } else {
        await initCex();
    }
}

// === CEX ENGINE (Home Page) ===
async function initCex() {
    if (!document.getElementById('gainers-list')) return;
    const loader = document.getElementById('loader');

    try {
        const response = await fetch('/api/stats?t=' + Date.now());
        if (!response.ok) throw new Error("Server Error");
        const data = await response.json();
        if (data.error) throw new Error(data.message);

        globalMarketData = data;
        updateDisplay(20);
    } catch (e) {
        console.error("CEX Init Error:", e);
        if(loader) loader.innerHTML = `<button onclick="location.reload()" class="btn">Retry</button>`;
    }
}

// === DEX ENGINE (DEX Page) ===
async function initDex() {
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex';

    try {
        const response = await fetch('/api/dex-stats?t=' + Date.now());
        if (!response.ok) throw new Error("DEX API Error");
        const data = await response.json();
        
        globalDexData = data;
        updateDexDisplay('all', 20); // Default view
        
        if (data.timestamp) {
            const timeEl = document.getElementById('timestamp');
            if (timeEl) timeEl.innerText = "Last Updated: " + new Date(data.timestamp).toLocaleTimeString();
        }
        if(loader) loader.style.display = 'none';

    } catch (e) {
        console.error("DEX Init Error:", e);
        if(loader) loader.innerHTML = `<button onclick="location.reload()" class="btn">Retry</button>`;
    }
}

function handleNetworkChange(network) {
    currentNetwork = network;
    const limit = document.getElementById('sort-select').value;
    updateDexDisplay(network, parseInt(limit));
}

// === UNIFIED BUBBLE CREATOR ===
// This ensures Snapshots look 100% correct by reusing index.html structure
function createBubbleHTML(c, colorClass, isDex) {
    const safeCoin = {
        name: c.name,
        symbol: c.symbol,
        image: c.image || '/images/bullish.png',
        current_price: parseFloat(c.current_price || c.price),
        market_cap: c.market_cap || c.liquidity, 
        total_volume: c.total_volume || c.volume_24h,
        price_change_percentage_24h: c.price_change_percentage_24h || c.price_change_24h,
        id: c.id, 
        network: c.network,
        address: c.address,
        isDex: isDex
    };
    const coinData = JSON.stringify(safeCoin).replace(/"/g, '&quot;');
    
    // Inject Network Tag inside Symbol to avoid layout breaking
    let symbolHtml = c.symbol;
    if (isDex) {
        symbolHtml += ` <small style="font-size:0.6em; opacity:0.6;">${c.network.toUpperCase()}</small>`;
    }

    return `
    <div class="bubble" onclick="openModal(${coinData})">
        <img src="${c.image}" onerror="this.src='/images/${isDex ? 'bullish' : 'error'}.png'">
        <div class="symbol">${symbolHtml}</div>
        <div class="percent ${colorClass}">${safeCoin.price_change_percentage_24h.toFixed(2)}%</div>
    </div>`;
}

function updateDexDisplay(network, limit) {
    if (!globalDexData || !globalDexData[network]) return;
    const data = globalDexData[network];
    
    // Update Labels
    const label = network === 'all' ? '(Global)' : `(${network.toUpperCase()})`;
    const gLabel = document.getElementById('gainers-network-label');
    const lLabel = document.getElementById('losers-network-label');
    if(gLabel) gLabel.innerText = label;
    if(lLabel) lLabel.innerText = label;

    const render = (list, targetId, colorClass) => {
        const html = list.slice(0, limit).map(c => createBubbleHTML(c, colorClass, true)).join('');
        document.getElementById(targetId).innerHTML = html;
    };
    render(data.gainers, 'gainers-list', 'gainer-percent');
    render(data.losers, 'losers-list', 'loser-percent');
}

function updateDisplay(limit) {
    if (!globalMarketData) return;
    const render = (list, targetId, colorClass) => {
        const html = list.slice(0, limit).map(c => createBubbleHTML(c, colorClass, false)).join('');
        document.getElementById(targetId).innerHTML = html;
    };
    render(globalMarketData.gainers, 'gainers-list', 'gainer-percent');
    render(globalMarketData.losers, 'losers-list', 'loser-percent');
    
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
}

function handleSortChange(limit) {
    if (window.location.pathname.includes('dex-movers')) {
        updateDexDisplay(currentNetwork, parseInt(limit));
    } else {
        updateDisplay(parseInt(limit));
    }
}

function setupMenu() {
    const hamburger = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    if(hamburger && navMenu) {
        hamburger.onclick = () => { hamburger.classList.toggle('active'); navMenu.classList.toggle('active'); }
    }
}

// === SNAPSHOT LOGIC ===
async function captureSection(type) {
    const btn = document.getElementById(type === 'gainers' ? 'btn-gain' : 'btn-lose');
    const originalText = btn.innerHTML;
    
    const isDex = window.location.pathname.includes('dex-movers');
    const netText = isDex ? (currentNetwork === 'all' ? 'Global DEX' : currentNetwork.toUpperCase()) : 'Crypto';
    
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
        const titleText = `${netText} Top ${type === 'gainers' ? 'Gainers' : 'Losers'} (24H)`;
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

        const sourceListId = type === 'gainers' ? 'gainers-list' : 'losers-list';
        const originalContainer = document.getElementById(sourceListId);
        const bubbles = originalContainer.querySelectorAll('.bubble');

        bubbles.forEach(b => {
            const clone = b.cloneNode(true);
            if (type === 'gainers') clone.classList.add('force-gainer');
            else clone.classList.add('force-loser');
            
            // Standardize Layout for Image
            Object.assign(clone.style, { width: '100%', height: '180px', margin: '0', boxShadow: '0 15px 30px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center' });
            clone.querySelector('img').style.width = '64px';
            clone.querySelector('img').style.height = '64px';
            clone.querySelector('img').style.marginBottom = '12px';
            clone.querySelector('.symbol').style.fontSize = '22px';
            clone.querySelector('.percent').style.fontSize = '20px';
            gridContainer.appendChild(clone);
        });

        reportCard.appendChild(gridContainer);
        reportCard.insertAdjacentHTML('beforeend', `
            <div style="font-size: 18px; color: #64748b; font-weight: 600; margin-top: 30px; display:flex; align-items:center; gap:10px;">
                <img src="/images/bullish.png" style="width:30px;">
                Generated on cryptomovers.pages.dev
            </div>
        `);

        document.body.appendChild(reportCard);
        await new Promise(r => setTimeout(r, 100)); // Render wait
        const canvas = await html2canvas(reportCard, { scale: 2.5, useCORS: true, backgroundColor: null });
        
        const link = document.createElement('a');
        link.download = `Movers_${netText}_${type}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        document.body.removeChild(reportCard);

    } catch (err) {
        console.error("Snapshot Error:", err);
        alert("Snapshot failed.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// === SMART MODAL ===
function openModal(coin) {
    const modal = document.getElementById('coin-modal');
    if(!modal) return;

    document.getElementById('m-img').src = coin.image || '/images/bullish.png';
    document.getElementById('m-name').innerText = coin.name;
    document.getElementById('m-symbol').innerText = coin.symbol.toUpperCase();
    
    let price = coin.current_price < 0.01 ? '$' + coin.current_price.toFixed(8) : '$' + coin.current_price.toLocaleString();
    document.getElementById('m-price').innerText = price;

    const formatMoney = (num) => num ? '$' + num.toLocaleString() : 'N/A';
    document.getElementById('m-cap').innerText = formatMoney(coin.market_cap);
    document.getElementById('m-vol').innerText = formatMoney(coin.total_volume);

    const historySection = document.querySelector('.modal-history');
    const cgBtn = document.getElementById('m-link-cg');
    const tvBtn = document.getElementById('m-link-tv');

    if (coin.isDex) {
        // DEX MODE
        document.querySelector('.stat-box .label').innerText = "Liquidity";
        historySection.innerHTML = `
            <h3>Pool Performance</h3>
            <div class="history-row"><span>24h Change</span> <span class="percent-tag ${coin.price_change_percentage_24h >= 0 ? 'green':'red'}">${coin.price_change_percentage_24h.toFixed(2)}%</span></div>
            <div class="history-row"><span>Network</span> <span class="percent-tag gray">${coin.network.toUpperCase()}</span></div>`;
        
        cgBtn.href = `https://www.geckoterminal.com/${coin.network}/pools/${coin.address}`;
        cgBtn.innerHTML = '<i class="fas fa-circle-nodes"></i> GeckoTerminal';
        if(tvBtn) tvBtn.style.display = 'none';

    } else {
        // CEX MODE
        document.querySelector('.stat-box .label').innerText = "Market Cap";
        historySection.innerHTML = `
            <h3>Price Performance</h3>
            <div class="history-row"><span>24h</span> <span id="m-24h" class="percent-tag"></span></div>
            <div class="history-row"><span>7d</span> <span id="m-7d" class="percent-tag"></span></div>
            <div class="history-row"><span>30d</span> <span id="m-30d" class="percent-tag"></span></div>`;
        
        // Populate specific CEX fields
        const setPercent = (id, val) => {
            const el = document.getElementById(id);
            if(el && val !== undefined) {
                el.innerText = val.toFixed(2) + "%";
                el.className = `percent-tag ${val >= 0 ? 'green' : 'red'}`;
            }
        };
        setPercent('m-24h', coin.price_change_percentage_24h);
        setPercent('m-7d', coin.price_change_percentage_7d); // Ensure your CEX data passes this field
        setPercent('m-30d', coin.price_change_percentage_30d);

        cgBtn.href = `https://www.coingecko.com/en/coins/${coin.id}`;
        cgBtn.innerHTML = '<i class="fas fa-coins"></i> CoinGecko';
        if(tvBtn) { tvBtn.style.display = 'flex'; tvBtn.href = `https://www.tradingview.com/symbols/${coin.symbol.toUpperCase()}USD/?exchange=CRYPTO`; }
    }
    modal.classList.add('active');
}

const modalEl = document.getElementById('coin-modal');
if(modalEl) modalEl.addEventListener('click', (e) => { if (e.target === modalEl) document.getElementById('coin-modal').classList.remove('active'); });
window.addEventListener('DOMContentLoaded', init);