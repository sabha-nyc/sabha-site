import Link from "next/link";
import { redirect } from "next/navigation";
import { createElement as h } from "react";
import { Logo } from "@/components/Logo";
import { SwipeTabs } from "@/components/SwipeTabs";
import { hasAccess } from "@/lib/access";
import { dinnerBySlug, seatsRemaining } from "@/lib/dinners";
import { longDate, money, time } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The dinner, as facts. Neighbourhood only until payment clears.
 * Only reachable with a valid code cookie — a guessed slug returns the same
 * page as a wrong code.
 *
 * Two panels — Details and About — swipeable on touch, side by side on
 * wide screens. Built with createElement rather than JSX in the parts
 * that changed here; everything else is untouched.
 */
export default async function DinnerPage({ params }: { params: Promise<{ slug: string }> }) {
      const { slug } = await params;
      const dinner = await dinnerBySlug(slug);
      if (!dinner || dinner.status === "draft") redirect("/?e=1");
      if (dinner.requires_code && !(await hasAccess(slug))) redirect("/?e=1");

  const remaining = await seatsRemaining(dinner.id);
      const closed = dinner.status === "closed";
      if (remaining <= 0 && !closed) redirect(`/d/${slug}/full`);

  function row(label: string, value: string) {
          return h(
                    "div",
              { className: "rw", key: label },
                    h("span", { className: "k" }, label),
                    h("span", { className: "v" }, value)
                  );
  }

  const details = h(
          "div",
          null,
          h(
                    "dl",
              { className: "rows" },
                    row("Date", longDate(dinner.starts_at)),
                    row("Time", time(dinner.starts_at)),
                    row("Where", dinner.neighborhood ?? "Manhattan"),
                    row("Seat", money(dinner.price_cents))
                  ),
          closed
            ? h(
                          "div",
                          null,
                          h("p", { className: "seats" }, "Signups closed"),
                          h("p", { className: "fine" }, "The next dinner will have its own code.")
                        )
            : h(
                          "div",
                          null,
                          h(Link, { className: "btn", href: `/d/${slug}/signup` }, "Sign up"),
                          h("p", { className: "fine" }, "The address is shared once your seat is paid for.")
                        )
        );

  const about = h(
          "div",
      { className: "about-copy" },
          h(
                    "p",
                    null,
                    "Sabha is a project with the goal of bringing together people within our community around a shared meal to meet new people and enjoy an intimate evening with amazing food. Dinner will be a five course service with plenty of wine to go around and we look forward to having you join our table."
                  )
        );

  return h(
          "main",
      { className: "scr scr--wide" },
          h(Logo, null),
          h(SwipeTabs, { tabs: ["Details", "About"], panels: [details, about] }),
          h("div", { className: "grow" })
        );
}
