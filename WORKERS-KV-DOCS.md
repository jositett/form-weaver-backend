  1 | # **Cloudflare Workers KV Caching - Complete Documentation**
  2 | 
  3 | Based on the official Cloudflare documentation, here's the comprehensive guide to Workers KV caching for your `formweaver.joedroid.com` implementation. **This architecture is KV-only for Key-Value storage and caching.**
  4 | 
  5 | ---
  6 | 
  7 | ## **1. What is Workers KV?**
  8 | 
  9 | Workers KV is a **global, low-latency, key-value data store** designed for Cloudflare Workers. It stores data in centralized data centers and caches it in Cloudflare's edge locations after access.
 10 | 
 11 | **Key Characteristics:**
 12 | 
 13 | - **Eventually consistent**: Writes are immediately visible locally, but take up to 60 seconds to propagate globally
 14 | - **Optimized for read-heavy workloads**: 10M free reads/month on paid plan
 15 | - **Global caching**: Frequently accessed data is cached at the edge automatically
 16 | - **Key size**: Up to 512 bytes
 17 | - **Value size**: Up to 25 MiB per key
 18 | 
 19 | ---
 20 | 
 21 | ## **2. How KV Works (Architecture)**
 22 | 
 23 | ### **Write Flow**
 24 | 
 25 | 1. Data is written to **central data stores** (not all locations)
 26 | 2. Cached in the region where the write occurred
 27 | 3. Propagates to other locations on-demand (when read)
 28 | 
 29 | ### **Read Flow**
 30 | 
 31 | 1. Check local edge cache first (fastest: <1ms)
 32 | 2. If not cached, check nearest regional tier
 33 | 3. If not there, check central tier
 34 | 4. Finally, fetch from central stores (slowest: 100-300ms)
 35 | 
 36 | **Performance**: First read from a location is slow ("cold read"), subsequent reads are fast as data gets cached locally.
 37 | 
 38 | ---
 39 | 
 40 | ## **3. Core Concepts**
 41 | 
 42 | ### **KV Namespaces**
 43 | 
 44 | A namespace is a key-value database replicated to Cloudflare's global network. Think of it as a "bucket" for related data.
 45 | 
 46 | **Create a namespace:**
 47 | 
 48 | ```bash
 49 | npx wrangler kv namespace create "FORMWEAVER_CONFIG"
 50 | ```
 51 | 
 52 | **Binding to Worker** (in `wrangler.toml`):
 53 | 
 54 | ```toml
 55 | [[kv_namespaces]]
 56 | binding = "FORMWEAVER_CONFIG"
 57 | id = "your_namespace_id"
 58 | preview_id = "your_kv-preview-id"
 59 | ```
 60 | 
 61 | **Access in code**: `env.FORMWEAVER_CONFIG`
 62 | 
 63 | ---
 64 | 
 65 | ## **4. API Methods**
 66 | 
 67 | ### **Reading Data**
 68 | 
 69 | #### **ASingle Key**
 70 | 
 71 | ```javascript
 72 | // Basic get
 73 | const value = await env.NAMESPACE.get("key");
 74 | 
 75 | // With type specification
 76 | const json = await env.NAMESPACE.get("config", "json");
 77 | const buffer = await env.NAMESPACE.get("file", "arrayBuffer");
 78 | const stream = await env.NAMESPACE.get("large-file", "stream");
 79 | 
 80 | // With custom cache TTL (minimum 60 seconds)
 81 | const value = await env.NAMESPACE.get("key", {
 82 |   cacheTtl: 300  // Cache for 5 minutes
 83 | });
 84 | ```
 85 | 
 86 | #### **Multiple Keys (Bulk Get)**
 87 | 
 88 | ```javascript
 89 | // Get up to 100 keys at once
 90 | const keys = ["user:1", "user:2", "user:3"];
 91 | const values = await env.NAMESPACE.get(keys); // Returns Map
 92 | 
 93 | // Convert to object
 94 | const data = Object.fromEntries(values);
 95 | // { "user:1": "value1", "user:2": "value2", "user:3": null }
 96 | ```
 97 | 
 98 | #### **With Metadata**
 99 | 
