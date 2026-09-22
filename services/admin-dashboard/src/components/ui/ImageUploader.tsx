import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface ImageUploaderProps {
  value?: string;
  onChange: (fileName: string | undefined) => void;
  id?: string;
}

/** Simulated upload: the file never leaves the browser, we just show a local
    object URL and hand the file name back to the form. */
export function ImageUploader({ value, onChange, id }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);

  const accept = (file: File | undefined) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    onChange(file.name);
  };

  if (value) {
    return (
      <div className="stack-sm">
        <div className="thumb thumb-lg">
          {preview ? (
            <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span className="thumb-art" />
          )}
        </div>
        <div className="row-between">
          <span className="dim truncate" style={{ fontSize: '0.75rem' }}>{value}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setPreview(undefined);
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
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
      >
        <ImagePlus size={22} strokeWidth={1.5} aria-hidden="true" />
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>Click to upload</strong> or drag an image here
        </span>
        <span className="dim" style={{ fontSize: '0.75rem' }}>PNG or JPG · up to 5 MB</span>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        onChange={(event) => accept(event.target.files?.[0])}
      />
    </>
  );
}
