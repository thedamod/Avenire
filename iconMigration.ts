#!/usr/bin/env npx tsx
/**
 * migrate-to-phosphor.ts
 * Migrates lucide-react imports to @phosphor-icons/react
 *
 * Usage:
 *   npx tsx migrate-to-phosphor.ts [dir]
 *   npx tsx migrate-to-phosphor.ts ./src
 *
 * Flags:
 *   --dry-run   Preview changes without writing files
 *   --weight    Default Phosphor weight to inject (default: none — uses Phosphor default)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Lucide → Phosphor name map
// Names that are identical don't need an entry — they're handled automatically.
// Only add entries where the names actually differ.
// ---------------------------------------------------------------------------
const NAME_MAP: Record<string, string | null> = {
  // Lucide name          → Phosphor name (null = no equivalent, needs manual review)
  AlertCircle:              "Warning", AlertOctagon:             "WarningOctagon", AlertTriangle:            "Warning", ArrowBigDown:             "ArrowFatDown", ArrowBigLeft:             "ArrowFatLeft", ArrowBigRight:            "ArrowFatRight", ArrowBigUp:               "ArrowFatUp", ArrowBigDownDash:         "ArrowFatLineDown", ArrowBigUpDash:           "ArrowFatLineUp", Asterisk:                 "Asterisk", BadgeCheck:               "SealCheck", BadgeAlert:               "SealWarning", BadgeX:                   "SealWarning", Ban:                      "Prohibit", Bell:                     "Bell", BellOff:                  "BellSlash", BookMarked:               "BookBookmark", BookOpen:                 "BookOpen", Bookmark:                 "Bookmark", BookmarkCheck:            "BookmarkSimple", BrainCircuit:             "Brain", Building:                 "Buildings", Building2:                "Building", CalendarCheck:            "CalendarCheck", CalendarClock:            "CalendarClock", CalendarDays:             "CalendarDots", CalendarX:                "CalendarX", Check:                    "Check", CheckCheck:               "ChecksFat", CheckCircle:              "CheckCircle", CheckCircle2:             "CheckCircle", CheckSquare:              "CheckSquare", ChevronDown:              "CaretDown", ChevronLeft:              "CaretLeft", ChevronRight:             "CaretRight", ChevronUp:                "CaretUp", ChevronsDown:             "CaretDoubleDown", ChevronsLeft:             "CaretDoubleLeft", ChevronsRight:            "CaretDoubleRight", ChevronsUp:               "CaretDoubleUp", ChevronsUpDown:           "CaretUpDown", Circle:                   "Circle", CircleDot:                "CircleDashed", CircleOff:                "CircleNotch", Clipboard:                "Clipboard", ClipboardCheck:           "ClipboardText", ClipboardCopy:            "ClipboardText", ClipboardList:            "ClipboardText", Clock:                    "Clock", Clock1:                   "Clock", Clock2:                   "Clock", Cloud:                    "Cloud", CloudDownload:            "CloudArrowDown", CloudUpload:              "CloudArrowUp", Code:                     "Code", Code2:                    "CodeSimple", Codesandbox:              null, // brand icon, use SVG
  Columns:                  "Columns", Command:                  "Command", Copy:                     "Copy", CornerDownLeft:           "ArrowBendDownLeft", CornerDownRight:          "ArrowBendDownRight", CornerUpLeft:             "ArrowBendUpLeft", CornerUpRight:            "ArrowBendUpRight", CreditCard:               "CreditCard", Crop:                     "Crop", Database:                 "Database", Delete:                   "Backspace", Dot:                      "Dot", Download:                 "DownloadSimple", Edit:                     "PencilSimple", Edit2:                    "Pencil", Edit3:                    "NotePencil", ExternalLink:             "ArrowSquareOut", Eye:                      "Eye", EyeOff:                   "EyeSlash", File:                     "File", FileCheck:                "FileText", FileCode:                 "FileCode", FilePlus:                 "FilePlus", FileText:                 "FileText", FileX:                    "FileX", Filter:                   "Funnel", FolderOpen:               "FolderOpen", FolderPlus:               "FolderPlus", Forward:                  "ShareFat", Gauge:                    "Gauge", Github:                   null, // brand icon, use SVG
  Globe:                    "Globe", Globe2:                   "GlobeHemisphereWest", GraduationCap:            "GraduationCap", Grid:                     "GridFour", HardDrive:                "HardDrive", Hash:                     "Hash", Heart:                    "Heart", HeartOff:                 "HeartBreak", HelpCircle:               "Question", Home:                     "House", Image:                    "Image", ImageOff:                 "ImageBroken", Inbox:                    "Tray", Info:                     "Info", Key:                      "Key", Laptop:                   "Laptop", LayoutDashboard:          "SquaresFour", LayoutGrid:               "GridFour", LayoutList:               "List", Layers:                   "Stack", Link:                     "Link", Link2:                    "LinkSimple", Link2Off:                 "LinkSimpleBreak", List:                     "List", ListChecks:               "ListChecks", Loader:                   "CircleNotch", Loader2:                  "SpinnerGap", Lock:                     "Lock", LockOpen:                 "LockOpen", LogIn:                    "SignIn", LogOut:                   "SignOut", Mail:                     "Envelope", MailOpen:                 "EnvelopeOpen", Map:                      "MapTrifold", MapPin:                   "MapPin", Maximize:                 "ArrowsOut", Maximize2:                "ArrowsOutSimple", Menu:                     "List", MessageCircle:            "ChatCircle", MessageSquare:            "ChatSquare", Mic:                      "Microphone", MicOff:                   "MicrophoneSlash", Minimize:                 "ArrowsIn", Minimize2:                "ArrowsInSimple", Minus:                    "Minus", MinusCircle:              "MinusCircle", Moon:                     "Moon", MoreHorizontal:           "DotsThree", MoreVertical:             "DotsThreeVertical", Move:                     "ArrowsOutCardinal", Music:                    "MusicNote", Navigation:               "NavigationArrow", Network:                  "Graph", Newspaper:                "Newspaper", Paperclip:                "Paperclip", Pause:                    "Pause", PauseCircle:              "PauseCircle", Pencil:                   "Pencil", PenLine:                  "PenNib", Percent:                  "Percent", Phone:                    "Phone", PhoneCall:                "PhoneCall", PhoneOff:                 "PhoneSlash", Pin:                      "PushPin", Play:                     "Play", PlayCircle:               "PlayCircle", Plus:                     "Plus", PlusCircle:               "PlusCircle", Power:                    "Power", Printer:                  "Printer", RefreshCcw:               "ArrowCounterClockwise", RefreshCw:                "ArrowClockwise", Repeat:                   "Repeat", RotateCcw:                "ArrowCounterClockwise", RotateCw:                 "ArrowClockwise", Rss:                      "RssSimple", Save:                     "FloppyDisk", Scan:                     "Scan", Search:                   "MagnifyingGlass", Send:                     "PaperPlaneTilt", Settings:                 "Gear", Settings2:                "SlidersHorizontal", Share:                    "Share", Share2:                   "ShareNetwork", Shield:                   "Shield", ShieldCheck:              "ShieldCheck", ShieldOff:                "ShieldSlash", ShoppingCart:             "ShoppingCart", Sidebar:                  "Sidebar", SidebarClose:             "SidebarSimple", SidebarOpen:              "SidebarSimple", SkipBack:                 "SkipBack", SkipForward:              "SkipForward", Slash:                    "Divide", Sliders:                  "SlidersHorizontal", SlidersHorizontal:        "SlidersHorizontal", Smartphone:               "DeviceMobile", SortAsc:                  "SortAscending", SortDesc:                 "SortDescending", Sparkles:                 "Sparkle", Speaker:                  "SpeakerHigh", Square:                   "Square", Star:                     "Star", StarOff:                  "StarSlash", StopCircle:               "StopCircle", Sun:                      "Sun", SunMoon:                  "CloudSun", Syringe:                  "Syringe", Table:                    "Table", Table2:                   "Table", Tag:                      "Tag", Terminal:                 "Terminal", ThumbsDown:               "ThumbsDown", ThumbsUp:                 "ThumbsUp", Timer:                    "Timer", ToggleLeft:               "ToggleLeft", ToggleRight:              "ToggleRight", Trash:                    "Trash", Trash2:                   "Trash", TrendingDown:             "TrendDown", TrendingUp:               "TrendUp", Triangle:                 "Triangle", Trophy:                   "Trophy", Upload:                   "UploadSimple", User:                     "User", UserCheck:                "UserCheck", UserMinus:                "UserMinus", UserPlus:                 "UserPlus", UserX:                    "UserX", Users:                    "Users", Video:                    "Video", VideoOff:                 "VideoCamera", Volume:                   "SpeakerSimpleLow", Volume1:                  "SpeakerSimpleLow", Volume2:                  "SpeakerSimpleHigh", VolumeX:                  "SpeakerSimpleSlash", Wallet:                   "Wallet", Wifi:                     "WifiHigh", WifiOff:                  "WifiSlash", X:                        "X", XCircle:                  "XCircle", XOctagon:                 "XOctagon", XSquare:                  "XSquare", ZoomIn:                   "MagnifyingGlassPlus", ZoomOut:                  "MagnifyingGlassMinus", };

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const WEIGHT = (() => {
  const i = args.indexOf("--weight");
  return i !== -1 ? args[i + 1] : null;
})();
const TARGET_DIR = args.find((a) => !a.startsWith("--")) ?? "./src";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      results.push(...walk(full));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function mapName(lucideName: string): { phosphor: string; status: "mapped" | "identical" | "missing" } {
  if (lucideName in NAME_MAP) {
    const phosphor = NAME_MAP[lucideName];
    if (phosphor === null) return { phosphor: lucideName, status: "missing" };
    return { phosphor, status: "mapped" };
  }
  // Assume identical name
  return { phosphor: lucideName, status: "identical" };
}

// ---------------------------------------------------------------------------
// Per-file migration
// ---------------------------------------------------------------------------
interface FileResult {
  file: string;
  changed: boolean;
  mapped: string[];
  identical: string[];
  missing: string[];
}

function migrateFile(filePath: string): FileResult {
  const source = fs.readFileSync(filePath, "utf8");
  const result: FileResult = { file: filePath, changed: false, mapped: [], identical: [], missing: [] };

  // Match all lucide-react import statements (named imports only)
  // e.g. import { Home, MagnifyingGlass as Search, Warning as Alert } from "@phosphor-icons/react"
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g;

  let newSource = source;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const rawNames = match[1];

    // Parse individual names (handle aliases: OriginalName as Alias)
    const names = rawNames.split(",").map((n) => n.trim()).filter(Boolean);

    const phosphorNames: string[] = [];

    for (const nameEntry of names) {
      const aliasParts = nameEntry.split(/\s+as\s+/);
      const lucideName = aliasParts[0].trim();
      const alias = aliasParts[1]?.trim();

      const { phosphor, status } = mapName(lucideName);

      if (status === "missing") {
        result.missing.push(lucideName);
        // Keep original name as fallback
        phosphorNames.push(alias ? `${lucideName} as ${alias}` : lucideName);
      } else {
        if (status === "mapped") result.mapped.push(`${lucideName} → ${phosphor}`);
        else result.identical.push(lucideName);

        // If name changed and no existing alias, we need to alias it back
        // so component references in JSX still work
        if (phosphor !== lucideName && !alias) {
          phosphorNames.push(`${phosphor} as ${lucideName}`);
        } else if (alias) {
          // original alias: PhosphorName as Alias
          phosphorNames.push(phosphor !== lucideName ? `${phosphor} as ${alias}` : `${phosphor} as ${alias}`);
        } else {
          phosphorNames.push(phosphor);
        }
      }
    }

    const newImport = `import { ${phosphorNames.join(", ")} } from "@phosphor-icons/react"`;
    newSource = newSource.replace(fullMatch, newImport);
    result.changed = true;
  }

  if (result.changed && !DRY_RUN) {
    fs.writeFileSync(filePath, newSource, "utf8");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`\n🔍 Scanning ${TARGET_DIR} ${DRY_RUN ? "(DRY RUN)" : ""}\n`);

const files = walk(path.resolve(TARGET_DIR));
const results: FileResult[] = [];
let totalMapped = 0;
let totalIdentical = 0;
const allMissing: { file: string; icon: string }[] = [];

for (const file of files) {
  const result = migrateFile(file);
  if (result.changed || result.missing.length > 0) {
    results.push(result);
    totalMapped += result.mapped.length;
    totalIdentical += result.identical.length;
    for (const m of result.missing) {
      allMissing.push({ file: path.relative(process.cwd(), file), icon: m });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log("═".repeat(60));
console.log("  MIGRATION REPORT");
console.log("═".repeat(60));

if (results.length === 0) {
  console.log("  No lucide-react imports found.");
} else {
  for (const r of results) {
    const rel = path.relative(process.cwd(), r.file);
    console.log(`\n  📄 ${rel}`);
    if (r.mapped.length)    console.log(`     ✅ renamed : ${r.mapped.join(", ")}`);
    if (r.identical.length) console.log(`     ➡️  kept    : ${r.identical.join(", ")}`);
    if (r.missing.length)   console.log(`     ⚠️  missing : ${r.missing.join(", ")}`);
  }

  console.log("\n" + "─".repeat(60));
  console.log(`  ✅ ${totalMapped} icons renamed`);
  console.log(`  ➡️  ${totalIdentical} icons kept as-is (names match)`);
  console.log(`  ⚠️  ${allMissing.length} icons need manual review`);

  if (allMissing.length > 0) {
    console.log("\n  Icons with no known Phosphor equivalent:");
    for (const { file, icon } of allMissing) {
      console.log(`     ${icon}  (in ${file})`);
    }
    console.log("\n  → Check https://phosphoricons.com to find alternatives.");
  }
}

if (!DRY_RUN && results.some((r) => r.changed)) {
  console.log("\n📦 Installing @phosphor-icons/react ...");
  try {
    execSync("npm install @phosphor-icons/react", { stdio: "inherit" });
    console.log("✅ Package installed.\n");
  } catch {
    console.log("⚠️  Auto-install failed. Run manually: npm install @phosphor-icons/react\n");
  }
}

if (WEIGHT) {
  console.log(`\n💡 You set --weight ${WEIGHT}. To apply globally, wrap your app in:`);
  console.log(`   <IconContext.Provider value={{ weight: "${WEIGHT}" }}>`);
  console.log(`     <App />`);
  console.log(`   </IconContext.Provider>`);
  console.log(`   import { IconContext } from "@phosphor-icons/react"\n`);
}

console.log(DRY_RUN ? "\n⚠️  DRY RUN — no files were modified.\n" : "\n🎉 Done. Do a quick grep for lucide-react to confirm cleanup.\n");
