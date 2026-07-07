"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  Loader2,
} from "lucide-react";
import { apiUploadImage } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * Простой WYSIWYG-редактор письма на contentEditable. Даёт HTML (для Brevo):
 * жирный / курсив / заголовок / список / ссылка / картинка (загрузка или URL).
 * Неуправляемый: начальное значение ставится один раз, дальше — onChange(html).
 */
export function RichEditor({
  onChange,
  disabled,
}: {
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function sync() {
    onChange(ref.current?.innerHTML ?? "");
  }

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    sync();
  }

  function addLink() {
    const url = window.prompt("Ссылка (адрес):", "https://");
    if (url) exec("createLink", url);
  }

  function addImageUrl() {
    const url = window.prompt("URL картинки:", "https://");
    if (url) exec("insertImage", url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const { url } = await apiUploadImage(f);
      exec("insertImage", url);
    } catch (err) {
      window.alert("Не удалось загрузить картинку: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-strong bg-bg">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1.5">
        <Btn onClick={() => exec("bold")} title="Жирный">
          <Bold size={15} />
        </Btn>
        <Btn onClick={() => exec("italic")} title="Курсив">
          <Italic size={15} />
        </Btn>
        <Btn onClick={() => exec("formatBlock", "h2")} title="Заголовок">
          <Heading size={15} />
        </Btn>
        <Btn onClick={() => exec("insertUnorderedList")} title="Список">
          <List size={15} />
        </Btn>
        <Btn onClick={addLink} title="Ссылка">
          <Link2 size={15} />
        </Btn>
        <span className="mx-1 h-5 w-px bg-line" />
        <Btn onClick={() => fileRef.current?.click()} title="Загрузить картинку">
          {uploading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ImageIcon size={15} />
          )}
          <span className="text-xs">Картинка</span>
        </Btn>
        <button
          type="button"
          onClick={addImageUrl}
          className="px-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          по ссылке
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={onFile}
        />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={sync}
        role="textbox"
        aria-multiline="true"
        data-placeholder="Здравствуйте! Рады сообщить, что открыт набор на новый поток…"
        className={cn(
          "email-editor min-h-[240px] px-3 py-3 text-sm leading-relaxed text-ink focus:outline-none",
        )}
      />
    </div>
  );
}

function Btn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // не даём редактору потерять фокус/выделение при клике на кнопку
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-muted transition-colors hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}
