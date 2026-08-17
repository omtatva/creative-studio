import { ColorRoles } from "@/types/theme.types";

function rgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

/**
 * Renders a mini mockup (sidebar/navbar/card/buttons/status badges)
 * using the DRAFT colors directly via inline styles — never the
 * global CSS variables — so edits preview instantly here without
 * touching the rest of the app until "Save Theme" is clicked.
 */
export function BrandingLivePreview({ colors }: { colors: ColorRoles }) {
  return (
    <div className="overflow-hidden rounded-theme border border-border shadow-soft-lg" style={{ backgroundColor: rgba(colors.background.hex, colors.background.opacity) }}>
      <div className="flex h-9 items-center gap-2 border-b px-3" style={{ backgroundColor: rgba(colors.navbar.hex, colors.navbar.opacity), borderColor: rgba(colors.borders.hex, colors.borders.opacity) }}>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rgba(colors.primary.hex, colors.primary.opacity) }} />
        <div className="h-2 w-20 rounded" style={{ backgroundColor: rgba(colors.text.hex, 15) }} />
      </div>
      <div className="flex">
        <div className="flex w-14 flex-col gap-2 border-r p-2" style={{ backgroundColor: rgba(colors.sidebar.hex, colors.sidebar.opacity), borderColor: rgba(colors.borders.hex, colors.borders.opacity) }}>
          {[colors.primary, colors.secondary, colors.accent].map((c, i) => (
            <div key={i} className="h-2 w-full rounded" style={{ backgroundColor: rgba(c.hex, 40) }} />
          ))}
        </div>
        <div className="flex-1 p-3">
          <div className="rounded-theme border p-2.5" style={{ backgroundColor: rgba(colors.cards.hex, colors.cards.opacity), borderColor: rgba(colors.borders.hex, colors.borders.opacity) }}>
            <div className="mb-2 h-2 w-2/3 rounded" style={{ backgroundColor: rgba(colors.text.hex, 80) }} />
            <div className="mb-3 h-2 w-1/2 rounded" style={{ backgroundColor: rgba(colors.text.hex, 30) }} />
            <div
              className="inline-block rounded px-2.5 py-1 text-[10px] font-medium text-white"
              style={{ backgroundColor: rgba(colors.buttons.hex, colors.buttons.opacity) }}
            >
              Button
            </div>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: rgba(colors.success.hex, 15), color: colors.success.hex }}>Success</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: rgba(colors.warning.hex, 15), color: colors.warning.hex }}>Warning</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: rgba(colors.error.hex, 15), color: colors.error.hex }}>Error</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: rgba(colors.info.hex, 15), color: colors.info.hex }}>Info</span>
          </div>
        </div>
      </div>
    </div>
  );
}
