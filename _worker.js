// _worker.js

// ==========================================
// 1. CONFIGURATION
// ==========================================

// --- CEX (Coingecko Main) Config ---
const CACHE_KEY = "market_data_v7"; 
const CACHE_LOCK_KEY = "market_data_lock";
const UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 Mins
const SOFT_REFRESH_MS = 12 * 60 * 1000;    // 12 Mins
const MIN_RETRY_DELAY_MS = 2 * 60 * 1000;  // 2 Mins

// --- DEX (GeckoTerminal) Config ---
const DEX_CACHE_KEY = "dex_stats_v1";
const DEX_LOCK_KEY = "dex_stats_lock";
const DEX_SOFT_REFRESH_MS = 7 * 60 * 1000; // 7 Mins (Aggressive update)

// --- Shared Config ---
const TIMEOUT_MS = 45000; // 45 Seconds
const LOCK_TIMEOUT_MS = 120000; // 2 min lock

const HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
};

// --- STEALTH HEADERS ---
const API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.coingecko.com/"
};

// ==========================================
// 2. MAIN ROUTER
// ==========================================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // === ROUTE 1: DYNAMIC SITEMAP ===
        if (url.pathname === "/sitemap.xml") {
            return handleSitemap(request, env);
        }

        // === ROUTE 2: MARKET DATA API (CEX) ===
        if (url.pathname === "/api/stats") {
            return handleCexStats(env, ctx);
        }

        // === ROUTE 3: DEX DATA API (NEW) ===
        if (url.pathname === "/api/dex-stats") {
            return handleDexStats(env, ctx);
        }
        
        // === ROUTE 4: STATIC ASSETS (DEFAULT) ===
        return env.ASSETS.fetch(request);
    }
};

// ==========================================
// 3. ROUTE HANDLERS
// ==========================================

