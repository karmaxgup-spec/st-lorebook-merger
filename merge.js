/**
 * Pure merge logic for the Lorebook Merger extension.
 * Has no SillyTavern imports so it can be unit-tested with plain Node.
 */

/**
 * Normalizes a keyword for comparison (trimmed, case-insensitive).
 * @param {unknown} keyword
 * @returns {string}
 */
export function normalizeKeyword(keyword) {
    return String(keyword ?? '').trim().toLowerCase();
}

/**
 * Returns the set of normalized primary keywords of an entry.
 * @param {{ key?: unknown[] }} entry
 * @returns {Set<string>}
 */
export function keywordSet(entry) {
    const keys = Array.isArray(entry?.key) ? entry.key : [];
    return new Set(keys.map(normalizeKeyword).filter(Boolean));
}

/**
 * Appends keywords from `extra` into `target` (in place), skipping duplicates
 * case-insensitively. The first-seen spelling of each keyword is kept.
 * @param {unknown[]} target
 * @param {unknown[]} extra
 */
function unionKeywords(target, extra) {
    const seen = new Set(target.map(normalizeKeyword));
    for (const keyword of extra ?? []) {
        const norm = normalizeKeyword(keyword);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        target.push(keyword);
    }
}

/**
 * Appends `addition` to `base` if it is non-empty and not already contained in it.
 * @param {string} base
 * @param {string} addition
 * @returns {string}
 */
function appendContent(base, addition) {
    const add = String(addition ?? '').trim();
    if (!add) return base;
    if (!base.trim()) return add;
    if (base.includes(add)) return base;
    return `${base.trimEnd()}\n\n${add}`;
}

/**
 * Finds groups of entries that share more than `threshold` primary keywords and merges them.
 *
 * Processing order is ascending uid. The earliest entry of a group survives and keeps its
 * comment (name); later matching entries are merged into it and removed. The survivor's
 * keyword set grows as entries are absorbed, so chains of matches are merged too.
 *
 * The input `entries` object is not modified.
 *
 * @param {Record<string, any>} entries World info entries keyed by uid
 * @param {number} threshold Merge when shared keyword count is strictly greater than this
 * @returns {{ entries: Record<string, any>, merges: Array<{ survivorUid: string, removedUid: string, shared: number }> }}
 */
export function mergeEntries(entries, threshold) {
    const result = structuredClone(entries ?? {});
    const uids = Object.keys(result).sort((a, b) => Number(a) - Number(b));
    const consumed = new Set();
    const merges = [];

    for (const survivorUid of uids) {
        if (consumed.has(survivorUid)) continue;
        const survivor = result[survivorUid];
        const survivorKeys = keywordSet(survivor);

        for (const otherUid of uids) {
            if (otherUid === survivorUid || consumed.has(otherUid)) continue;
            // Only consider entries with a greater uid than the survivor, so the earliest entry survives.
            if (Number(otherUid) < Number(survivorUid)) continue;

            const other = result[otherUid];
            const otherKeys = keywordSet(other);
            let shared = 0;
            for (const k of otherKeys) {
                if (survivorKeys.has(k)) shared++;
            }
            if (shared <= threshold) continue;

            // Union keywords and content into the survivor.
            survivor.key = Array.isArray(survivor.key) ? survivor.key : [];
            survivor.keysecondary = Array.isArray(survivor.keysecondary) ? survivor.keysecondary : [];
            unionKeywords(survivor.key, other.key);
            unionKeywords(survivor.keysecondary, other.keysecondary);
            survivor.content = appendContent(String(survivor.content ?? ''), other.content);
            for (const k of keywordSet(survivor)) survivorKeys.add(k);

            consumed.add(otherUid);
            merges.push({ survivorUid, removedUid: otherUid, shared });
            delete result[otherUid];
        }
    }

    return { entries: result, merges };
}
