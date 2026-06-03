import * as lucideIcons from "lucide-react";
import {
  Bell,
  Book,
  Bookmark,
  Box,
  Briefcase,
  Calendar,
  Clock,
  Cloud,
  Code,
  Coffee,
  Cpu,
  Database,
  FileText,
  Filter,
  Flag,
  Folder,
  Globe,
  Heart,
  Home,
  Image,
  Layers,
  Layout,
  Link,
  Mail,
  Map,
  Music,
  Phone,
  Search,
  Server,
  Settings,
  Shield,
  Star,
  Tag,
  Terminal,
  User,
  Users,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function isLucideIcon(candidate: unknown): candidate is LucideIcon {
  return typeof candidate === "function";
}

function resolveLucideIcon(name: string): LucideIcon | undefined {
  const candidate = Reflect.get(lucideIcons, name);
  return isLucideIcon(candidate) ? candidate : undefined;
}

const githubIcon =
  resolveLucideIcon("Github") ?? resolveLucideIcon("GitHub") ?? Folder;

export const iconMap = {
  Bell,
  Book,
  Bookmark,
  Box,
  Briefcase,
  Calendar,
  Clock,
  Cloud,
  Code,
  Coffee,
  Cpu,
  Database,
  FileText,
  Filter,
  Flag,
  Folder,
  Github: githubIcon,
  Globe,
  Heart,
  Home,
  Image,
  Layers,
  Layout,
  Link,
  Mail,
  Map,
  Music,
  Phone,
  Search,
  Server,
  Settings,
  Shield,
  Star,
  Tag,
  Terminal,
  User,
  Users,
  Video,
  Wrench,
  Zap,
} satisfies Record<string, LucideIcon>;

export const iconNames = Object.keys(iconMap) as Array<keyof typeof iconMap>;

export const getIcon = (name: string): LucideIcon => {
  return iconMap[name as keyof typeof iconMap] ?? Folder;
};
