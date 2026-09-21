"use client";

import { createElement as h, useRef, useState, type ReactNode } from "react";

/**
 * Two panels, swipeable on touch, stacked into a grid on wide screens.
 * The tab row is a click/tap affordance on top of native scroll-snap —
 * swiping works with no JS at all; this just adds the label row and
 * keeps it in sync with where the scroll lands.
 *
 * Built with createElement instead of JSX — kept the two concerns
 * (what it renders vs. how it reads) separate on purpose here.
 */
export function SwipeTabs(props: {
    tabs: [string, string];
  panels: [ReactNode, ReactNode];
}) {
    const tabs = props.tabs;
    const panels = props.panels;
    const trackRef = useRef<HTMLDivElement>(null);
    const active = useState(0);
    const activeIndex = active[0];
    const setActive = active[1];

  function goTo(i: number) {
        const el = trackRef.current;
        if (!el) return;
        el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
        setActive(i);
  }

  function onScroll() {
        const el = trackRef.current;
        if (!el || el.clientWidth === 0) return;
        setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  const tabButtons = tabs.map(function (label, i) {
        const cls = "swipe-tab" + (activeIndex === i ? " active" : "");
        return h(
                "button",
          { key: label, type: "button", className: cls, onClick: function () { goTo(i); } },
                label
              );
  });

  return h(
        "div",
    { className: "swipe-shell" },
        h("div", { className: "swipe-tabs" }, tabButtons),
        h(
                "div",
          { className: "swipe-track", ref: trackRef, onScroll: onScroll },
                h("div", { className: "swipe-panel" }, panels[0]),
                h("div", { className: "swipe-panel" }, panels[1])
              )
      );
}
