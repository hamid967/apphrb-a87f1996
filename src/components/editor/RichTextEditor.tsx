import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sanitiseRichHtml } from "@/lib/sanitize-rich";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Undo2,
  Redo2,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";

type Dir = "rtl" | "ltr";

interface Props {
  value: string;
  onChange: (html: string) => void;
  dir: Dir;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

function ToolbarBtn({
  editor,
  active,
  onClick,
  label,
  children,
}: {
  editor: Editor;
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="sm"
      aria-label={label}
      title={label}
      className="h-8 w-8 p-0"
      onClick={onClick}
      disabled={!editor.isEditable}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  dir,
  placeholder,
  className,
  maxLength = 30_000,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        defaultAlignment: dir === "rtl" ? "right" : "left",
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        dir,
        class: cn(
          "prose prose-sm max-w-none min-h-[180px] px-3 py-2 focus:outline-none",
          "dark:prose-invert leading-relaxed",
          dir === "rtl" ? "text-right" : "text-left",
        ),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": placeholder ?? "rich text editor",
      },
      // Sanitise any HTML fragment coming from the clipboard BEFORE ProseMirror
      // parses it into the document — blocks <script>, <img onerror>, javascript:
      // hrefs, style injections, and every non-whitelisted tag/attribute.
      transformPastedHTML: (html) => sanitiseRichHtml(html),
      handleKeyDown: (_v, event) => {
        // Enforce a soft max length by blocking new printable input at the limit.
        if (!editor) return false;
        const html = editor.getHTML();
        if (
          html.length >= maxLength &&
          event.key.length === 1 &&
          !event.metaKey &&
          !event.ctrlKey
        ) {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep external value in sync (e.g. preset applied) without breaking cursor on identical content.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  // React to dir changes (language toggle).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("dir", dir);
    dom.classList.toggle("text-right", dir === "rtl");
    dom.classList.toggle("text-left", dir === "ltr");
  }, [dir, editor]);

  if (!editor) {
    return (
      <div
        className={cn("rounded-md border border-input bg-background min-h-[220px]", className)}
      />
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(
      dir === "rtl" ? "الرابط (اتركه فارغاً للإزالة)" : "URL (leave empty to remove)",
      prev ?? "",
    );
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    try {
      const safe = new URL(url).toString();
      editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    } catch {
      /* invalid URL — ignore */
    }
  };

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div
        className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1"
        dir="ltr"
        role="toolbar"
        aria-label="Formatting"
      >
        <ToolbarBtn
          editor={editor}
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn
          editor={editor}
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn
          editor={editor}
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn
          editor={editor}
          label="Align start"
          active={editor.isActive({ textAlign: dir === "rtl" ? "right" : "left" })}
          onClick={() =>
            editor
              .chain()
              .focus()
              .setTextAlign(dir === "rtl" ? "right" : "left")
              .run()
          }
        >
          <AlignLeft className={cn("h-4 w-4", dir === "rtl" && "scale-x-[-1]")} />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Center"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Align end"
          active={editor.isActive({ textAlign: dir === "rtl" ? "left" : "right" })}
          onClick={() =>
            editor
              .chain()
              .focus()
              .setTextAlign(dir === "rtl" ? "left" : "right")
              .run()
          }
        >
          <AlignRight className={cn("h-4 w-4", dir === "rtl" && "scale-x-[-1]")} />
        </ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn editor={editor} label="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarBtn
          editor={editor}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
      <div
        className="flex justify-between border-t border-border px-3 py-1 text-xs text-muted-foreground"
        dir={dir}
      >
        <span>{dir === "rtl" ? "محرر نصي غني" : "Rich text editor"}</span>
        <span>
          {editor.storage.characterCount?.characters?.() ?? editor.getText().length} / {maxLength}
        </span>
      </div>
    </div>
  );
}

export default RichTextEditor;
