/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

import type {
  LexicalEditor,
  RootNode,
  CommandListenerEditorPriority,
  TextFormatType,
  ElementFormatType,
} from 'lexical';
import type {InputEvents} from 'lexical-react/useLexicalEditorEvents';

import {$log, $getSelection, $getRoot, $isElementNode} from 'lexical';
import useLexicalEditorEvents from '../useLexicalEditorEvents';
import {HeadingNode} from 'lexical/HeadingNode';
import {ListNode} from 'lexical/ListNode';
import {QuoteNode} from 'lexical/QuoteNode';
import {CodeNode} from 'lexical/CodeNode';
import {ParagraphNode} from 'lexical/ParagraphNode';
import {ListItemNode} from 'lexical/ListItemNode';
import {$createParagraphNode} from 'lexical/ParagraphNode';
import {CAN_USE_BEFORE_INPUT} from 'shared/environment';
import useLexicalDragonSupport from './useLexicalDragonSupport';
import {
  onSelectionChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onCutForRichText,
  onCopyForRichText,
  onBeforeInput,
  onPasteForRichText,
  onDropPolyfill,
  onDragStartPolyfill,
  $onTextMutation,
  onInput,
  onClick,
  $shouldOverrideDefaultCharacterSelection,
} from 'lexical/events';
import {$moveCharacter} from 'lexical/selection';
import useLayoutEffect from 'shared/useLayoutEffect';
import withSubscriptions from 'lexical-react/withSubscriptions';

const EditorPriority: CommandListenerEditorPriority = 0;

const events: InputEvents = [
  ['selectionchange', onSelectionChange],
  ['keydown', onKeyDown],
  ['compositionstart', onCompositionStart],
  ['compositionend', onCompositionEnd],
  ['cut', onCutForRichText],
  ['copy', onCopyForRichText],
  ['dragstart', onDragStartPolyfill],
  ['paste', onPasteForRichText],
  ['input', onInput],
  ['click', onClick],
];

if (CAN_USE_BEFORE_INPUT) {
  events.push(['beforeinput', onBeforeInput]);
} else {
  events.push(['drop', onDropPolyfill]);
}

function shouldSelectParagraph(editor: LexicalEditor): boolean {
  const activeElement = document.activeElement;
  return (
    $getSelection() !== null ||
    (activeElement !== null && activeElement === editor.getRootElement())
  );
}

function initParagraph(root: RootNode, editor: LexicalEditor): void {
  const paragraph = $createParagraphNode();
  root.append(paragraph);
  if (shouldSelectParagraph(editor)) {
    paragraph.select();
  }
}

export function initEditor(editor: LexicalEditor): void {
  editor.update(() => {
    $log('initEditor');
    const root = $getRoot();
    const firstChild = root.getFirstChild();
    if (firstChild === null) {
      initParagraph(root, editor);
    }
  });
}

function clearEditor(
  editor: LexicalEditor,
  callbackFn?: (callbackFn?: () => void) => void,
): void {
  editor.update(
    () => {
      $log('clearEditor');
      const root = $getRoot();
      root.clear();
      initParagraph(root, editor);
    },
    {
      onUpdate: callbackFn,
    },
  );
}

export function useRichTextSetup(
  editor: LexicalEditor,
  init: boolean,
): (
  editor: LexicalEditor,
  callbackFn?: (callbackFn?: () => void) => void,
) => void {
  useLayoutEffect(() => {
    const removeSubscriptions = withSubscriptions(
      editor.registerNodes([
        HeadingNode,
        ListNode,
        QuoteNode,
        CodeNode,
        ParagraphNode,
        ListItemNode,
      ]),
      editor.addListener('textmutation', $onTextMutation),
      editor.addListener(
        'command',
        (type, payload): boolean => {
          const selection = $getSelection();
          if (selection === null) {
            return false;
          }
          switch (type) {
            case 'deleteCharacter': {
              const isBackward: boolean = payload;
              selection.deleteCharacter(isBackward);
              return true;
            }
            case 'deleteWord': {
              const isBackward: boolean = payload;
              selection.deleteWord(isBackward);
              return true;
            }
            case 'deleteLine': {
              const isBackward: boolean = payload;
              selection.deleteLine(isBackward);
              return true;
            }
            case 'insertText':
              const text: string = payload;
              selection.insertText(text);
              return true;
            case 'removeText':
              selection.removeText();
              return true;
            case 'formatText': {
              const format: TextFormatType = payload;
              selection.formatText(format);
              return true;
            }
            case 'formatElement': {
              const format: ElementFormatType = payload;
              const node = selection.anchor.getNode();
              const element = $isElementNode(node)
                ? node
                : node.getParentOrThrow();
              element.setFormat(format);
              return true;
            }
            case 'insertLineBreak':
              const selectStart: boolean = payload;
              selection.insertLineBreak(selectStart);
              return true;
            case 'insertParagraph':
              selection.insertParagraph();
              return true;
            case 'indentContent': {
              // Handle code blocks
              const anchor = selection.anchor;
              const parentBlock =
                anchor.type === 'element'
                  ? anchor.getNode()
                  : anchor.getNode().getParentOrThrow();
              if (parentBlock.canInsertTab()) {
                editor.execCommand('insertText', '\t');
              } else {
                if (parentBlock.getIndent() !== 10) {
                  parentBlock.setIndent(parentBlock.getIndent() + 1);
                }
              }
              return true;
            }
            case 'outdentContent': {
              // Handle code blocks
              const anchor = selection.anchor;
              const anchorNode = anchor.getNode();
              const parentBlock =
                anchor.type === 'element'
                  ? anchor.getNode()
                  : anchor.getNode().getParentOrThrow();
              if (parentBlock.canInsertTab()) {
                const textContent = anchorNode.getTextContent();
                const character = textContent[anchor.offset - 1];
                if (character === '\t') {
                  editor.execCommand('deleteCharacter', true);
                }
              } else {
                if (parentBlock.getIndent() !== 0) {
                  parentBlock.setIndent(parentBlock.getIndent() - 1);
                }
              }
              return true;
            }
            case 'keyArrowLeft': {
              const event: KeyboardEvent = payload;
              const isHoldingShift = event.shiftKey;
              if ($shouldOverrideDefaultCharacterSelection(selection, true)) {
                event.preventDefault();
                $moveCharacter(selection, isHoldingShift, true);
                return true;
              }
              return false;
            }
            case 'keyArrowRight': {
              const event: KeyboardEvent = payload;
              const isHoldingShift = event.shiftKey;
              if ($shouldOverrideDefaultCharacterSelection(selection, false)) {
                event.preventDefault();
                $moveCharacter(selection, isHoldingShift, false);
                return true;
              }
              return false;
            }
            case 'keyBackspace': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand('deleteCharacter', true);
            }
            case 'keyDelete': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand('deleteCharacter', false);
            }
            case 'keyEnter': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              if (event.shiftKey) {
                return editor.execCommand('insertLineBreak');
              }
              return editor.execCommand('insertParagraph');
            }
            case 'keyTab': {
              const event: KeyboardEvent = payload;
              event.preventDefault();
              return editor.execCommand(
                event.shiftKey ? 'outdentContent' : 'indentContent',
              );
            }
          }
          return false;
        },
        EditorPriority,
      ),
    );

    if (init) {
      initEditor(editor);
    }

    return removeSubscriptions;
  }, [editor, init]);

  useLexicalEditorEvents(events, editor);
  useLexicalDragonSupport(editor);

  return clearEditor;
}