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
  Video,
} from "lucide-react";
import { apiUploadImage, apiUploadMediaProgress } from "@/lib/api";
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
  const videoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

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

  async function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const mb = f.size / 1_000_000;
    if (mb > 50) {
      window.alert(
        `Видео весит ${mb.toFixed(0)} МБ, а больше 50 МБ письмо не принимает.\n\n` +
          "Обрежь ролик покороче или сожми (например, в «Фото» на телефоне " +
          "выбери меньшее качество при отправке).",
      );
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const { url, preview } = await apiUploadMediaProgress(f, setProgress);
      // Почта не проигрывает видео (кроме Apple Mail), но GIF крутят все клиенты:
      // вставляем живую нарезку с кнопкой Play, клик — полное видео со звуком.
      const block = preview
        ? `<p style="margin:18px 0 6px"><a href="${url}" target="_blank" rel="noopener">` +
          `<img src="${preview}" alt="Смотреть видео" width="480" ` +
          `style="max-width:100%;height:auto;border-radius:12px;display:block"></a></p>` +
          `<p style="margin:0 0 18px;font-size:13px"><a href="${url}" target="_blank" ` +
          `rel="noopener" style="color:#43abd0;font-weight:600;text-decoration:none">` +
          `▶ Смотреть видео целиком, со звуком</a></p><p><br></p>`
        : `<p><a href="${url}" target="_blank" rel="noopener" ` +
          `style="display:inline-block;padding:10px 16px;background:#43abd0;` +
          `color:#fff;border-radius:8px;text-decoration:none;font-weight:600">` +
          `▶ Смотреть видео</a></p><p><br></p>`;
      ref.current?.focus();
      document.execCommand("insertHTML", false, block);
      sync();
    } catch (err) {
      const pct = progress;
      window.alert(
        "Не удалось загрузить видео.\n\n" +
          (err as Error).message +
          (pct > 0 && pct < 100
            ? `\n\nОборвалось на ${pct}% — значит, связь не выдержала. ` +
              "Попробуй ещё раз или возьми ролик полегче."
            : ""),
      );
    } finally {
      setUploading(false);
      setProgress(0);
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
        <Btn
          onClick={() => videoRef.current?.click()}
          title="Загрузить видео — в письмо ляжет живое превью, клик открывает полное"
        >
          {uploading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Video size={15} />
          )}
          <span className="text-xs">Видео</span>
        </Btn>
        {uploading && (
          <span className="ml-1 text-xs tabular-nums text-muted">
            {progress >= 100
              ? "готовим превью…"
              : progress > 0
                ? `загрузка ${progress}%`
                : "загрузка…"}
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={onFile}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
          className="hidden"
          onChange={onVideoFile}
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
