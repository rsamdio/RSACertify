"use client";

import { useEffect, useReducer } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { DescFontSize, type DescFontSizeValue } from "@/lib/desc-font-size";
import { sanitizeDescriptionHtml, toEditorHtml } from "@/lib/rich-text";

type Props = {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`description-editor-btn${active ? " is-active" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function DescriptionEditor({ id, value, onChange, onFocus }: Props) {
  // TipTap does not re-render React on caret moves — bump so toolbar active states refresh.
  const [, bumpToolbar] = useReducer((n: number) => n + 1, 0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: false
      }),
      Underline,
      DescFontSize
    ],
    content: toEditorHtml(value),
    editorProps: {
      attributes: {
        id: id || "description-editor",
        class: "description-editor-surface",
        "aria-label": "Activity description"
      },
      transformPastedHTML(html) {
        return sanitizeDescriptionHtml(html);
      }
    },
    onUpdate: ({ editor: current }) => {
      onChange(sanitizeDescriptionHtml(current.getHTML()));
      bumpToolbar();
    },
    onSelectionUpdate: () => {
      bumpToolbar();
    },
    onTransaction: ({ transaction }) => {
      if (transaction.selectionSet || transaction.docChanged) {
        bumpToolbar();
      }
    },
    onFocus: () => {
      onFocus?.();
      bumpToolbar();
    }
  });

  // Sync external value when activity reloads (avoid wiping while typing).
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = toEditorHtml(value);
    const current = sanitizeDescriptionHtml(editor.getHTML());
    if (next === current) return;
    editor.commands.setContent(next || "", { emitUpdate: false });
    bumpToolbar();
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="description-editor is-loading">
        <p className="meta" style={{ margin: 0 }}>
          Loading editor…
        </p>
      </div>
    );
  }

  const size: DescFontSizeValue | null = editor.isActive("descFontSize", { size: "xl" })
    ? "xl"
    : editor.isActive("descFontSize", { size: "lg" })
      ? "lg"
      : null;

  return (
    <div className="description-editor">
      <div className="description-editor-toolbar" role="toolbar" aria-label="Description formatting">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="Strike"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <span className="description-editor-sep" aria-hidden />
        <ToolbarButton
          label="Normal"
          active={size === null}
          onClick={() => editor.chain().focus().unsetDescFontSize().run()}
        />
        <ToolbarButton
          label="Large"
          active={size === "lg"}
          onClick={() => editor.chain().focus().setDescFontSize("lg").run()}
        />
        <ToolbarButton
          label="Larger"
          active={size === "xl"}
          onClick={() => editor.chain().focus().setDescFontSize("xl").run()}
        />
        <span className="description-editor-sep" aria-hidden />
        <ToolbarButton
          label="Bullets"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbers"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