100 | ```javascript
101 | const { value, metadata } = await env.NAMESPACE.getWithMetadata("key");
102 | 
103 | // For multiple keys
104 | const results = await env.NAMESPACE.getWithMetadata(["key1", "key2"]);
105 | // Returns Map where each entry has { value, metadata }
106 | ```
107 | 
108 | **Response Types** (ordered by performance):
109 | 
110 | 1. **`stream`** - Fastest for large values
111 | 2. **`arrayBuffer`** - Good for binary data
112 | 3. **`text`** - Default, for strings
113 | 4. **`json`** - Slowest (requires parsing)
114 | 
115 | ### **Writing Data**
116 | 
117 | #### **B. Single Key**
118 | 
119 | ```javascript
120 | // Basic put
121 | await env.NAMESPACE.put("key", "value");
122 | 
123 | // With expiration (Unix epoch)
124 | await env.NAMESPACE.put("session:abc123", "data", {
125 |   expiration: 1733097600  // Expire at specific time
126 | });
127 | 
128 | // With TTL (seconds from now)
129 | await env.NAMESPACE.put("cache:user:123", JSON.stringify(userData), {
130 |   expirationTtl: 3600  // Expire in 1 hour
131 | });
132 | 
133 | // With metadata
134 | await env.NAMESPACE.put("config:feature-flag", "enabled", {
135 |   metadata: { 
136 |     createdAt: new Date().toISOString(),
137 |     createdBy: "admin"
138 |   }
139 | });
140 | ```141 | 
142 | #### **Concurrent Writes Warning**
143 | 
144 | - **Max 1 write per second to the same key**
145 | - Concurrent writes to the same key can cause overwrites (last write wins)
146 | - Use Durable Objects if you need strong consistency for writes
147 | 
148 | ### **Deleting Data**
149 | 
150 | ```javascript
151 | await env.NAMESPACE.delete("key");
152 | 
153 | // Delete multiple keys
154 | await env.NAMESPACE.delete(["key1", "key2", "key3"]);
155 | ```
156 | 
157 | ### **Listing Keys**
158 | 
159 | ```javascript
160 | // List all keys (max 1000 per request)
161 | const result = await env.NAMESPACE.list();
162 | 
163 | // With prefix filtering
164 | const users = await env.NAMESPACE.list({ prefix: "user:" });
165 | 
166 | // With pagination
167 | const firstPage = await env.NAMESPACE.list({ limit: 100 });
168 | const nextPage = await env.NAMESPACE.list({ 
169 |   limit: 100, 
170 |   cursor: firstPage.cursor 
171 | });
172 | 
173 | // Result structure
174 | {
175 |   keys: [
176 |     { name: "user:1", expiration: 1234567890, metadata: {...} },
177 |     { name: "user:2", expiration: null, metadata: null }
178 |   ],
179 |   list_complete: false,  // true if no more keys
180 |   cursor: "next-page-token"
181 | }
182 | ```
183 | 
184 | ---
185 | 
186 | ## **5. Caching Strategies & Optimization**
187 | 
188 | ### **A. Cache-Aside Pattern (Recommended)**
189 | 
190 | ```javascript
191 | async function getWithCache(key, fetcher) {
192 |   // Try KV first
193 |   const cached = await env.NAMESPACE.get(key);
194 |   if (cached !== null) {
195 |     return JSON.parse(cached);
196 |   }
197 |   
198 |   // Miss: fetch from origin
199 |   const data = await fetcher();
200 |   
201 |   // Store in KV with TTL
202 |   await env.NAMESPACE.put(key, JSON.stringify(data), {
203 |     expirationTtl: 3600  // 1 hour
204 |   });
205 |   
206 |   return data;
207 | }
208 | 
209 | // Usage
210 | const user = await getWithCache("user:123", async () => {
211 |   return await fetchUserFromDatabase(123);
212 | });
213 | ```
214 | 
215 | ### **B. Pre-warming Cache**
216 | 
217 | ```javascript
218 | // Write data before it's needed
219 | await Promise.all([
220 |   env.NAMESPACE.put("popular:config", JSON.stringify(config), {
221 |     expirationTtl: 86400
222 |   }),
223 |   env.NAMESPACE.put("popular:routes", JSON.stringify(routes), {
224 |     expirationTtl: 86400
225 |   })
226 | ]);
227 | ```
228 | 
229 | ### **C. Batching Operations**
230 | 
231 | ```javascript
232 | // Instead of 100 individual gets (counts as 100 operations):
233 | const keys = Array.from({length: 100}, (_, i) => `item:${i}`);
234 | const values = await env.NAMESPACE.get(keys); // Counts as 1 operation
235 | 
236 | // Bulk write via REST API (not bindings) - up to 10,000 pairs
237 | ```
238 | 
239 | ### **D. Key Coalescing (Advanced)**
240 | 
241 | For related keys with mixed access patterns, combine them into a "super key":
242 | 
243 | ```javascript
244 | // Instead of separate keys:
245 | // user:123:profile, user:123:settings, user:123:preferences
246 | 
247 | // Use one key:
248 | await env.NAMESPACE.put("user:123", JSON.stringify({
249 |   profile: {...},
250 |   settings: {...},
251 |   preferences: {...}
252 | }));
253 | ```
254 | 
255 | **Pros**: Cold keys benefit from hot key caching  
256 | **Cons**: Race conditions on updates; max 25 MiB value size
257 | 
258 | ### **E. Metadata Optimization**
259 | 
260 | For small values, store data in metadata to avoid separate `get()` calls:
261 | 
262 | ```javascript
263 | // Instead of storing value separately
264 | await env.NAMESPACE.put("user:123", "", {
265 |   metadata: { name: "John", status: "active" }
266 | });
267 | 
268 | // Later: list() includes metadata directly
269 | const result = await env.NAMESPACE.list({ prefix: "user:" });
270 | // result.keys[0].metadata contains the data
271 | ```
272 | 
273 | **Limit**: 1024 bytes per metadata object
274 | 
275 | ---
276 | 
277 | ## **6. Performance Best Practices**
278 | 
279 | ### **✅ DO:**
280 | 
281 | - **Increase `cacheTtl` for write-once/read-many data** (up from default 60s)
282 | - **Use bulk operations** (`get()` with array, `list()`) to reduce operation count
283 | - **Access keys in parallel** with `Promise.all()`:
284 | 
285 |   ```javascript
286 |   const [config, user] = await Promise.all([
287 |     env.NAMESPACE.get("config"),
288 |     env.NAMESPACE.get("user:123")
289 |   ]);
290 |   ```
291 | 
292 | - **Store JSON as text** and parse manually for better performance than `type: "json"`
293 | - **Use Durable Objects** for write-heavy workloads or strong consistency needs
294 | 
295 | ### **❌ DON'T:**
296 | 
297 | - **Don't write to the same key more than once per second** (rate limit: 429 errors)
298 | - **Don't rely on immediate global consistency** (writes take ~60s to propagate)
299 | - **Don't store large files (>1MB) in KV** - use R2 for that
300 | - **Don't use KV as a primary database** for transactional workloads
301 | - **Don't forget error handling** - KV operations can fail
302 | 
303 | ---
304 | 
305 | ## **7. Limits & Pricing**
306 | 
307 | ### **Free Tier**
308 | 
309 | | Feature | Limit |
310 | |---------|-------|
311 | | **Reads** | 100,000/day |
312 | | **Writes** | 1,000/day |
313 | | **Deletes** | 1,000/day |
314 | | **Storage** | 1 GB total |
315 | | **Key size** | 512 bytes |
316 | | **Value size** | 25 MiB |
317 | | **Operations/invocation** | 1,000 max |
318 | 
319 | ### **Paid Tier ($5/month minimum)**
320 | 
321 | | Feature | Included | Overage |
322 | |---------|----------|---------|
323 | | **Reads** | 10M/month | $0.50/million |
324 | | **Writes** | 1M/month | $5.00/million |
325 | | **Deletes** | 1M/month | $5.00/million |
326 | | **Storage** | 1 GB | $0.50/GB/month |
337 | 
338 | **Important**: Bulk reads count as **1 operation** regardless of number of keys.
339 | 
340 | ---
341 | 
342 | ## **8. Architecture: KV Only**
343 | 
344 | Workers KV is the **sole** Key-Value storage solution for this project, replacing any external/legacy caching mechanisms.
345 | 
346 | ### **KV Performance & Cost Benefits**
347 | 
348 | *   **Cost Reduction**: Significantly lower operational cost compared to managed services like Redis.
349 | *   **Edge Performance**: Reads benefit from automatic caching at Cloudflare's edge network, leading to sub-50ms latency for cached data globally.
350 | *   **Scalability**: Zero operational overhead; scales automatically with traffic.
351 | *   **Durability**: Guarantees 11 9's of data durability.
352 | 
353 | ---
354 | 
355 | ## **9. FormWeaver-Specific Recommendations**
356 | 
357 | For `formweaver.joedroid.com`, here's your optimal KV strategy:
358 | 
359 | ```javascript
360 | // Environment setup
361 | interface Env {
362 |   FORMWEAVER_CONFIG: KVNamespace;
363 |   FORMWEAVER_CACHE: KVNamespace;
364 |   FORMWEAVER_RATE_LIMIT: KVNamespace;
365 | }
366 | 
367 | // 1. Configuration Storage
368 | const config = await env.FORMWEAVER_CONFIG.get("site:joedroid:config", "json");
369 | 
370 | // 2. Form submission caching (with TTL)
371 | await env.FORMWEAVER_CACHE.put(
372 |   `submission:${formId}:${timestamp}`,
373 |   JSON.stringify(formData),
374 |   { expirationTtl: 86400 } // 24 hours
375 | );
376 | 
377 | // 3. Rate limiting per IP
378 | const ip = request.headers.get("CF-Connecting-IP");
379 | const key = `ratelimit:${ip}`;
380 | const count = parseInt(await env.FORMWEAVER_RATE_LIMIT.get(key) || "0");
381 | 
382 | if (count > 100) {
383 |   return new Response("Rate limited", { status: 429 });
384 | }
385 | 
386 | await env.FORMWEAVER_RATE_LIMIT.put(key, (count + 1).toString(), {
387 |   expirationTtl: 3600
388 | });
389 | 
390 | // 4. Bulk operations for admin panel
391 | const submissions = await env.FORMWEAVER_CACHE.list({
392 |   prefix: `submission:${formId}:`
393 | });
394 | ```
395 | 
396 | This setup leverages KV's strengths while avoiding its limitations for your form handling service.
397 | 
398 | ---
399 | 
400 | ## **10. Limits & Cost Comparison (KV vs Legacy)**
401 | 
402 | **KV is the cost-optimized, high-performance choice for our current needs.**
403 | 
404 | ---
405 | 
406 | **Version:** 1.0.1
407 | **Last Updated:** 2025-11-23
408 | 