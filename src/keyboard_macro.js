'use strict';
const vscode = require('vscode');
const { CommandSequence } = require('./command_sequence.js');
const { EndOfFileDetector } = require('./end_of_file_detector.js');
const reentrantGuard = require('./reentrant_guard.js');
const util = require('./util.js');

const KeyboardMacro = function({ awaitController }) {
    const RecordingStateReason = {
        Start: 0,
        Cancel: 1,
        Finish: 2
    };
    const PlaybackStateReason = {
        Start: 0,
        Abort: 1,
        Finish: 2
    };

    let onChangeRecordingStateCallback = null;
    let onChangePlaybackStateCallback = null;
    let onBeginWrappedCommandCallback = null;
    let onEndWrappedCommandCallback = null;
    let showInputBox = vscode.window.showInputBox; // replaceable for testing
    let recording = false;
    let playing = false;
    let shouldAbortPlayback = false;
    const sequence = CommandSequence();
    const internalCommands = new Map();

    const onChangeRecordingState = function(callback) {
        onChangeRecordingStateCallback = callback;
    };
    const changeRecordingState = function(newState, reason) {
        recording = newState;
        if (onChangeRecordingStateCallback) {
            onChangeRecordingStateCallback({ recording, reason });
        }
    };
    const onChangePlaybackState = function(callback) {
        onChangePlaybackStateCallback = callback;
    };
    const changePlaybackState = function(newState, reason) {
        playing = newState;
        if (onChangePlaybackStateCallback) {
            onChangePlaybackStateCallback({ playing, reason });
        }
    };
    const onBeginWrappedCommand = function(callback) {
        onBeginWrappedCommandCallback = callback;
    };
    const onEndWrappedCommand = function(callback) {
        onEndWrappedCommandCallback = callback;
    };

    const setShowInputBox = function(showInputBoxImpl) {
        const old = showInputBox;
        showInputBox = showInputBoxImpl;
        return old;
    };

    const registerInternalCommand = function(name, func) {
        internalCommands[name] = func;
    };

    const startRecording = reentrantGuard.makeGuardedCommandSync(function() {
        if (!recording) {
            sequence.clear();
            changeRecordingState(true, RecordingStateReason.Start);
        }
    });
    const cancelRecording = reentrantGuard.makeGuardedCommandSync(function() {
        if (recording) {
            sequence.clear();
            changeRecordingState(false, RecordingStateReason.Cancel);
        }
    });
    const finishRecording = reentrantGuard.makeGuardedCommandSync(function() {
        if (recording) {
            sequence.optimize();
            changeRecordingState(false, RecordingStateReason.Finish);
        }
    });

    const push = function(spec) {
        if (recording) {
            sequence.push(spec);
        }
    };

    const invokeCommand = async function(spec) {
        const func = internalCommands[spec.command];
        if (func !== undefined) {
            await func(spec.args);
        } else {
            await vscode.commands.executeCommand(
                spec.command,
                spec.args
            );
        }
    };

    const invokeCommandSync = async function(spec, context) {
        let ok = true;
        const promise = awaitController.waitFor(spec['await'] || '').catch(() => {});
        try {
            await invokeCommand(spec);
        } catch(error) {
            ok = false;
            console.error(error);
            console.info('kb-macro: Error in ' + context + ': ' + JSON.stringify(spec));
        } finally {
            await promise;
        }
        return ok;
    };

    const validatePlaybackArgs = function(args) {
        args = (args && typeof(args) === 'object') ? args : {};
        const validArgs = {};
        if ('repeat' in args && typeof(args.repeat) === 'number') {
            validArgs.repeat = args.repeat;
        }
        if ('sequence' in args && Array.isArray(args.sequence)) {
            const sequence = args.sequence.map(spec => util.makeCommandSpec(spec));
            if (sequence.includes(null)) {
                console.error('kb-macro: Invalid sequence option: ' + JSON.stringify(args.sequence));
            } else {
                validArgs.sequence = sequence;
            }
        }
        return validArgs;
    };

    const playbackImpl = async function(args, { tillEndOfFile = false } = {}) {
        if (recording) {
            return;
        }
        try {
            changePlaybackState(true, PlaybackStateReason.Start);
            shouldAbortPlayback = false;
            args = validatePlaybackArgs(args);
            const repeat = 'repeat' in args ? args.repeat : 1;
            const commands = sequence.get();
            let endOfFileDetector;
            if (tillEndOfFile) {
                endOfFileDetector = EndOfFileDetector(vscode.window.activeTextEditor);
            }
            let ok = true;
            for (let k = 0; k < repeat || tillEndOfFile; k++) {
                for (const spec of commands) {
                    ok = await invokeCommandSync(spec, 'playback');
                    if (!ok || shouldAbortPlayback) {
                        break;
                    }
                }
                if (!ok || shouldAbortPlayback) {
                    break;
                }
                if (tillEndOfFile) {
                    if (endOfFileDetector.reachedEndOfFile()) {
                        break;
                    }
                }
            }
        } finally {
            const reason = shouldAbortPlayback ?
                PlaybackStateReason.Abort :
                PlaybackStateReason.Finish;
            changePlaybackState(false, reason);
            shouldAbortPlayback = false;
        }
    };
    const playback = reentrantGuard.makeGuardedCommand(args => playbackImpl(args));

    const abortPlayback = async function() {
        if (playing) {
            shouldAbortPlayback = true;
        }
    };

    const repeatPlayback = reentrantGuard.makeGuardedCommand(async function() {
        if (recording) {
            return;
        }
        const input = await showInputBox({
            prompt: 'Input the number of times to repeat the macro',
            validateInput: util.validatePositiveIntegerInput
        });
        if (input) {
            const args = {
                repeat: Number(input)
            };
            await playbackImpl(args);
        }
    });

    const repeatPlaybackTillEndOfFile = reentrantGuard.makeGuardedCommand(async function() {
        const args = {};
        const option = { tillEndOfFile: true };
        await playbackImpl(args, option);
    });

    // WrapQueueSize
    // independently adjustable value.
    // min value is 1.
    // greater value reduces input rejection. 2 or 3 is enough.
    // greater value leads to too many queued and delayed command execution.
    // See: https://github.com/tshino/vscode-kb-macro/pull/32
    const WrapQueueSize = 2;
    const wrap = reentrantGuard.makeQueueableCommand(async function(args) {
        if (recording) {
            const spec = util.makeCommandSpec(args);
            if (!spec) {
                return;
            }
            if (onBeginWrappedCommandCallback) {
                onBeginWrappedCommandCallback();
            }
            try {
                const ok = await invokeCommandSync(spec, 'wrap');
                if (ok) {
                    push(spec);
                }
            } finally {
                if (onEndWrappedCommandCallback) {
                    onEndWrappedCommandCallback();
                }
            }
        }
    }, { queueSize: WrapQueueSize });

    return {
        RecordingStateReason,
        PlaybackStateReason,
        onChangeRecordingState,
        onChangePlaybackState,
        onBeginWrappedCommand,
        onEndWrappedCommand,
        registerInternalCommand,
        startRecording,
        cancelRecording,
        finishRecording,
        push,
        validatePlaybackArgs,
        playback,
        abortPlayback,
        repeatPlayback,
        repeatPlaybackTillEndOfFile,
        wrap,

        // testing purpose only
        isRecording: () => { return recording; },
        isPlaying: () => { return playing; },
        getCurrentSequence: () => { return sequence.get(); },
        setShowInputBox,
        WrapQueueSize
    };
};

module.exports = { KeyboardMacro };
