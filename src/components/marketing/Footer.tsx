export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <span className="text-sm font-bold tracking-[0.2em] text-foreground">OMTATVA DIGITALS</span>
        <p className="text-xs text-foreground-muted">&copy; {new Date().getFullYear()} Omtatva Digitals. All rights reserved.</p>
      </div>
    </footer>
  );
}