// --- Handler: SITEMAP ---
async function handleSitemap(request, env) {
    const baseUrl = "https://cryptomovers.pages.dev";
    const now = new Date().toISOString();
    
    try {
        const manifestRes = await env.ASSETS.fetch(new URL("/urls.json", request.url));
        if (!manifestRes.ok) return new Response("Error: urls.json not found", { status: 500 });

        const pages = await manifestRes.json();
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        pages.forEach(page => {
            sitemap += `
  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
        });

        sitemap += `\n</urlset>`;

        return new Response(sitemap, {
            headers: { 
                "Content-Type": "application/xml", 
                "Cache-Control": "no-cache, no-store, must-revalidate" 
            }
        });
    } catch (err) {
        return new Response("Sitemap Error: " + err.message, { status: 500 });
    }
}

// --- Handler: CEX STATS (Original Logic) ---
async function handleCexStats(env, ctx) {
    if (!env.KV_STORE) {
        return new Response(JSON.stringify({ error: true, message: "KV_STORE binding missing" }), { status: 500, headers: HEADERS });
    }

    try {
        const [cachedRaw, lock] = await Promise.all([
            env.KV_STORE.get(CACHE_KEY),
            env.KV_STORE.get(CACHE_LOCK_KEY)
        ]);
        
        let cachedData = null;
        let dataAge = 0;
        const now = Date.now();

        if (cachedRaw) {
            try {
                cachedData = JSON.parse(cachedRaw);
                dataAge = now - (cachedData.timestamp || 0);
            } catch (e) { console.error("Cache corrupted:", e); }
        }

        const isUpdating = lock && (now - parseInt(lock)) < LOCK_TIMEOUT_MS;

        // 1. Fresh Data
        if (cachedData && dataAge < SOFT_REFRESH_MS) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Fresh" } });
        }

        // 2. Update in Progress
        if (isUpdating && cachedData) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-UpdateInProgress" } });
        }

        // 3. Stale -> Background Update
        if (cachedData && dataAge >= SOFT_REFRESH_MS) {
            const lastAttemptAge = now - (cachedData.lastUpdateAttempt || 0);
            
            if (lastAttemptAge >= MIN_RETRY_DELAY_MS) {
                console.log("Triggering CEX Background Update...");
                await env.KV_STORE.put(CACHE_LOCK_KEY, now.toString(), { expirationTtl: Math.floor(LOCK_TIMEOUT_MS / 1000) });
                
                ctx.waitUntil(
                    updateMarketDataSafe(env, cachedData, true)
                        .finally(() => env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {}))
                );
                return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Proactive" } });
            } else {
                return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-RateLimited" } });
            }
        }

        // 4. Empty -> Live Fetch
        console.log("CEX Cache empty. Starting Sprint...");
        await env.KV_STORE.put(CACHE_LOCK_KEY, now.toString(), { expirationTtl: Math.floor(LOCK_TIMEOUT_MS / 1000) });
        
        try {
            const freshJson = await fetchWithTimeout(env, false);
            await env.KV_STORE.put(CACHE_KEY, freshJson, { expirationTtl: 172800 });
            await env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {});
            return new Response(freshJson, { headers: { ...HEADERS, "X-Source": "Live-Fetch-Sprint" } });
        } catch (error) {
            await env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {});
            if (cachedData) {
                return new Response(JSON.stringify(cachedData), { headers: { ...HEADERS, "X-Source": "Cache-Fallback-Error" } });
            }
            throw error;
        }

    } catch (err) {
        return new Response(JSON.stringify({ error: true, message: err.message }), { status: 500, headers: HEADERS });
    }
}

// --- Handler: DEX STATS (New Logic) ---
async function handleDexStats(env, ctx) {
    if (!env.KV_STORE) return new Response(JSON.stringify({ error: true }), { status: 500, headers: HEADERS });

    try {
        const [cachedRaw, lock] = await Promise.all([
            env.KV_STORE.get(DEX_CACHE_KEY),
            env.KV_STORE.get(DEX_LOCK_KEY)
        ]);

        let cachedData = null;
        const now = Date.now();
        if (cachedRaw) {
             try { cachedData = JSON.parse(cachedRaw); } catch(e) {}
        }

        const dataAge = cachedData ? (now - (cachedData.timestamp || 0)) : 99999999;
        const isUpdating = lock && (now - parseInt(lock)) < LOCK_TIMEOUT_MS;

        // 1. Fresh
        if (cachedData && dataAge < DEX_SOFT_REFRESH_MS) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Fresh" } });
        }

        // 2. Stale but updating
        if (isUpdating && cachedData) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-UpdateInProgress" } });
        }

        // 3. Stale -> Trigger Update
        if (cachedData && dataAge >= DEX_SOFT_REFRESH_MS) {
            console.log("Triggering DEX Background Update...");
            await env.KV_STORE.put(DEX_LOCK_KEY, now.toString(), { expirationTtl: 120 });
            ctx.waitUntil(updateDexData(env).finally(() => env.KV_STORE.delete(DEX_LOCK_KEY).catch(()=>{})));
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Proactive" } });
        }

        // 4. Empty -> Fetch
        console.log("DEX Cache empty. Fetching...");
        await env.KV_STORE.put(DEX_LOCK_KEY, now.toString(), { expirationTtl: 120 });
        const freshData = await updateDexData(env);
        await env.KV_STORE.delete(DEX_LOCK_KEY).catch(()=>{});
        return new Response(freshData, { headers: { ...HEADERS, "X-Source": "Live-Fetch" } });

    } catch (err) {
        return new Response(JSON.stringify({ error: true, message: err.message }), { status: 500, headers: HEADERS });
    }
}

// ==========================================
// 4. HELPER FUNCTIONS (CEX & DEX Engines)
// ==========================================

// --- CEX ENGINE HELPERS ---

async function updateMarketDataSafe(env, existingData, isDeepScan) {
    try { await updateMarketData(env, existingData, isDeepScan); } catch (e) { console.error("Background update failed:", e); }
}

async function fetchWithTimeout(env, isDeepScan) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
        const result = await updateMarketData(env, null, isDeepScan, controller.signal);
        clearTimeout(timeoutId);
        return result;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') throw new Error("Request timeout. Try again.");
        if (err.message.includes("Rate Limit") || err.message.includes("429")) throw new Error("CoinGecko Busy (429). Wait 1 min.");
        throw err;
    }
}

async function updateMarketData(env, existingData, isDeepScan, signal = null) {
    const updateAttemptTime = Date.now();
    const pages = isDeepScan ? [1, 2, 3, 4, 5, 6] : [1];
    const perPage = 250; 
    let allCoins = [];
    let hitRateLimit = false;
    let lastError = null;
    
    const config = { headers: API_HEADERS };
    if (signal) config.signal = signal;

    for (const page of pages) {
        if (hitRateLimit) break;
        let success = false;
        let attempts = 0;
        const MAX_ATTEMPTS = 2;

        while (attempts < MAX_ATTEMPTS && !success && !hitRateLimit) {
            attempts++;
            try {
                // Includes Volume, 7d, 30d, 1y
                const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&price_change_percentage=24h,7d,30d,1y`, config);
                
                if (res.status === 429) {
                    if (attempts >= MAX_ATTEMPTS) { hitRateLimit = true; lastError = "Rate limit reached"; }
                    throw new Error("Rate Limit");
                }
                if (!res.ok) throw new Error(`API Error: ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Invalid Data");
                
                allCoins = allCoins.concat(data);
                success = true;
                if (pages.length > 1 && page < pages.length) await new Promise(r => setTimeout(r, 2000));
            } catch (innerErr) {
                lastError = innerErr.message;
                if (attempts < MAX_ATTEMPTS && !hitRateLimit) await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
    }

    if (allCoins.length === 0) {
        if (existingData) {
            const fallback = JSON.stringify({
                ...existingData,
                lastUpdateAttempt: updateAttemptTime,
                lastUpdateFailed: true,
                lastError: lastError || "Fetch failed",
                timestamp: existingData.timestamp
            });
            await env.KV_STORE.put(CACHE_KEY, fallback, { expirationTtl: 300 });
            return fallback;
        }
        throw new Error(`Market data unavailable: ${lastError}`);
    }

    const valid = allCoins.filter(c => c && c.price_change_percentage_24h != null && c.symbol && c.current_price != null);
    
    const formatCoin = (coin) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image, 
        current_price: coin.current_price,
        market_cap: coin.market_cap,
        total_volume: coin.total_volume,
        price_change_percentage_24h: coin.price_change_percentage_24h,
        price_change_percentage_7d: coin.price_change_percentage_7d_in_currency,
        price_change_percentage_30d: coin.price_change_percentage_30d_in_currency,
        price_change_percentage_1y: coin.price_change_percentage_1y_in_currency
    });

    const gainers = [...valid].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 50).map(formatCoin);
    const losers = [...valid].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 50).map(formatCoin);

    const finalObject = {
        timestamp: Date.now(),
        lastUpdateAttempt: updateAttemptTime,
        lastUpdateFailed: false,
        totalScanned: allCoins.length,
        isPartial: hitRateLimit,
        gainers,
        losers
    };

    const jsonString = JSON.stringify(finalObject);
    await env.KV_STORE.put(CACHE_KEY, jsonString, { expirationTtl: 172800 });
    return jsonString;
}

// --- DEX ENGINE HELPERS ---

async function updateDexData(env) {
    const NETWORKS = ['solana', 'eth', 'bsc', 'base'];
    const results = { timestamp: Date.now(), all: [], solana: [], eth: [], bsc: [], base: [] };
    let allPools = [];

    // Fetch all networks in parallel
    const promises = NETWORKS.map(async (net) => {
        try {
            // Fetch Top Pools by Volume (Best proxy for "Movers" on Free API)
            const url = `https://api.geckoterminal.com/api/v2/networks/${net}/pools?page=1&include=base_token&sort=h24_volume_usd_desc`;
            const res = await fetch(url, { headers: API_HEADERS });
            if (!res.ok) throw new Error(res.status);
            const json = await res.json();
            
            const processed = (json.data || []).map(item => {
                const attr = item.attributes;
                // Find token image/symbol in 'included' array
                const tokenId = item.relationships?.base_token?.data?.id;
                const tokenObj = (json.included || []).find(inc => inc.id === tokenId && inc.type === 'token');
                
                return {
                    id: item.id, // network_address
                    address: attr.address,
                    name: attr.name,
                    symbol: tokenObj?.attributes?.symbol || attr.name.split('/')[0],
                    image: tokenObj?.attributes?.image_url || null,
                    price: parseFloat(attr.base_token_price_usd || 0),
                    price_change_24h: parseFloat(attr.price_change_percentage?.h24 || 0),
                    volume_24h: parseFloat(attr.volume_usd?.h24 || 0),
                    liquidity: parseFloat(attr.reserve_in_usd || 0),
                    network: net
                };
            }).filter(p => p.price > 0 && p.volume_24h > 1000); // Filter dust
            
            // Sort per network
            const gainers = [...processed].sort((a,b) => b.price_change_24h - a.price_change_24h).slice(0, 20);
            const losers = [...processed].sort((a,b) => a.price_change_24h - b.price_change_24h).slice(0, 20);
            
            results[net] = { gainers, losers };
            return processed;
        } catch (e) {
            console.error(`Failed to fetch ${net}:`, e);
            results[net] = { gainers: [], losers: [] };
            return [];
        }
    });

    const networkData = await Promise.all(promises);
    networkData.forEach(p => allPools.push(...p));

    // Create Global "All" Lists
    results.all = {
        gainers: [...allPools].sort((a,b) => b.price_change_24h - a.price_change_24h).slice(0, 50),
        losers: [...allPools].sort((a,b) => a.price_change_24h - b.price_change_24h).slice(0, 50)
    };

    const jsonString = JSON.stringify(results);
    await env.KV_STORE.put(DEX_CACHE_KEY, jsonString, { expirationTtl: 172800 });
    return jsonString;
}

