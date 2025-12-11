// _worker.js

// === CONFIGURATION ===
const CACHE_KEY = "market_data_v7"; 
const CACHE_LOCK_KEY = "market_data_lock";

// --- CEX TIMERS ---
const CEX_SOFT_REFRESH_MS = 12 * 60 * 1000;    // 12 Mins
const CEX_RETRY_DELAY_MS = 2 * 60 * 1000;      // 2 Mins
const TIMEOUT_MS = 45000; 

// --- DEX TIMERS ---
const DEX_CACHE_KEY = "dex_data_v3";           
const DEX_LOCK_KEY = "dex_data_lock";          
const DEX_SOFT_REFRESH_MS = 18 * 60 * 1000;    // 18 Mins (Soft Refresh)
const DEX_LOCK_TIMEOUT_MS = 120000;            // 2 Min Lock

// === EXCLUSION FILES ===
const EXCLUSION_FILES = [
    "/exclusions/stablecoins-exclusion-list.json",
    "/exclusions/wrapped-tokens-exclusion-list.json"
];

const HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
};

const API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.coingecko.com/"
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // === ROUTE 1: SITEMAP ===
        if (url.pathname === "/sitemap.xml") {
            const baseUrl = "https://cryptomovers.pages.dev";
            const now = new Date().toISOString();
            
            try {
                const manifestRes = await env.ASSETS.fetch(new URL("/urls.json", request.url));
                
                if (!manifestRes.ok) {
                    return new Response("Error: urls.json not found", { status: 500 });
                }

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

        // === ROUTE 2: CEX MARKET DATA ===
        if (url.pathname === "/api/stats") {
            if (!env.KV_STORE) {
                return new Response(JSON.stringify({ error: true, message: "KV_STORE binding missing" }), { status: 500, headers: HEADERS });
            }
            return handleCexStats(request, env, ctx);
        }

        // === ROUTE 3: DEX DATA ===
        if (url.pathname === "/api/dex-stats") {
            if (!env.CMC_PRO_API_KEY) {
                return new Response(JSON.stringify({ error: true, message: "Server Config Error: Missing CMC Key" }), { status: 500, headers: HEADERS });
            }
            return handleDexStats(request, env, ctx);
        }
        
        // === ROUTE 4: STATIC ASSETS ===
        return env.ASSETS.fetch(request);
    }
};

// ==========================================
// 1. CEX HANDLER & LOGIC
// ==========================================
async function handleCexStats(request, env, ctx) {
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

        const isUpdating = lock && (now - parseInt(lock)) < DEX_LOCK_TIMEOUT_MS;

        // 1. Fresh -> Serve
        if (cachedData && dataAge < CEX_SOFT_REFRESH_MS) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Fresh" } });
        }
        // 2. Updating -> Serve Stale
        if (isUpdating && cachedData) {
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-UpdateInProgress" } });
        }
        // 3. Stale -> Background Update
        if (cachedData && dataAge >= CEX_SOFT_REFRESH_MS) {
            const lastAttemptAge = now - (cachedData.lastUpdateAttempt || 0);
            if (lastAttemptAge >= CEX_RETRY_DELAY_MS) {
                await env.KV_STORE.put(CACHE_LOCK_KEY, now.toString(), { expirationTtl: 120 });
                ctx.waitUntil(updateMarketDataSafe(env, cachedData, true).finally(() => env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {})));
                return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-Proactive" } });
            }
            return new Response(cachedRaw, { headers: { ...HEADERS, "X-Source": "Cache-RateLimited" } });
        }

        // 4. Empty -> Blocking Fetch
        await env.KV_STORE.put(CACHE_LOCK_KEY, now.toString(), { expirationTtl: 120 });
        try {
            const freshJson = await fetchWithTimeout(env, false);
            await env.KV_STORE.put(CACHE_KEY, freshJson, { expirationTtl: 172800 });
            await env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {});
            return new Response(freshJson, { headers: { ...HEADERS, "X-Source": "Live-Fetch-Sprint" } });
        } catch (error) {
            await env.KV_STORE.delete(CACHE_LOCK_KEY).catch(() => {});
            if (cachedData) return new Response(JSON.stringify(cachedData), { headers: { ...HEADERS, "X-Source": "Cache-Fallback-Error" } });
            throw error;
        }
    } catch (err) {
        return new Response(JSON.stringify({ error: true, message: err.message }), { status: 500, headers: HEADERS });
    }
}

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

