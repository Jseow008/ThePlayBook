"use client";

import { useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem } from "@/types/database";

export function PersonalizedTopicsRow() {
  const user = useAuthUser();
  const [items, setItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const preferencesResponse = await fetch("/api/onboarding/preferences");
        if (!preferencesResponse.ok) return;
        const { topicKeys } = (await preferencesResponse.json()) as {
          topicKeys: string[];
        };
        if (topicKeys.length === 0) return;
        const contentResponse = await fetch(
          `/api/onboarding/starter-content?topics=${encodeURIComponent(topicKeys.join(","))}`,
        );
        if (!contentResponse.ok) return;
        const { items: nextItems } = (await contentResponse.json()) as {
          items: ContentItem[];
        };
        if (!cancelled) setItems(nextItems);
      } catch (error) {
        console.error("Failed to load personalized topics", error);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <ContentLane
      title="For You"
      items={items}
      cardTitleDensity="app-compact"
      showCardDesktopQuickActions
      showCardUserCompletionBadge
    />
  );
}
