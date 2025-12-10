// _worker.js

// ==========================================
// 1. CONFIGURATION
// ==========================================

// --- CEX (Coingecko Main) Config ---
const CACHE_KEY = "market_data_v7"; 
const CACHE_LOCK_KEY = "market_data_lock";
const UPDATE_INTERVAL_MS = 15 * 60 * 1000; 
const SOFT_REFRESH_MS = 12 * 60 * 1000;    
const MIN_RETRY_DELAY_MS = 2 * 60 * 1000;  

// --- DEX (GeckoTerminal) Config ---
const DEX_CACHE_KEY = "dex_stats_v2"; // Bumped to v2 for new filters
const DEX_LOCK_KEY = "dex_stats_lock";
const DEX_SOFT_REFRESH_MS = 5 * 60 * 1000; // 5 Mins (Faster updates for DEX)

// --- Shared Config ---
const TIMEOUT_MS = 45000; 
const LOCK_TIMEOUT_MS = 120000; 

// --- FILTER SETTINGS ---
const STABLECOINS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "PYUSD", "FRAX", "LUSD", "USDD", "WETH", "WBNB", "WSOL", "CBETH"]); // Added Wraps to avoid boring movers
const MIN_LIQUIDITY = 5000; // Ignore pools under $5k
const MIN_VOLUME = 1000;    // Ignore dead pools

const HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
};

const API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*"
};

// ==========================================
// 2. MAIN ROUTER
// ==========================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/sitemap.xml") return handleSitemap(request, env);
        if (url.pathname === "/api/stats") return handleCexStats(env, ctx);
        if (url.pathname === "/api/dex-stats") return handleDexStats(env, ctx);
        
        return env.ASSETS.fetch(request);
    }
};

// ==========================================
// 3. ROUTE HANDLERS
// ==========================================

async function handleSitemap(request, env) {
    // ... (Keep your existing sitemap logic)
    const baseUrl = "https://cryptomovers.pages.dev";
    try {
        const manifestRes = await env.ASSETS.fetch(new URL("/urls.json", request.url));
        if (!manifestRes.ok) return new Response("Error", { status: 500 });
        const pages = await manifestRes.json();
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
        pages.forEach(p => sitemap += `<url><loc>${baseUrl}${p.path}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`);
        sitemap += `</urlset>`;
        return new Response(sitemap, { headers: { "Content-Type": "application/xml" } });
    } catch (e) { return new Response("Error", { status: 500 }); }
}

async function handleCexStats(env, ctx) {
    // ... (Keep your existing CEX logic exactly as before)
    return handleGenericStats(env, ctx, CACHE_KEY, CACHE_LOCK_KEY, SOFT_REFRESH_MS, updateMarketDataSafe);
}

async function handleDexStats(env, ctx) {
    // DEX-specific wrapper
    return handleGenericStats(env, ctx, DEX_CACHE_KEY, DEX_LOCK_KEY, DEX_SOFT_REFRESH_MS, updateDexData);
}

// Generic Handler to reduce code duplication
async function handleGenericStats(env, ctx, key, lockKey, softRefresh, updateFunc) {
    if (!env.KV_STORE) return new Response(JSON.stringify({ error: true }), { status: 500, headers: HEADERS });

    try {
        const [cachedRaw, lock] = await Promise.all([ env.KV_STORE.get(key), env.KV_STORE.get(lockKey) ]);
        
        let cachedData = null;
        if (cachedRaw) try { cachedData = JSON.parse(cachedRaw); } catch(e) {}

        const now = Date.now();
        const dataAge = cachedData ? (now - (cachedData.timestamp || 0)) : 999999999;
        const isUpdating = lock && (now - parseInt(lock)) < LOCK_TIMEOUT_MS;

        // 1. Fresh
        if (cachedData && dataAge < softRefresh) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Fresh" } });
        }
        // 2. Updating
        if (isUpdating && cachedData) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-UpdateInProgress" } });
        }
        // 3. Stale -> Update
        if (cachedData && dataAge >= softRefresh) {
            await env.KV_STORE.put(lockKey, now.toString(), { expirationTtl: 120 });
            ctx.waitUntil(updateFunc(env).finally(() => env.KV_STORE.delete(lockKey).catch(()=>{})));
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Proactive" } });
        }
        // 4. Empty
        await env.KV_STORE.put(lockKey, now.toString(), { expirationTtl: 120 });
        const fresh = await updateFunc(env);
        await env.KV_STORE.delete(lockKey).catch(()=>{});
        return new Response(fresh, { headers: { ...HEADERS, "X-Source": "Live-Fetch" } });

    } catch (e) { return new Response(JSON.stringify({ error: true, msg: e.message }), { status: 500, headers: HEADERS }); }
}

// ==========================================
// 4. DATA ENGINES
// ==========================================

// --- CEX ENGINE (Your Original Logic) ---
async function updateMarketDataSafe(env) {
    // ... Copy your EXACT updateMarketData logic here ...
    // For safety, I'm pasting the critical part. 
    // Just ensure you include the STABLECOINS filter if you want it applied to CEX too, 
    // but usually CEX data is cleaner.
    
    // Placeholder to signal where to put your old code:
    return await updateMarketDataReal(env); 
}

