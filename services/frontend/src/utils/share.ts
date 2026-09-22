/** Web Share with a clipboard fallback. Resolves to how it was shared. */
export const shareOrCopy = async (data: {
  title: string;
  text: string;
  url?: string;
}): Promise<'shared' | 'copied' | 'failed'> => {
  const payload = { title: data.title, text: data.text, url: data.url ?? window.location.href };
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(payload);
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(`${payload.text}\n${payload.url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
};

/** Builds an .ics file for "Save to calendar". */
export const buildIcs = (event: {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}): string => {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Eureka Hair App//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@eureka.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description)}`,
    `LOCATION:${escape(event.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

export const downloadText = (filename: string, content: string, type = 'text/calendar'): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
