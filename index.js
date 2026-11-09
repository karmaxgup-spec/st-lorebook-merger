import { world_names, loadWorldInfo, saveWorldInfo, reloadEditor } from '../../../world-info.js';
import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { Popup, POPUP_RESULT } from '../../../popup.js';
import { escapeHtml } from '../../../utils.js';
import { mergeEntries } from './merge.js';

const EXTENSION_NAME = 'third-party/st-lorebook-merger';

/**
 * Fills the lorebook dropdown from the current world list, keeping the selection if possible.
 */
function populateLorebookSelect() {
    const select = $('#lorebook_merger_book');
    const previous = select.val();
    select.empty();
    for (const name of world_names ?? []) {
        select.append($('<option></option>').val(name).text(name));
    }
    if (previous && (world_names ?? []).includes(previous)) {
        select.val(previous);
    }
}

/**
 * Describes an entry for display in the confirmation popup.
 * @param {any} entry
 * @returns {string}
 */
function describeEntry(entry) {
    return entry?.comment?.trim() || entry?.key?.[0] || `#${entry?.uid}`;
}

/**
 * Runs the filter for the selected lorebook: finds merge groups, confirms, then saves.
 */
async function onFilterClick() {
    const bookName = String($('#lorebook_merger_book').val() ?? '');
    if (!bookName) {
        toastr.warning('Select a lorebook first.');
        return;
    }

    const raw = $('#lorebook_merger_threshold').val();
    const threshold = Number.parseInt(String(raw), 10);
    if (!Number.isInteger(threshold) || threshold < 0) {
        toastr.warning('Enter a whole number of 0 or more for the keyword threshold.');
        return;
    }

    const data = await loadWorldInfo(bookName);
    if (!data || !data.entries) {
        toastr.error(`Could not load lorebook "${bookName}".`);
        return;
    }

    const { entries: mergedEntries, merges } = mergeEntries(data.entries, threshold);
    if (merges.length === 0) {
        toastr.info(`No entries in "${bookName}" share more than ${threshold} keyword(s).`);
        return;
    }

    const lines = merges.map(({ survivorUid, removedUid, shared }) => {
        const survivor = escapeHtml(describeEntry(data.entries[survivorUid]));
        const removed = escapeHtml(describeEntry(data.entries[removedUid]));
        return `<li><b>${survivor}</b> absorbs <b>${removed}</b> (${shared} shared keywords)</li>`;
    });

    const confirmHtml = `
        <p>${merges.length} entr${merges.length === 1 ? 'y' : 'ies'} will be deleted and merged into the entry that survives:</p>
        <ul style="text-align:left; max-height:40vh; overflow:auto;">${lines.join('')}</ul>
        <p>This cannot be undone from the extension. Continue?</p>`;

    const result = await Popup.show.confirm('Filter lorebook', confirmHtml);
    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    // Re-load in case the lorebook changed while the popup was open.
    const latest = await loadWorldInfo(bookName);
    if (!latest || !latest.entries) {
        toastr.error(`Could not reload lorebook "${bookName}".`);
        return;
    }
    const { entries: finalEntries, merges: finalMerges } = mergeEntries(latest.entries, threshold);

    const updated = structuredClone(latest);
    updated.entries = finalEntries;
    await saveWorldInfo(bookName, updated, true);
    reloadEditor(bookName);

    toastr.success(`Merged ${finalMerges.length} entr${finalMerges.length === 1 ? 'y' : 'ies'} in "${bookName}".`);
}

export async function init() {
    const html = await renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
    $('#extensions_settings2').append(html);

    populateLorebookSelect();
    $('#lorebook_merger_book').on('focus mousedown', populateLorebookSelect);
    $('#lorebook_merger_filter').on('click', onFilterClick);
}
