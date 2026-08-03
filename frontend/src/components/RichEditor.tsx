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
import {
  apiUploadImage,
  apiUploadMediaProgress,
  apiVideoByLink,
} from "@/lib/api";
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
  const [emojiOpen, setEmojiOpen] = useState(false);

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

  /** Размер выделенного текста в точках.
   *
   *  Браузер сам умеет только «размеры 1–7», поэтому приём такой: помечаем
   *  выделение седьмым размером и тут же подменяем метку на точный размер.
   *  ВАЖНО: styleWithCSS выключаем — иначе Chrome ставит не <font size="7">,
   *  а span с «xx-large», метка не находится, и текст остаётся огромным
   *  независимо от выбранного числа. На всякий случай ловим оба варианта.
   */
  function setFontSize(px: number) {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand("fontSize", false, "7");
    const root = ref.current;
    if (!root) return;
    const marked = [
      ...root.querySelectorAll('font[size="7"]'),
      ...root.querySelectorAll<HTMLElement>('[style*="xx-large"]'),
    ];
    marked.forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      if (px >= 20) span.style.lineHeight = "1.35";
      while (node.firstChild) span.appendChild(node.firstChild);
      node.replaceWith(span);
    });
    sync();
  }

  function setColor(color: string) {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    sync();
  }

  function insertEmoji(emoji: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, emoji);
    sync();
    setEmojiOpen(false);
  }

  /** Ширина письма — 560 точек. Картинку шире надо ужать ЗАРАНЕЕ: почтовые
   *  клиенты (особенно Outlook) не понимают max-width и рисуют оригинал,
   *  разнося вёрстку. Поэтому ставим и атрибут width, и стиль. */
  const LETTER_WIDTH = 560;

  function insertImage(url: string) {
    const probe = new Image();
    const put = (w: number) => {
      const html =
        `<p style="margin:16px 0"><img src="${url}" alt="" width="${w}" ` +
        `style="width:${w}px;max-width:100%;height:auto;display:block;` +
        `border-radius:10px"></p><p><br></p>`;
      ref.current?.focus();
      document.execCommand("insertHTML", false, html);
      sync();
    };
    probe.onload = () =>
      put(Math.min(probe.naturalWidth || LETTER_WIDTH, LETTER_WIDTH));
    probe.onerror = () => put(LETTER_WIDTH);
    probe.src = url;
  }

  function addImageUrl() {
    const url = window.prompt("URL картинки:", "https://");
    if (url) insertImage(url.trim());
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    try {
      const { url } = await apiUploadImage(f);
      insertImage(url);
    } catch (err) {
      window.alert("Не удалось загрузить картинку: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function videoBlock(url: string, preview?: string) {
    // Почта не проигрывает видео (кроме Apple Mail), но GIF крутят все клиенты:
    // вставляем живую нарезку с кнопкой Play, клик — полное видео со звуком.
    return preview
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
  }

  async function addVideoLink() {
    const url = window.prompt(
      "Ссылка на видео (Kinescope или прямая ссылка на .mp4):",
      "https://kinescope.io/",
    );
    if (!url || url.trim() === "https://kinescope.io/") return;
    setUploading(true);
    setProgress(100); // файл не грузится — сразу режем превью
    try {
      const { url: link, preview } = await apiVideoByLink(url.trim());
      ref.current?.focus();
      document.execCommand("insertHTML", false, videoBlock(link, preview));
      sync();
    } catch (err) {
      window.alert("Не получилось: " + (err as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
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
      ref.current?.focus();
      document.execCommand("insertHTML", false, videoBlock(url, preview));
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

        {/* Размер текста */}
        <select
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) setFontSize(Number(e.target.value));
            e.target.value = "";
          }}
          title="Размер выделенного текста"
          className="h-7 rounded border border-line bg-bg px-1.5 text-xs text-ink focus:outline-none"
        >
          <option value="">Размер</option>
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="15">15 — обычный</option>
          <option value="16">16</option>
          <option value="18">18</option>
          <option value="20">20</option>
          <option value="24">24</option>
          <option value="28">28</option>
        </select>

        {/* Цвет текста */}
        <span className="ml-1 flex items-center gap-0.5">
          {[
            ["#092127", "чёрный"],
            ["#fb3501", "красный"],
            ["#43abd0", "голубой"],
            ["#1f9d55", "зелёный"],
            ["#98a2a6", "серый"],
          ].map(([color, label]) => (
            <button
              key={color}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColor(color)}
              title={`Цвет текста: ${label}`}
              aria-label={`Цвет текста: ${label}`}
              className="h-4 w-4 rounded-full border border-line transition-transform hover:scale-110"
              style={{ background: color }}
            />
          ))}
        </span>

        {/* Смайлы */}
        <span className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEmojiOpen((v) => !v)}
            title="Смайлы"
            className="ml-1 rounded px-1.5 py-1 text-base leading-none transition-colors hover:bg-surface"
          >
            🙂
          </button>
          {emojiOpen && (
            <div className="absolute left-0 top-9 z-20 w-64 rounded-lg border border-line bg-bg p-2 shadow-lg">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => insertEmoji(e)}
                    className="rounded p-1 text-lg leading-none transition-colors hover:bg-surface"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </span>
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
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addVideoLink}
          className="px-1.5 text-xs font-medium text-primary transition-colors hover:text-ink"
          title="Видео по ссылке из Кинескопа — ничего не загружая с компьютера"
        >
          из Кинескопа
        </button>
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

/** Смайлы под школьные письма: приветствия, учёба, эмоции, стрелки-указатели. */
const EMOJI = [
  "🙂", "😊", "😍", "🤩", "😉", "😅", "🥰", "🤗",
  "👋", "👍", "🙏", "💪", "✌️", "🤝", "👏", "🎉",
  "📚", "✏️", "📝", "🎓", "🗣️", "🎧", "🎬", "📅",
  "✅", "❗", "❓", "⚡", "🔥", "⭐", "💡", "🎁",
  "➡️", "⬇️", "▶️", "🕐", "💰", "🌙", "☕", "🐫",
];

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
