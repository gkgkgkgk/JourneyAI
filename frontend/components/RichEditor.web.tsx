import React, { useEffect } from 'react';
import { useAppColorScheme } from '@/context/JourneyContext';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Colors } from '@/constants/theme';

interface Props {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export default function RichEditor({ value, onChange, placeholder }: Props) {
    const colorScheme = useAppColorScheme();
    const theme = Colors[colorScheme ?? 'dark'];

    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
            UnderlineExt,
            Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
            Markdown.configure({ html: false, transformPastedText: true }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.storage.markdown.getMarkdown());
        },
    });

    // Sync when the parent swaps the value (e.g. selecting a different note)
    useEffect(() => {
        if (!editor) return;
        const current: string = editor.storage.markdown.getMarkdown();
        if (value !== current) {
            editor.commands.setContent(value || '');
        }
    }, [value, editor]);

    // Inject/refresh CSS whenever the theme changes
    useEffect(() => {
        const id = 'tiptap-editor-styles';
        let el = document.getElementById(id) as HTMLStyleElement | null;
        if (!el) {
            el = document.createElement('style');
            el.id = id;
            document.head.appendChild(el);
        }
        el.textContent = buildCSS(theme);
    }, [theme]);

    // Toolbar button — onMouseDown prevents the editor from losing focus
    const btn = (label: string, active: boolean, action: () => void, title: string) => (
        <button
            key={title}
            title={title}
            onMouseDown={(e) => { e.preventDefault(); action(); }}
            style={{
                padding: '4px 9px',
                borderRadius: 5,
                border: 'none',
                cursor: 'pointer',
                background: active ? theme.primary + '30' : 'transparent',
                color: active ? theme.primary : theme.secondary,
                fontSize: 13,
                fontWeight: 700,
                lineHeight: '1',
                fontFamily: 'inherit',
                transition: 'background 0.1s',
                userSelect: 'none',
            }}
        >
            {label}
        </button>
    );

    const sep = () => (
        <div style={{ width: 1, height: 16, background: theme.border, margin: '0 4px', flexShrink: 0 }} />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Formatting toolbar */}
            <div style={{
                display: 'flex', flexDirection: 'row', alignItems: 'center',
                flexWrap: 'wrap', gap: 2,
                padding: '6px 20px',
                background: theme.card,
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
            }}>
                {btn('B', editor?.isActive('bold') ?? false, () => editor?.chain().focus().toggleBold().run(), 'Bold')}
                {btn('I', editor?.isActive('italic') ?? false, () => editor?.chain().focus().toggleItalic().run(), 'Italic')}
                {btn('U', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run(), 'Underline')}
                {btn('S̶', editor?.isActive('strike') ?? false, () => editor?.chain().focus().toggleStrike().run(), 'Strikethrough')}
                {sep()}
                {btn('H1', editor?.isActive('heading', { level: 1 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), 'Heading 1')}
                {btn('H2', editor?.isActive('heading', { level: 2 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), 'Heading 2')}
                {btn('H3', editor?.isActive('heading', { level: 3 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), 'Heading 3')}
                {sep()}
                {btn('• —', editor?.isActive('bulletList') ?? false, () => editor?.chain().focus().toggleBulletList().run(), 'Bullet List')}
                {btn('1.', editor?.isActive('orderedList') ?? false, () => editor?.chain().focus().toggleOrderedList().run(), 'Numbered List')}
                {sep()}
                {btn('" "', editor?.isActive('blockquote') ?? false, () => editor?.chain().focus().toggleBlockquote().run(), 'Blockquote')}
                {btn('`—`', editor?.isActive('code') ?? false, () => editor?.chain().focus().toggleCode().run(), 'Inline Code')}
            </div>

            {/* Writing area */}
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

function buildCSS(theme: ReturnType<typeof Colors[keyof typeof Colors]>): string {
    return `
        .ProseMirror {
            outline: none;
            color: ${theme.text};
            font-family: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif;
            font-size: 16px;
            line-height: 1.8;
            padding: 24px 28px;
            min-height: 100%;
            box-sizing: border-box;
        }
        .ProseMirror h1 {
            font-size: 2em; font-weight: 700;
            margin: 0.2em 0 0.5em; line-height: 1.2;
            color: ${theme.text};
        }
        .ProseMirror h2 {
            font-size: 1.5em; font-weight: 700;
            margin: 0.2em 0 0.4em; line-height: 1.25;
            color: ${theme.text};
        }
        .ProseMirror h3 {
            font-size: 1.2em; font-weight: 600;
            margin: 0.2em 0 0.35em; line-height: 1.3;
            color: ${theme.text};
        }
        .ProseMirror p { margin: 0 0 0.6em; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror strong { font-weight: 700; }
        .ProseMirror em { font-style: italic; }
        .ProseMirror u { text-decoration: underline; text-underline-offset: 2px; }
        .ProseMirror s { text-decoration: line-through; }
        .ProseMirror ul, .ProseMirror ol {
            padding-left: 1.5em; margin: 0 0 0.6em;
        }
        .ProseMirror li { margin-bottom: 0.25em; }
        .ProseMirror li p { margin: 0; }
        .ProseMirror blockquote {
            border-left: 3px solid ${theme.primary};
            margin: 0.75em 0;
            padding: 0.4em 0 0.4em 1em;
            font-style: italic;
            color: ${theme.secondary};
        }
        .ProseMirror code {
            background: ${theme.border};
            color: ${theme.tint};
            padding: 0.15em 0.35em;
            border-radius: 4px;
            font-family: 'Fira Code', Consolas, monospace;
            font-size: 0.875em;
        }
        .ProseMirror pre {
            background: ${theme.border};
            padding: 0.8em 1em;
            border-radius: 8px;
            overflow-x: auto;
            margin: 0.75em 0;
        }
        .ProseMirror pre code {
            background: none; padding: 0; color: ${theme.text};
        }
        .ProseMirror hr {
            border: none;
            border-top: 1px solid ${theme.border};
            margin: 1.5em 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            color: ${theme.icon};
            pointer-events: none;
            float: left;
            height: 0;
        }
        .ProseMirror ::selection {
            background: ${theme.primary}35;
        }
    `;
}
