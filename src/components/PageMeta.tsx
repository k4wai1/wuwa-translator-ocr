import { useEffect } from "react";

interface PageMetaProps {
  title: string;
  description: string;
  path?: string;
}

/** Lightweight document head manager (works with HashRouter on GitHub Pages). */
export function PageMeta({ title, description, path }: PageMetaProps) {
  useEffect(() => {
    document.title = title;
    let desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.name = "description";
      document.head.appendChild(desc);
    }
    desc.content = description;

    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = description;

    if (path) {
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `${window.location.origin}${window.location.pathname}#${path}`;
    }
  }, [title, description, path]);
  return null;
}