// === FULL CEX DATA LOGIC ===
async function updateMarketData(env, existingData, isDeepScan, signal = null) {
    const updateAttemptTime = Date.now();
    const pages = isDeepScan ? [1, 2, 3, 4, 5, 6] : [1];
    const perPage = 250; 
    let allCoins = [];
    let hitRateLimit = false;
    let lastError = null;
    
    // 1. Fetch Exclusion Lists
    const exclusionSet = await getExclusions(env);

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
                // FETCHING PAGE
                const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&price_change_percentage=24h,7d,30d,1y`, config);
                
                if (res.status === 429) {
                    if (attempts >= MAX_ATTEMPTS) {
                        hitRateLimit = true;
                        lastError = "Rate limit reached";
                    }
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
                if (attempts < MAX_ATTEMPTS && !hitRateLimit) {
                    await new Promise(r => setTimeout(r, 2000 * attempts)); // Backoff
                }
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

    // 2. Filter using the Exclusion Set
    const valid = allCoins.filter(c => {
        if (!c || !c.symbol || c.price_change_percentage_24h == null || c.current_price == null) return false;
        return !exclusionSet.has(c.symbol.toLowerCase());
    });
    
    // 3. Format Data
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
        excludedCount: allCoins.length - valid.length,
        isPartial: hitRateLimit,
        gainers,
        losers
    };

    const jsonString = JSON.stringify(finalObject);
    await env.KV_STORE.put(CACHE_KEY, jsonString, { expirationTtl: 172800 });
    return jsonString;
}

// ==========================================
// 2. DEX HANDLER (CMC) & LOGIC
// ==========================================
async function handleDexStats(request, env, ctx) {
    const url = new URL(request.url);
    const requestedNetwork = url.searchParams.get("network") || "all";

    try {
        const [cachedRaw, lock] = await Promise.all([
            env.KV_STORE.get(DEX_CACHE_KEY),
            env.KV_STORE.get(DEX_LOCK_KEY)
        ]);

        let dexData = null;
        let dataAge = 0;
        const now = Date.now();

        if (cachedRaw) {
            try {
                dexData = JSON.parse(cachedRaw);
                dataAge = now - (dexData.timestamp || 0);
            } catch (e) { console.error("DEX Cache Corrupt"); }
        }

        const isUpdating = lock && (now - parseInt(lock)) < DEX_LOCK_TIMEOUT_MS;

        // A. FILTER FUNCTION
        const filterResponse = (fullData, source) => {
            const mappings = { "solana": "Solana", "eth": "Ethereum", "bsc": "BNB Smart Chain (BEP20)", "base": "Base" };
            const target = mappings[requestedNetwork];
            
            let pairs = fullData.pairs || [];
            if (target) pairs = pairs.filter(p => p.platform === target);

            const gainers = [...pairs].sort((a, b) => b.change_24h - a.change_24h).slice(0, 20);
            const losers = [...pairs].sort((a, b) => a.change_24h - b.change_24h).slice(0, 20);

            return new Response(JSON.stringify({
                timestamp: fullData.timestamp,
                network: requestedNetwork,
                gainers,
                losers
            }), { headers: { ...HEADERS, "X-Source": source } });
        };

        // 1. Fresh Data ( < 18 Mins )
        if (dexData && dataAge < DEX_SOFT_REFRESH_MS) {
            return filterResponse(dexData, "Cache-Fresh");
        }

        // 2. Update In Progress
        if (isUpdating && dexData) {
            return filterResponse(dexData, "Cache-UpdateInProgress");
        }

        // 3. Stale ( > 18 Mins ) -> Trigger Background Update
        if (dexData && dataAge >= DEX_SOFT_REFRESH_MS) {
            console.log("DEX Stale. Background Update...");
            await env.KV_STORE.put(DEX_LOCK_KEY, now.toString(), { expirationTtl: 120 });
            
            ctx.waitUntil(
                fetchCMC_DEX(env)
                    .then(newData => env.KV_STORE.put(DEX_CACHE_KEY, JSON.stringify(newData), { expirationTtl: 172800 }))
                    .catch(e => console.error("DEX Background Fail", e))
                    .finally(() => env.KV_STORE.delete(DEX_LOCK_KEY).catch(() => {}))
            );
            return filterResponse(dexData, "Cache-Proactive"); 
        }

        // 4. No Data -> Blocking Fetch
        console.log("DEX Cache Empty. Blocking Fetch.");
        await env.KV_STORE.put(DEX_LOCK_KEY, now.toString(), { expirationTtl: 120 });
        
        try {
            const freshData = await fetchCMC_DEX(env);
            await env.KV_STORE.put(DEX_CACHE_KEY, JSON.stringify(freshData), { expirationTtl: 172800 });
            await env.KV_STORE.delete(DEX_LOCK_KEY).catch(() => {});
            return filterResponse(freshData, "Live-Fetch-Sprint");
        } catch (e) {
            await env.KV_STORE.delete(DEX_LOCK_KEY).catch(() => {});
            if (dexData) return filterResponse(dexData, "Cache-Fallback-Error");
            throw e;
        }

    } catch (e) {
        return new Response(JSON.stringify({ error: true, message: e.message }), { status: 500, headers: HEADERS });
    }
}

async function fetchCMC_DEX(env) {
    const apiKey = env.CMC_PRO_API_KEY;
    const exclusionSet = await getExclusions(env);

    // 1. Fetch High Volume Pairs 
    const dexRes = await fetch('https://pro-api.coinmarketcap.com/v4/dex/spot-pairs/latest?limit=200&sort=volume_24h', {
        headers: { 'X-CMC_PRO_API_KEY': apiKey }
    });

    if (!dexRes.ok) throw new Error(`CMC DEX Error: ${dexRes.statusText}`);
    const dexJson = await dexRes.json();
    const pairs = dexJson.data || [];

    // 2. Filter: Exclusions AND Liquidity > 10k
    const filteredRaw = pairs.filter(p => {
        // Exclusions
        const symbol = p.base_asset_symbol || "";
        if (exclusionSet.has(symbol.toLowerCase())) return false;
        
        // === LIQUIDITY FILTER ===
        // Ensure liquidity is present and above $10,000 USD
        const liquidity = parseFloat(p.liquidity || 0);
        if (liquidity < 10000) return false;

        return true;
    });

    // 3. Side-load Metadata (Logos)
    const assetIds = [...new Set(filteredRaw.map(p => p.base_asset_id))].filter(id => id).slice(0, 100); 
    
    let logoMap = {};
    if (assetIds.length > 0) {
        try {
            const metaRes = await fetch(`https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=${assetIds.join(',')}`, {
                headers: { 'X-CMC_PRO_API_KEY': apiKey }
            });
            if (metaRes.ok) {
                const metaJson = await metaRes.json();
                Object.values(metaJson.data || {}).forEach(info => { logoMap[info.id] = info.logo; });
            }
        } catch (e) { console.error("Metadata fetch failed", e); }
    }

    const formattedPairs = filteredRaw.map(p => ({
        name: p.base_asset_name,
        symbol: p.base_asset_symbol,
        contract: p.base_asset_contract_address,
        platform: p.platform ? p.platform.name : "Unknown",
        price: p.price,
        change_24h: p.percent_change_24h,
        volume_24h: p.volume_24h,
        dex_url: p.dex_url, 
        image: logoMap[p.base_asset_id] || "https://cryptomovers.pages.dev/images/generic-coin.png"
    }));

    return {
        timestamp: Date.now(),
        pairs: formattedPairs
    };
}

// === SHARED HELPERS ===
async function getExclusions(env) {
    const exclusionSet = new Set();
    const baseUrl = "http://placeholder"; 
    await Promise.all(EXCLUSION_FILES.map(async (filePath) => {
        try {
            const res = await env.ASSETS.fetch(new URL(filePath, baseUrl));
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) list.forEach(item => exclusionSet.add(item.toLowerCase()));
            }
        } catch (e) {}
    }));
    return exclusionSet;
}