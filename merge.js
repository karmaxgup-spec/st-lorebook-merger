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

/** Key stored in an entry's `extensions` object once it is the result of a merge. */
export const MERGED_FLAG = 'lorebook_merger_merged';

/**
 * @param {{ extensions?: Record<string, any> }} entry
 * @returns {boolean} True when the entry is already the result of a merge.
 */
export function isMergedEntry(entry) {
    return entry?.extensions?.[MERGED_FLAG] === true;
}

/**
 * Merges pairs of entries that share more than `threshold` primary keywords.
 *
 * Each merge combines exactly two entries. Entries are visited in ascending uid order.
 * The earliest unpaired entry is compared with later unpaired entries; the first one that
 * shares enough keywords is merged into it and deleted. The survivor keeps its name
 * (comment) and uid. Once an entry has been used in a merge (as survivor or removed), it
 * is not used again in the same run, so a group of three matching entries becomes one
 * merged pair plus the untouched third entry.
 *
 * Survivors are marked in `extensions.lorebook_merger_merged` and skipped by later runs,
 * so each entry belongs to at most one merge. Pairs of entries that were not merged in
 * earlier runs are still matched.
 *
 * Keyword comparisons use each entry's original keywords, so a merge in this run does not
 * make other entries match.
 *
 * The input `entries` object is not modified.
 *
 * @param {Record<string, any>} entries World info entries keyed by uid
 * @param {number} threshold Merge when shared keyword count is strictly greater than this
 * @returns {{ entries: Record<string, any>, merges: Array<{ survivorUid: string, removedUid: string, shared: number }> }}
 */
export function mergeEntries(entries, threshold) {
    const original = entries ?? {};
    const result = structuredClone(original);
    const uids = Object.keys(original).sort((a, b) => Number(a) - Number(b));
    const used = new Set();
    const merges = [];

    for (const survivorUid of uids) {
        if (used.has(survivorUid) || isMergedEntry(original[survivorUid])) continue;
        const survivorKeys = keywordSet(original[survivorUid]);

        for (const otherUid of uids) {
            if (Number(otherUid) <= Number(survivorUid) || used.has(otherUid) || isMergedEntry(original[otherUid])) continue;

            const otherKeys = keywordSet(original[otherUid]);
            let shared = 0;
            for (const k of otherKeys) {
                if (survivorKeys.has(k)) shared++;
            }
            if (shared <= threshold) continue;

            // Exactly one pair: fold `other` into `survivor`, then stop looking for this survivor.
            const survivor = result[survivorUid];
            const other = result[otherUid];
            survivor.key = Array.isArray(survivor.key) ? survivor.key : [];
            survivor.keysecondary = Array.isArray(survivor.keysecondary) ? survivor.keysecondary : [];
            unionKeywords(survivor.key, other.key);
            unionKeywords(survivor.keysecondary, other.keysecondary);
            survivor.content = appendContent(String(survivor.content ?? ''), other.content);
            survivor.extensions = { ...(survivor.extensions ?? {}), [MERGED_FLAG]: true };

            used.add(survivorUid);
            used.add(otherUid);
            merges.push({ survivorUid, removedUid: otherUid, shared });
            delete result[otherUid];
            break;
        }
    }

    return { entries: result, merges };
}
