'use strict';
const util = require('util');

function addWhenContext(when, context) {
    if (when) {
        const conditions = when.split('||');
        const restricted = context.split('||').map(
            context => conditions.map(
                cond => context.trim() + ' && ' + cond.trim()
            ).join(' || ')
        ).join(' || ');
        return restricted;
    } else {
        return context;
    }
}

function addKeybindingsContext(keybindings, context) {
    if (context) {
        return keybindings.map(keybinding => {
            keybinding.when = addWhenContext(keybinding.when, context);
            return keybinding;
        });
    } else {
        return keybindings;
    }
}

function keybindingsContains(keybindings, keybinding) {
    for (let i = 0; i < keybindings.length; i++) {
        if (util.isDeepStrictEqual(keybindings[i], keybinding)) {
            return i;
        }
    }
    return -1;
}

// Makes combined keybindings of different default keybindings of windows, macos and linux.
function combineBaseKeybingings(baseKeybindings) {
    // Make a map that associates each keystroke to a set of keybindings.
    const keyDict = new Map();
    for (const { keybindings, when = '' } of baseKeybindings) {
        for (const keybinding of keybindings) {
            const key = keybinding['key'];
            if (!keyDict.has(key)) {
                keyDict.set(key, new Map());
            }
            const dict = keyDict.get(key);
            if (!dict.has(when)) {
                dict.set(when, []);
            }
            dict.get(when).push(keybinding);
        }
    }
    const contextList = baseKeybindings.map(item => (item['when'] || ''));
    let combined = [];
    for (const dict of keyDict.values()) {
        // Find common keybindings that are shared among all sources.
        const commonKeybindings = [];
        const firstSet = dict.get(contextList[0]) || [];
        for (let pos0 = 0; pos0 < firstSet.length; pos0++) {
            const positions = [ pos0 ];
            const keybinding = firstSet[pos0];
            for (let j = 1; j < contextList.length; j++) {
                const keybindings = dict.get(contextList[j]) || [];
                const pos = keybindingsContains(keybindings, keybinding);
                positions[j] = pos;
            }
            if (2 <= positions.filter(pos => 0 <= pos).length) {
                // found a (fully or partially) common keybinding among all contexts
                commonKeybindings.push(positions);
            }
        }
        // Drop common keybindings that are not placed in order.
        let indices = Array(contextList.length).fill(0);
        for (let i = 0; i < commonKeybindings.length; i++) {
            if (!commonKeybindings[i].every((pos, j) => (pos < 0 || indices[j] <= pos))) {
                // out of order
                commonKeybindings.splice(i, 1);
                i--;
                continue;
            }
            for (let j = 0; j < contextList.length; j++) {
                if (0 <= commonKeybindings[i][j]) {
                    indices[j] = commonKeybindings[i][j] + 1;
                }
            }
        }
        // Reorder and unify keybindings.
        commonKeybindings.push(contextList.map(context => (dict.get(context) || []).length));
        indices = indices.fill(0);
        for (let i = 0; i < commonKeybindings.length; i++) {
            for (let j = 0; j < contextList.length; j++) {
                const pos = commonKeybindings[i][j];
                if (pos < 0) {
                    continue;
                }
                const context = contextList[j];
                const keybindings = dict.get(context) || [];
                const sliced = keybindings.slice(indices[j], pos);
                const converted = addKeybindingsContext(sliced, context);
                combined = combined.concat(converted);
                indices[j] = pos + 1;
            }
            if (i + 1 < commonKeybindings.length) {
                // unified keybinding
                const keybinding = dict.get(contextList[0])[commonKeybindings[i][0]];
                if (!commonKeybindings[i].every(pos => 0 <= pos)) {
                    // partial common keybindings (e.g. 'isWindows || isLinux')
                    const subset = commonKeybindings[i].map((pos, j) => (
                        0 <= pos ? contextList[j] : ''
                    )).filter(context => context !== '').join(' || ');
                    keybinding.when = addWhenContext(keybinding.when, subset);
                }
                combined.push(keybinding);
            }
        }
    }
    return combined;
}

module.exports = {
    addWhenContext,
    keybindingsContains,
    combineBaseKeybingings
};