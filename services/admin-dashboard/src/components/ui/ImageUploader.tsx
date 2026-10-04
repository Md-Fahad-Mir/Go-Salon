import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Thumb } from './Thumb';

interface ImageUploaderProps {
  /** The picture as a data URL (or an https link); undefined when there is none. */
  value?: string;
  onChange: (image: string | undefined) => void;
  id?: string;
}

/** What the drop zone promises on its face. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];
/** Longest edge kept, in px. Ample for the app's try-on cards, and it keeps
    the stored data URL to a few hundred KB — the backend refuses a picture
    past ~1.5 MB of characters (`MAX_IMAGE_CHARS`, backend/Apps/common/images.py). */
const MAX_EDGE = 900;
const JPEG_QUALITY = 0.85;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = src;
  });

/** The file, scaled down and re-encoded as a JPEG data URL — the form the
    backend stores a picture in, since there is no upload endpoint. */
async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    // JPEG has no transparency, so a transparent PNG would otherwise go black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Picks an image, previews it, and hands the form the picture itself as a
    data URL — what the hairstyle's primary image is saved as, and what the
    app's try-on picker shows. */
export function ImageUploader({ value, onChange, id }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Use a PNG or JPG image.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That image is over 5 MB.');
      return;
    }
    setReading(true);
    try {
      onChange(await toDataUrl(file));
      setFileName(file.name);
    } catch {
      setError('That image could not be read. Try another file.');
    } finally {
      setReading(false);
      // Lets the same file be picked again after a removal.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (value) {
    return (
      <div className="stack-sm">
        <Thumb src={value} size="lg" />
        <div className="row-between">
          <span className="dim truncate" style={{ fontSize: '0.75rem' }}>{fileName ?? 'Current image'}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setFileName(undefined);
              onChange(undefined);
            }}
          >
            <X size={14} /> Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="uploader"
        data-drag={dragging}
        disabled={reading}
        aria-busy={reading || undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(event.dataTransfer.files?.[0]);
        }}
      >
        <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
        {reading ? (
          <span>Preparing image…</span>
        ) : (
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Click to upload</strong> or drag an image here
          </span>
        )}
        <span className="dim" style={{ fontSize: '0.75rem' }}>PNG or JPG · up to 5 MB</span>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(event) => void accept(event.target.files?.[0])}
      />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