async function updateMarketDataReal(env) {
    // ... [PASTE YOUR PREVIOUS CEX CODE HERE] ...
    // If you need me to paste the whole 100 lines again, let me know. 
    // Assuming you have it from previous chat. 
    
    // Small shim for this example:
    const mockCex = JSON.stringify({ timestamp: Date.now(), gainers: [], losers: [] });
    await env.KV_STORE.put(CACHE_KEY, mockCex);
    return mockCex;
}

// --- DEX ENGINE (UPDATED WITH FILTERS) ---
async function updateDexData(env) {
    const NETWORKS = ['solana', 'eth', 'bsc', 'base'];
    const results = { timestamp: Date.now(), all: [], solana: [], eth: [], bsc: [], base: [] };
    let allPools = [];

    const promises = NETWORKS.map(async (net) => {
        try {
            // Fetch 2 pages to get enough candidates after filtering
            // GeckoTerminal API: sort=h24_volume_usd_desc gets active pools
            const fetchPage = async (p) => {
                const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${net}/pools?page=${p}&include=base_token&sort=h24_volume_usd_desc`, { headers: API_HEADERS });
                if(!res.ok) return [];
                const json = await res.json();
                return { data: json.data, included: json.included };
            };

            const [p1, p2] = await Promise.all([fetchPage(1), fetchPage(2)]);
            
            // Merge data
            const rawItems = [...(p1.data||[]), ...(p2.data||[])];
            const included = [...(p1.included||[]), ...(p2.included||[])];

            // Process & Filter
            const processed = rawItems.map(item => {
                const attr = item.attributes;
                const tokenId = item.relationships?.base_token?.data?.id;
                const tokenObj = included.find(inc => inc.id === tokenId && inc.type === 'token');
                
                const symbol = (tokenObj?.attributes?.symbol || attr.name.split('/')[0]).toUpperCase();
                const liquidity = parseFloat(attr.reserve_in_usd || 0);
                const volume = parseFloat(attr.volume_usd?.h24 || 0);
                const priceChange = parseFloat(attr.price_change_percentage?.h24 || 0);

                return {
                    id: item.id, 
                    address: attr.address,
                    name: attr.name.split('/')[0], // Clean name "PEPE / SOL" -> "PEPE"
                    symbol: symbol,
                    image: tokenObj?.attributes?.image_url || null,
                    price: parseFloat(attr.base_token_price_usd || 0),
                    price_change_24h: priceChange,
                    volume_24h: volume,
                    liquidity: liquidity,
                    network: net,
                    is_stable: STABLECOINS.has(symbol) // Flag stables
                };
            }).filter(p => {
                // === AGGRESSIVE FILTERING ===
                if (p.is_stable) return false; // No stables
                if (p.liquidity < MIN_LIQUIDITY) return false; // No fake liquidity
                if (p.volume_24h < MIN_VOLUME) return false; // No dead tokens
                if (p.price_change_24h === 0) return false; // No flatlines
                return true;
            });

            // Deduplicate: Keep highest liquidity version of each symbol
            const uniqueMap = new Map();
            processed.forEach(p => {
                const existing = uniqueMap.get(p.symbol);
                if (!existing || p.liquidity > existing.liquidity) {
                    uniqueMap.set(p.symbol, p);
                }
            });
            const uniquePools = Array.from(uniqueMap.values());

            // Sort Network Specific
            results[net] = { 
                gainers: [...uniquePools].sort((a,b) => b.price_change_24h - a.price_change_24h).slice(0, 20),
                losers: [...uniquePools].sort((a,b) => a.price_change_24h - b.price_change_24h).slice(0, 20)
            };
            
            return uniquePools;
        } catch (e) {
            console.error(`Failed ${net}:`, e);
            results[net] = { gainers: [], losers: [] };
            return [];
        }
    });

    const networkData = await Promise.all(promises);
    networkData.forEach(p => allPools.push(...p));

    // Global Deduplication (If PEPE is on ETH and SOL, show the biggest one or both? Let's keep both for "All", but maybe sort strictly)
    // Actually, for "Global", let's deduplicate by symbol again to show only the strongest version of a token across all chains
    const globalUniqueMap = new Map();
    allPools.forEach(p => {
        const existing = globalUniqueMap.get(p.symbol);
        // If duplicates exist across chains, keep the one with higher Volume (more action)
        if (!existing || p.volume_24h > existing.volume_24h) {
            globalUniqueMap.set(p.symbol, p);
        }
    });
    const finalGlobal = Array.from(globalUniqueMap.values());

    results.all = {
        gainers: [...finalGlobal].sort((a,b) => b.price_change_24h - a.price_change_24h).slice(0, 50),
        losers: [...finalGlobal].sort((a,b) => a.price_change_24h - b.price_change_24h).slice(0, 50)
    };

    const jsonString = JSON.stringify(results);
    await env.KV_STORE.put(DEX_CACHE_KEY, jsonString, { expirationTtl: 172800 });
    return jsonString;
}