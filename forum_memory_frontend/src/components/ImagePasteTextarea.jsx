import React, { useRef, useState } from 'react';
import { uploadApi } from '../api/client';

/**
 * Textarea that supports pasting and dragging images.
 * Uploads images and inserts markdown ![image](url) at cursor position.
 */
export default function ImagePasteTextarea({ value, onChange, placeholder, style, ...rest }) {
  const textareaRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newValue = value.slice(0, start) + text + value.slice(end);
    onChange(newValue);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    });
  }

  async function handleFiles(files) {
    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return;

    setUploading(true);
    try {
      for (const file of images) {
        const result = await uploadApi.upload(file);
        insertAtCursor(`![${file.name || 'image'}](${result.url})\n`);
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        placeholder={placeholder}
        style={style}
        {...rest}
      />
      {uploading && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          fontSize: 12, color: 'var(--text-sec)',
          background: 'var(--surface)', padding: '2px 8px',
          borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        }}>
          上传中...
        </div>
      )}
    </div>
  );
}
