import { FileImage, FileText, FileVideo, FileAudio, FileArchive, File as FileIcon } from "lucide-react";

/** Picks an icon by content type — used anywhere a file renders without a generated thumbnail. */
export function FileTypeIcon({ contentType, className }: { contentType: string; className?: string }) {
  if (contentType.startsWith("image/")) return <FileImage className={className} />;
  if (contentType.startsWith("video/")) return <FileVideo className={className} />;
  if (contentType.startsWith("audio/")) return <FileAudio className={className} />;
  if (contentType.includes("zip") || contentType.includes("compressed")) return <FileArchive className={className} />;
  if (contentType.includes("pdf") || contentType.includes("text") || contentType.includes("document")) return <FileText className={className} />;
  return <FileIcon className={className} />;
}
