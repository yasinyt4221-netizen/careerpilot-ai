import type { CSSProperties } from "react";

export function Rocket({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M15 25c-4-2-6-1-9 2l4-10 8-3M15 25c2 4 1 6-2 9l10-4 3-8" fill="#15745a"/><path d="M15 25C17 12 25 5 36 4c0 11-7 19-20 22l-1-1Z" fill="#0a684a"/><path d="m17 23 3 3C31 21 36 13 36 4c-3 10-9 16-19 19Z" fill="#278c70"/><circle cx="27" cy="13" r="4" fill="#fff"/><path d="M11 29c-5 0-7 3-7 7 4 0 7-2 7-7Z" fill="#21825c"/></svg>;
}

export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    missing: <><circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/></>,
    file: <><path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v6h5M8 13h8M8 17h6"/></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12"/><path d="M3 6h1M3 12h1M3 18h1"/></>,
    chart: <><path d="M4 20V11h4v9M10 20V6h4v14M16 20V3h4v17"/></>,
    bulb: <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/></>,
    location: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-5"/></>,
    play: <path d="m8 4 12 8-12 8V4Z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    edit: <><path d="m15 3 6 6-11 11-7 1 1-7L15 3Z"/><path d="m12 6 6 6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z"/>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2M12 17h.01"/></>,
    external: <><path d="M14 3h7v7M21 3l-10 10M10 3H4v17h17v-6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  };
  return <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg>;
}
