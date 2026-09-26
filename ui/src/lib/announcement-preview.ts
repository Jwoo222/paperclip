import { t as tNewUi } from "@/i18n";
import animatedHero from "../../../announcements/examples/animated/assets/78bafb6adbfd9da899cdbb5d934b4c0b9df5d419d6f0a5104a87a7b25dcc6bd8.html?raw";
import type { Announcement } from "@paperclipai/shared";

/** Design guide / Storybook only. Never a runtime feed fallback. */
export const announcementPreview: Announcement = {
  id: "preview-work-together",
  eyebrow: tNewUi("newUi.k0bd9c9564375"),
  title: tNewUi("newUi.k4e9241f6776c"),
  description: tNewUi("newUi.kc42c81b24ccb"),
  image: { path: `assets/${"0".repeat(64)}.png`, alt: tNewUi("newUi.kb9965c074c85") },
  secondaryLink: { kind: "external", label: tNewUi("newUi.k1445799c033a"), url: "https://paperclip.ing" },
  primaryAction: { kind: "route", label: tNewUi("newUi.k44b5675508a1"), path: "/projects" },
};

export const announcementAnimationPreview: Announcement = {
  ...announcementPreview,
  animation: { path: "assets/78bafb6adbfd9da899cdbb5d934b4c0b9df5d419d6f0a5104a87a7b25dcc6bd8.html", alt: tNewUi("newUi.k30348b941e7d") },
};
export const announcementAnimationPreviewSrc = `data:text/html;charset=utf-8,${encodeURIComponent(animatedHero)}`;
