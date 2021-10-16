'use strict';

const CommandsToTest = {
    CursorDown: { command: 'cursorDown' },
    CursorDownSelect: { command: 'cursorDownSelect' },
    CursorLeft: { command: 'cursorLeft' },
    CursorLeftSelect: { command: 'cursorLeftSelect' },
    CursorRight: { command: 'cursorRight' },
    CursorRightSelect: { command: 'cursorRightSelect' },
    CursorUp: { command: 'cursorUp' },
    CursorUpSelect: { command: 'cursorUpSelect' },

    CursorBottom: { command: 'cursorBottom' },
    CursorBottomSelect: { command: 'cursorBottomSelect' },
    CursorTop: { command: 'cursorTop' },
    CursorTopSelect: { command: 'cursorTopSelect' },
    CursorEnd: { command: 'cursorEnd', args: { sticky: false } },
    CursorEndSelect: { command: 'cursorEndSelect', args: { sticky: false } },
    CursorHome: { command: 'cursorHome' },
    CursorHomeSelect: { command: 'cursorHomeSelect' },

    CancelSelection: { command: 'cancelSelection' },
    RemoveSecondaryCursors: { command: 'removeSecondaryCursors' },

    EditorActionSelectAll: { command: 'editor.action.selectAll' },

    Enter: { command: 'type', args: { text: '\n' } },
    Tab: { command: "tab" },

    DeleteLeft: { command: "deleteLeft" },
    DeleteRight: { command: "deleteRight" },
    DeleteWordLeft: { command: "deleteWordLeft" },
    DeleteWordRight: { command: "deleteWordRight" },
    Outdent: { command: 'outdent' },
    OutdentLines: { command: 'editor.action.outdentLines' },
    IndentLines: { command: 'editor.action.indentLines' },
    CommentLine: { command: "editor.action.commentLine", effect: ['edit', 'move'] },
    AddCommentLine: { command: "editor.action.addCommentLine", effect: ['edit', 'move'] },
    RemoveCommentLine: { command: "editor.action.removeCommentLine", effect: ['edit', 'move'] },
};

module.exports = { CommandsToTest };
