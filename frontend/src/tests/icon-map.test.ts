import { describe, expect, it } from "vitest";
import { Folder } from "lucide-react";
import { getIcon, iconMap, iconNames } from "../lib/icon-map";

describe("icon-map", () => {
  it("resolves the GitHub icon entry used by the resource type data", () => {
    expect(iconNames).toContain("Github");
    expect(iconMap.Github).toBeDefined();
    expect(getIcon("Github")).toBe(iconMap.Github);
  });

  it("falls back to Folder for unknown icon names", () => {
    expect(getIcon("does-not-exist")).toBe(Folder);
  });
});
